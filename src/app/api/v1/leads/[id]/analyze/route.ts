import { after } from "next/server";
import { z } from "zod";
import { actorOf, authorize } from "@/lib/auth/guard";
import { getRepository } from "@/lib/db";
import { getConfig } from "@/lib/env";
import { ApiError, jsonOk, readJson, route } from "@/lib/http";
import { requestAnalysis } from "@/lib/pipeline";

/**
 * POST /api/v1/leads/:id/analyze — (re)generate the AI scope analysis and a new
 * proposal draft. Optional `instructions` steer the revision
 * ("reduce scope to fit $10k", "add a phase-two roadmap"…).
 */

export const maxDuration = 300;

const AnalyzeSchema = z.object({ instructions: z.string().trim().max(2000).nullish() });

export const POST = route<RouteContext<"/api/v1/leads/[id]/analyze">>(async (request, context) => {
  const principal = await authorize(request, ["admin", "n8n"]);
  const { id } = await context.params;
  const { instructions } = await readJson(request, AnalyzeSchema);
  const lead = await getRepository().getLead(id);
  if (!lead) throw new ApiError(404, "not_found", "Lead not found");

  const runner = getConfig().analysisRunner;
  after(async () => {
    try {
      await requestAnalysis(lead, { trigger: "regenerate", actor: actorOf(principal), instructions: instructions ?? null });
    } catch (error) {
      console.error(`[analyze] regeneration failed for ${lead.reference}`, error);
    }
  });
  return jsonOk({ status: "queued", runner }, { status: 202 });
});
