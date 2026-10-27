import { actorOf, authorize } from "@/lib/auth/guard";
import { getRepository } from "@/lib/db";
import { ApiError, jsonOk, readJson, route } from "@/lib/http";
import { recordEvent } from "@/lib/pipeline";
import { leadLinks, proposalPayload } from "@/lib/pipeline/payloads";
import { applyProposalPatch, ProposalPatchSchema } from "@/lib/proposals";

/**
 * GET   /api/v1/proposals/:id — full proposal + lead summary + links (admin or n8n).
 * PATCH /api/v1/proposals/:id — edit a draft/approved proposal (admin). Editing an
 *                               approved proposal returns it to draft for re-approval.
 */

export const GET = route<RouteContext<"/api/v1/proposals/[id]">>(async (request, context) => {
  await authorize(request, ["admin", "n8n"]);
  const { id } = await context.params;
  const repo = getRepository();
  const proposal = await repo.getProposal(id);
  if (!proposal) throw new ApiError(404, "not_found", "Proposal not found");
  const lead = await repo.getLead(proposal.leadId);
  if (!lead) throw new ApiError(404, "not_found", "Lead not found");
  return jsonOk({
    proposal: proposalPayload(proposal),
    lead: { id: lead.id, reference: lead.reference, status: lead.status, contact: lead.contact },
    links: leadLinks(lead, proposal),
  });
});

export const PATCH = route<RouteContext<"/api/v1/proposals/[id]">>(async (request, context) => {
  const principal = await authorize(request, ["admin"]);
  const { id } = await context.params;
  const patch = await readJson(request, ProposalPatchSchema);
  const repo = getRepository();
  const proposal = await repo.getProposal(id);
  if (!proposal) throw new ApiError(404, "not_found", "Proposal not found");
  if (proposal.status !== "draft" && proposal.status !== "approved") {
    throw new ApiError(409, "not_editable", `A ${proposal.status} proposal can no longer be edited — create a revision instead`);
  }

  const next = applyProposalPatch(proposal, patch);
  const reopened = proposal.status === "approved";
  const saved = await repo.updateProposal(id, {
    title: next.title,
    executiveSummary: next.executiveSummary,
    approach: next.approach,
    lineItems: next.lineItems,
    phases: next.phases,
    currency: next.currency,
    discount: next.discount,
    taxRate: next.taxRate,
    paymentSchedule: next.paymentSchedule,
    assumptions: next.assumptions,
    nextSteps: next.nextSteps,
    notes: next.notes,
    validUntil: next.validUntil,
    totals: next.totals,
    ...(reopened ? { status: "draft" as const, approvedAt: null, approvedBy: null } : {}),
  });
  await repo.updateLead(saved.leadId, { estimatedValue: saved.totals.total, ...(reopened ? { status: "review" as const } : {}) });
  await recordEvent({
    type: "proposal.updated",
    leadId: saved.leadId,
    proposalId: saved.id,
    actor: actorOf(principal),
    data: { fields: Object.keys(patch), total: saved.totals.total, reopened },
  });
  return jsonOk({ proposal: proposalPayload(saved) });
});
