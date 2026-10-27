import { actorOf, authorize } from "@/lib/auth/guard";
import { jsonOk, route } from "@/lib/http";
import { markProposalSent } from "@/lib/pipeline";
import { proposalPayload } from "@/lib/pipeline/payloads";

/** POST /api/v1/proposals/:id/mark-sent — record a manual send (e.g. when n8n dispatch is not configured). */
export const POST = route<RouteContext<"/api/v1/proposals/[id]/mark-sent">>(async (request, context) => {
  const principal = await authorize(request, ["admin"]);
  const { id } = await context.params;
  const { proposal } = await markProposalSent(id, actorOf(principal), { channel: "manual" });
  return jsonOk({ proposal: proposalPayload(proposal) });
});
