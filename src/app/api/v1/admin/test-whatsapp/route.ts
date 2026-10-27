import { z } from "zod";
import { authorize } from "@/lib/auth/guard";
import { getRepository } from "@/lib/db";
import { getConfig } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { ApiError, jsonOk, readJson, route } from "@/lib/http";
import { proposalPdfFilename } from "@/lib/pdf/render";
import { isShareable } from "@/lib/proposals";
import { sendProposalWhatsApp } from "@/lib/whatsapp";

/**
 * POST /api/v1/admin/test-whatsapp — send the real "proposal ready" WhatsApp
 * template (PDF + button) for the latest client-visible proposal to `to`, so
 * the template, token and phone-number id can be checked end to end.
 * Nothing is marked as sent.
 */

const TestSchema = z.object({ to: z.string().trim().min(6).max(32) });

export const POST = route(async (request) => {
  await authorize(request, ["admin"]);
  const { to } = await readJson(request, TestSchema, { maxBytes: 1024 });
  const config = getConfig();
  if (!config.whatsapp) throw new ApiError(400, "not_configured", "Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID first.");

  const repo = getRepository();
  const { items } = await repo.listProposals({ status: ["approved", "sent", "accepted", "declined"], limit: 1 });
  const proposal = items.find(isShareable);
  if (!proposal) throw new ApiError(400, "no_proposal", "No approved/sent proposal yet — WhatsApp needs a public PDF link to attach.");
  const lead = await repo.getLead(proposal.leadId);
  if (!lead) throw new ApiError(404, "not_found", "Lead not found");

  const result = await sendProposalWhatsApp({
    phone: to,
    firstName: lead.contact.name.trim().split(/\s+/)[0] ?? lead.contact.name,
    total: formatMoney(proposal.totals.total, proposal.currency),
    reference: lead.reference,
    pdfUrl: `${config.appUrl}/p/${proposal.shareToken}/pdf`,
    pdfFilename: proposalPdfFilename(lead, proposal),
    shareToken: proposal.shareToken,
  });
  if (!result.ok) throw new ApiError(502, "whatsapp_failed", result.error);
  return jsonOk({ ok: true, to: result.to, messageId: result.messageId });
});
