import { z } from "zod";
import { actorOf, authorize } from "@/lib/auth/guard";
import { getRepository } from "@/lib/db";
import { ApiError, jsonOk, readJson, route } from "@/lib/http";
import { recordEvent, setLeadStatus, syncCrm } from "@/lib/pipeline";
import { leadLinks, leadPayload, proposalPayload } from "@/lib/pipeline/payloads";
import { LEAD_STATUSES } from "@/lib/types";

/**
 * GET    /api/v1/leads/:id — lead with analyses, proposals and recent activity (admin or n8n).
 * PATCH  /api/v1/leads/:id — update status, notes or tags (admin).
 * DELETE /api/v1/leads/:id — permanently delete a lead and its data (admin; GDPR requests).
 */

export const GET = route<RouteContext<"/api/v1/leads/[id]">>(async (request, context) => {
  await authorize(request, ["admin", "n8n"]);
  const { id } = await context.params;
  const repo = getRepository();
  const lead = await repo.getLead(id);
  if (!lead) throw new ApiError(404, "not_found", "Lead not found");
  const [analyses, proposals, events] = await Promise.all([
    repo.listAnalyses(id),
    repo.listProposals({ leadId: id, limit: 20 }),
    repo.listEvents({ leadId: id, limit: 50 }),
  ]);
  const current = proposals.items.find((p) => p.status !== "superseded") ?? proposals.items[0] ?? null;
  return jsonOk({
    lead: leadPayload(lead),
    analyses,
    proposals: proposals.items.map(proposalPayload),
    events,
    links: leadLinks(lead, current),
  });
});

const LeadPatchSchema = z
  .object({
    status: z.enum(LEAD_STATUSES),
    notes: z.string().trim().max(10_000).nullable(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20),
  })
  .partial();

export const PATCH = route<RouteContext<"/api/v1/leads/[id]">>(async (request, context) => {
  const principal = await authorize(request, ["admin"]);
  const { id } = await context.params;
  const patch = await readJson(request, LeadPatchSchema);
  const repo = getRepository();
  let lead = await repo.getLead(id);
  if (!lead) throw new ApiError(404, "not_found", "Lead not found");
  const actor = actorOf(principal);

  if (patch.notes !== undefined || patch.tags !== undefined) {
    lead = await repo.updateLead(id, {
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
    });
    if (patch.notes !== undefined) await recordEvent({ type: "lead.note_added", leadId: id, actor, data: {} });
  }
  if (patch.status && patch.status !== lead.status) {
    lead = await setLeadStatus(lead, patch.status, actor, { manual: true });
    await syncCrm(lead, "lead.status_changed");
  }
  return jsonOk({ lead: leadPayload(lead) });
});

export const DELETE = route<RouteContext<"/api/v1/leads/[id]">>(async (request, context) => {
  await authorize(request, ["admin"]);
  const { id } = await context.params;
  const repo = getRepository();
  const lead = await repo.getLead(id);
  if (!lead) throw new ApiError(404, "not_found", "Lead not found");
  await repo.deleteLead(id);
  return new Response(null, { status: 204 });
});
