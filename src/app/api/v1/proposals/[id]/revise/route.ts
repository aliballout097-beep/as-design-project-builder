import { actorOf, authorize } from "@/lib/auth/guard";
import { getRepository } from "@/lib/db";
import { ApiError, jsonOk, route } from "@/lib/http";
import { createShareToken } from "@/lib/ids";
import { recordEvent, setLeadStatus } from "@/lib/pipeline";
import { proposalPayload } from "@/lib/pipeline/payloads";
import { addDays, computeTotals } from "@/lib/proposals";
import { PROPOSAL_VALIDITY_DAYS } from "@/config/catalog";

/** POST /api/v1/proposals/:id/revise — copy a proposal into a new editable draft version. */
export const POST = route<RouteContext<"/api/v1/proposals/[id]/revise">>(async (request, context) => {
  const principal = await authorize(request, ["admin"]);
  const { id } = await context.params;
  const repo = getRepository();
  const source = await repo.getProposal(id);
  if (!source) throw new ApiError(404, "not_found", "Proposal not found");
  const lead = await repo.getLead(source.leadId);
  if (!lead) throw new ApiError(404, "not_found", "Lead not found");

  const version = await repo.nextProposalVersion(lead.id);
  const draft = await repo.createProposal({
    ...source,
    version,
    status: "draft",
    totals: computeTotals(source),
    validUntil: addDays(new Date(), PROPOSAL_VALIDITY_DAYS).toISOString().slice(0, 10),
    shareToken: createShareToken(),
    approvedAt: null,
    approvedBy: null,
    sentAt: null,
    viewedAt: null,
    respondedAt: null,
    clientResponse: null,
  });
  await repo.supersedeOpenProposals(lead.id, draft.id);
  await recordEvent({
    type: "proposal.created",
    leadId: lead.id,
    proposalId: draft.id,
    actor: actorOf(principal),
    data: { version: draft.version, revisedFrom: source.version, total: draft.totals.total },
  });
  if (!["won", "lost", "archived"].includes(lead.status)) await setLeadStatus(lead, "review", actorOf(principal));
  return jsonOk({ proposal: proposalPayload(draft) }, { status: 201 });
});
