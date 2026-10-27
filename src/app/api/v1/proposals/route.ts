import { z } from "zod";
import { actorOf, authorize } from "@/lib/auth/guard";
import { getRepository } from "@/lib/db";
import { ApiError, jsonOk, readJson, route } from "@/lib/http";
import { applyAnalysisResult } from "@/lib/pipeline";
import { leadLinks, proposalPayload } from "@/lib/pipeline/payloads";
import { parseAnalysis } from "@/lib/schemas/analysis";
import { PROPOSAL_STATUSES, type ProposalStatus } from "@/lib/types";

/**
 * GET  /api/v1/proposals — list proposals (admin session or n8n bearer).
 * POST /api/v1/proposals — n8n webhook target: submit an AI scope analysis for a
 *                          lead; the app normalises it, stores it, builds the
 *                          proposal draft and moves the lead to "review".
 *                          Idempotent via the `Idempotency-Key` header.
 */

export const GET = route(async (request) => {
  await authorize(request, ["admin", "n8n"]);
  const url = new URL(request.url);
  const status = (url.searchParams.get("status") ?? "")
    .split(",")
    .filter((value): value is ProposalStatus => (PROPOSAL_STATUSES as readonly string[]).includes(value));
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 200);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);
  const page = await getRepository().listProposals({
    leadId: url.searchParams.get("leadId") ?? undefined,
    status: status.length ? status : undefined,
    limit,
    offset,
  });
  return jsonOk({ items: page.items.map(proposalPayload), total: page.total, limit, offset });
});

const ProposalCallbackSchema = z
  .object({
    leadId: z.uuid().optional(),
    leadReference: z.string().trim().max(40).optional(),
    /** The structured analysis (object, or the raw JSON string returned by the model). */
    analysis: z.unknown(),
    provider: z.enum(["anthropic", "openai", "heuristic"]).default("anthropic"),
    model: z.string().max(120).nullish(),
    usage: z.record(z.string(), z.unknown()).nullish(),
    instructions: z.string().max(4000).nullish(),
    durationMs: z.number().int().nonnegative().nullish(),
  })
  .refine((body) => body.leadId || body.leadReference, { message: "leadId or leadReference is required" });

export const POST = route(async (request) => {
  const principal = await authorize(request, ["n8n"]);
  const body = await readJson(request, ProposalCallbackSchema, { maxBytes: 512 * 1024 });
  const repo = getRepository();

  const idempotencyKey = request.headers.get("idempotency-key")?.trim().slice(0, 200) || null;
  if (idempotencyKey) {
    const claim = await repo.claimIdempotencyKey(`proposals:${idempotencyKey}`, "proposals.create");
    if (claim.status === "done") {
      return jsonOk(claim.response, { status: 200, headers: { "Idempotent-Replayed": "true" } });
    }
    if (claim.status === "in_progress") {
      throw new ApiError(409, "in_progress", "A request with this Idempotency-Key is still being processed");
    }
  }

  try {
    const lead =
      (body.leadId ? await repo.getLead(body.leadId) : null) ??
      (body.leadReference ? await repo.getLeadByReference(body.leadReference) : null);
    if (!lead) throw new ApiError(404, "lead_not_found", "Lead not found");

    let raw = body.analysis;
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch {
        throw new ApiError(422, "invalid_analysis", "analysis is not valid JSON");
      }
    }
    let analysis;
    try {
      analysis = parseAnalysis(raw);
    } catch (error) {
      throw new ApiError(422, "invalid_analysis", "analysis does not match the scope analysis schema", z.flattenError(error as z.ZodError));
    }

    const result = await applyAnalysisResult({
      lead,
      analysis,
      provider: body.provider,
      model: body.model ?? null,
      usage: body.usage ?? null,
      runner: "n8n",
      instructions: body.instructions ?? null,
      fallbackReason: null,
      durationMs: body.durationMs ?? null,
      actor: actorOf(principal),
    });

    const response = {
      proposal: proposalPayload(result.proposal),
      analysisId: result.analysis.id,
      lead: { id: result.lead.id, reference: result.lead.reference, status: result.lead.status },
      links: leadLinks(result.lead, result.proposal),
    };
    if (idempotencyKey) await repo.completeIdempotencyKey(`proposals:${idempotencyKey}`, response);
    return jsonOk(response, { status: 201 });
  } catch (error) {
    if (idempotencyKey) await repo.releaseIdempotencyKey(`proposals:${idempotencyKey}`).catch(() => undefined);
    throw error;
  }
});
