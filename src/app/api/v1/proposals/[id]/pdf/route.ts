import { authorize } from "@/lib/auth/guard";
import { getRepository } from "@/lib/db";
import { getConfig } from "@/lib/env";
import { ApiError, route } from "@/lib/http";
import { proposalPdfFilename, renderProposalPdf } from "@/lib/pdf/render";
import { withArabicTranslation } from "@/lib/pdf/translation";
import { withPlans } from "@/lib/pricing/resolve-plans";

/**
 * GET /api/v1/proposals/:id/pdf — render the proposal PDF (admin or n8n).
 * n8n's dispatch workflow downloads this and attaches it to the client email.
 * Add `?download=1` for an attachment disposition.
 */
export const GET = route<RouteContext<"/api/v1/proposals/[id]/pdf">>(async (request, context) => {
  await authorize(request, ["admin", "n8n"]);
  const { id } = await context.params;
  const repo = getRepository();
  let proposal = await repo.getProposal(id);
  if (!proposal) throw new ApiError(404, "not_found", "Proposal not found");
  const lead = await repo.getLead(proposal.leadId);
  if (!lead) throw new ApiError(404, "not_found", "Lead not found");

  proposal = await withPlans(await withArabicTranslation(proposal), lead);
  const pdf = await renderProposalPdf({
    proposal,
    lead,
    shareUrl: `${getConfig().appUrl}/p/${proposal.shareToken}`,
    arabic: proposal.translations?.ar ?? null,
  });
  const disposition = new URL(request.url).searchParams.get("download") ? "attachment" : "inline";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${proposalPdfFilename(lead, proposal)}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
