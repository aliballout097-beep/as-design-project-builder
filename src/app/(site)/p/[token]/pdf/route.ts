import { getRepository } from "@/lib/db";
import { getConfig } from "@/lib/env";
import { ApiError, route } from "@/lib/http";
import { proposalPdfFilename, renderProposalPdf } from "@/lib/pdf/render";
import { isShareable } from "@/lib/proposals";
import { withPlans } from "@/lib/pricing/resolve-plans";

/** GET /p/:token/pdf — the client's PDF download (share-token access, approved proposals only). */
export const GET = route<RouteContext<"/p/[token]/pdf">>(async (_request, context) => {
  const { token } = await context.params;
  const repo = getRepository();
  const stored = await repo.getProposalByToken(token);
  if (!stored || !isShareable(stored)) throw new ApiError(404, "not_found", "Proposal not found");
  const lead = await repo.getLead(stored.leadId);
  if (!lead) throw new ApiError(404, "not_found", "Proposal not found");
  const proposal = await withPlans(stored, lead);

  // Same bilingual PDF as the email attachment (the Arabic translation is cached on the proposal).
  const pdf = await renderProposalPdf({ proposal, lead, shareUrl: `${getConfig().appUrl}/p/${token}`, arabic: proposal.translations?.ar ?? null });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${proposalPdfFilename(lead, proposal)}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
});
