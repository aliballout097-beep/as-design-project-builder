import { actorOf, authorize } from "@/lib/auth/guard";
import { jsonOk, route } from "@/lib/http";
import { approveProposal } from "@/lib/pipeline";
import { leadLinks, proposalPayload } from "@/lib/pipeline/payloads";

/**
 * POST /api/v1/proposals/:id/approve — admin approval. The app emails the PDF to
 * the client itself (EMAIL_DELIVERY=app) or hands the proposal to the n8n
 * "Client Dispatch & Alerts" workflow, which reports back with `proposal.sent`.
 */
export const POST = route<RouteContext<"/api/v1/proposals/[id]/approve">>(async (request, context) => {
  const principal = await authorize(request, ["admin"]);
  const { id } = await context.params;
  const result = await approveProposal(id, actorOf(principal));
  return jsonOk({
    proposal: proposalPayload(result.proposal),
    links: leadLinks(result.lead, result.proposal),
    dispatch: {
      delivered: result.dispatch.ok,
      configured: !result.dispatch.skipped,
      error: result.dispatch.error ?? null,
    },
    email: result.email,
  });
});
