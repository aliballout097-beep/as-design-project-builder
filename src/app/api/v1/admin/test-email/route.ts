import { z } from "zod";
import { authorize } from "@/lib/auth/guard";
import { getRepository } from "@/lib/db";
import { getConfig } from "@/lib/env";
import { ApiError, jsonOk, readJson, route } from "@/lib/http";
import { adminNewLeadEmail, clientProposalEmail } from "@/lib/email/messages";
import { sendMail, verifySmtp } from "@/lib/email/transport";
import { leadLinks } from "@/lib/pipeline/payloads";
import { proposalPdfFilename, renderProposalPdf } from "@/lib/pdf/render";
import { withArabicTranslation } from "@/lib/pdf/translation";
import { withPlans } from "@/lib/pricing/resolve-plans";

/**
 * POST /api/v1/admin/test-email — check the SMTP login and send real sample
 * emails, so the team can see exactly what lands in their inbox (and that it is
 * not in spam) without submitting a fake brief.
 *
 *   { kind: "lead" }                  → the new-lead alert, to ADMIN_NOTIFY_EMAILS
 *   { kind: "proposal", to?: email }  → the client proposal email + PDF for the latest
 *                                       proposal, to `to` (default: the admin inbox).
 *                                       Nothing is marked as sent.
 */

export const maxDuration = 120;

const TestSchema = z.object({
  kind: z.enum(["lead", "proposal"]).default("lead"),
  to: z.email().optional(),
});

export const POST = route(async (request) => {
  await authorize(request, ["admin"]);
  const { kind, to } = await readJson(request, TestSchema, { maxBytes: 2048 });
  const config = getConfig();

  const check = await verifySmtp();
  if (!check.ok) throw new ApiError(502, "smtp_failed", `SMTP login failed: ${check.error}`);

  const repo = getRepository();
  const recipients = to ? [to] : config.email.adminRecipients;
  if (!recipients.length) throw new ApiError(400, "no_recipient", "Set ADMIN_NOTIFY_EMAILS or pass an address.");

  if (kind === "lead") {
    const { items } = await repo.listLeads({ limit: 1 });
    const lead = items[0];
    if (!lead) throw new ApiError(400, "no_lead", "No lead exists yet — submit a test brief from the Project Builder first.");
    const email = adminNewLeadEmail(lead, { appUrl: config.appUrl, admin: leadLinks(lead).admin });
    const result = await sendMail({ to: recipients, subject: `[Test] ${email.subject}`, html: email.html, text: email.text, replyTo: lead.contact.email });
    if (!result.ok) throw new ApiError(502, "send_failed", result.error);
    return jsonOk({ ok: true, kind, to: recipients, messageId: result.messageId });
  }

  const { items } = await repo.listProposals({ limit: 20 });
  const proposal = items.find((p) => p.status !== "superseded") ?? items[0];
  if (!proposal) throw new ApiError(400, "no_proposal", "No proposal exists yet — submit a test brief first.");
  const lead = await repo.getLead(proposal.leadId);
  if (!lead) throw new ApiError(404, "not_found", "Lead not found");
  const translated = await withPlans(await withArabicTranslation(proposal), lead);
  const shareUrl = `${config.appUrl}/p/${proposal.shareToken}`;
  const pdf = await renderProposalPdf({ proposal: translated, lead, shareUrl, arabic: translated.translations?.ar ?? null });
  const email = clientProposalEmail(lead, translated, { appUrl: config.appUrl, admin: leadLinks(lead).admin, proposal: shareUrl });
  const result = await sendMail({
    to: recipients,
    subject: `[Test] ${email.subject}`,
    html: email.html,
    text: email.text,
    attachments: [{ filename: proposalPdfFilename(lead, proposal), content: pdf, contentType: "application/pdf" }],
  });
  if (!result.ok) throw new ApiError(502, "send_failed", result.error);
  return jsonOk({ ok: true, kind, to: recipients, messageId: result.messageId });
});
