import "server-only";
import { getRepository } from "@/lib/db";
import { getConfig } from "@/lib/env";
import { leadLinks } from "@/lib/pipeline/payloads";
import { proposalPdfFilename, renderProposalPdf } from "@/lib/pdf/render";
import { withArabicTranslation } from "@/lib/pdf/translation";
import { withPlans } from "@/lib/pricing/resolve-plans";
import { publishEvent } from "@/lib/realtime/bus";
import type { EventType, Lead, Proposal } from "@/lib/types";
import {
  adminDeliveryFailedEmail,
  adminNewLeadEmail,
  adminProposalSentEmail,
  adminResponseEmail,
  clientAcknowledgementEmail,
  clientProposalEmail,
  clientWelcomeEmail,
  type ComposedEmail,
  type DeliveryReport,
} from "./messages";
import { sendMail, type MailAttachment, type SendResult } from "./transport";

/**
 * Email delivery run by the app itself (EMAIL_DELIVERY=app, the default once
 * SMTP_USER / SMTP_PASS are set). Every send is logged to the lead's activity
 * feed as `email.sent` or `email.failed`, so the dashboard shows exactly what
 * reached whom.
 */

export function appSendsEmail(): boolean {
  return getConfig().email.delivery === "app";
}

async function logEvent(type: EventType, lead: Lead, proposal: Proposal | null, data: Record<string, unknown>) {
  try {
    const event = await getRepository().addEvent({ type, leadId: lead.id, proposalId: proposal?.id ?? null, actor: "system:email", data });
    publishEvent(event);
  } catch (error) {
    console.error("[email] could not record event", error);
  }
}

async function deliver(
  email: ComposedEmail,
  to: string | string[],
  lead: Lead,
  proposal: Proposal | null,
  options: { replyTo?: string; attachments?: MailAttachment[] } = {},
): Promise<SendResult> {
  const result = await sendMail({ to, subject: email.subject, html: email.html, text: email.text, replyTo: options.replyTo, attachments: options.attachments });
  const recipients = Array.isArray(to) ? to.join(", ") : to;
  if (result.ok) {
    await logEvent("email.sent", lead, proposal, { kind: email.kind, to: recipients, messageId: result.messageId, attempts: result.attempts, via: "smtp" });
  } else {
    await logEvent("email.failed", lead, proposal, { kind: email.kind, to: recipients, error: result.error.slice(0, 500), attempts: result.attempts });
  }
  return result;
}

function links(lead: Lead, proposal: Proposal | null) {
  const all = leadLinks(lead, proposal);
  return { appUrl: getConfig().appUrl, admin: all.admin, proposal: all.proposal };
}

/** New brief → alert the team (reply goes straight to the client) and, optionally, acknowledge the client. */
export async function emailNewLead(lead: Lead, options: { acknowledgeClient: boolean }): Promise<void> {
  const { adminRecipients } = getConfig().email;
  const tasks: Promise<unknown>[] = [];
  if (adminRecipients.length) {
    tasks.push(deliver(adminNewLeadEmail(lead, links(lead, null)), adminRecipients, lead, null, { replyTo: lead.contact.email }));
  }
  if (options.acknowledgeClient) {
    tasks.push(deliver(clientAcknowledgementEmail(lead, links(lead, null)), lead.contact.email, lead, null));
  }
  await Promise.all(tasks);
}

export interface ProposalEmailOutcome {
  result: SendResult;
  /** The proposal with its cached Arabic translation (used for the PDF). */
  proposal: Proposal;
  attachment: MailAttachment | null;
}

/**
 * Render the proposal PDF (bilingual when an AI provider is configured) and
 * email it to the client. The team copy is sent separately, once every channel
 * (email, WhatsApp) has been tried — see `emailProposalTeamCopy`.
 */
export async function emailProposal(lead: Lead, proposal: Proposal): Promise<ProposalEmailOutcome> {
  // Translation first (it re-reads the proposal from the store), then the plans.
  const withTranslation = await withPlans(await withArabicTranslation(proposal), lead);
  const shareUrl = `${getConfig().appUrl}/p/${proposal.shareToken}`;
  let pdf: Buffer;
  try {
    pdf = await renderProposalPdf({ proposal: withTranslation, lead, shareUrl, arabic: withTranslation.translations?.ar ?? null });
  } catch (error) {
    const message = `PDF rendering failed: ${(error as Error).message}`;
    await logEvent("email.failed", lead, proposal, { kind: "client_proposal", to: lead.contact.email, error: message });
    return { result: { ok: false, error: message, attempts: 0 }, proposal: withTranslation, attachment: null };
  }
  const attachment: MailAttachment = { filename: proposalPdfFilename(lead, proposal), content: pdf, contentType: "application/pdf" };
  const l = { ...links(lead, proposal), proposal: shareUrl };
  const result = await deliver(clientProposalEmail(lead, withTranslation, l), lead.contact.email, lead, proposal, { attachments: [attachment] });
  return { result, proposal: withTranslation, attachment };
}

/** The team's copy of a delivered proposal (PDF attached), with how each channel went. */
export async function emailProposalTeamCopy(lead: Lead, outcome: ProposalEmailOutcome, report: DeliveryReport): Promise<void> {
  const { adminRecipients } = getConfig().email;
  if (!adminRecipients.length) return;
  const l = { ...links(lead, outcome.proposal), proposal: `${getConfig().appUrl}/p/${outcome.proposal.shareToken}` };
  await deliver(adminProposalSentEmail(lead, outcome.proposal, l, report), adminRecipients, lead, outcome.proposal, {
    replyTo: lead.contact.email,
    attachments: outcome.attachment ? [outcome.attachment] : undefined,
  });
}

/** Tell the team a proposal could not be delivered (after the retries in `sendMail`). */
export async function emailDeliveryFailed(lead: Lead, proposal: Proposal | null, error: string): Promise<void> {
  const { adminRecipients } = getConfig().email;
  if (!adminRecipients.length) return;
  await deliver(adminDeliveryFailedEmail(lead, proposal, error, links(lead, proposal)), adminRecipients, lead, proposal);
}

/** Client accepted/declined → alert the team; on acceptance, welcome the client. */
export async function emailProposalResponse(lead: Lead, proposal: Proposal): Promise<void> {
  const { adminRecipients } = getConfig().email;
  const l = { ...links(lead, proposal), proposal: `${getConfig().appUrl}/p/${proposal.shareToken}` };
  proposal = await withPlans(proposal, lead);
  const tasks: Promise<unknown>[] = [];
  if (adminRecipients.length) tasks.push(deliver(adminResponseEmail(lead, proposal, l), adminRecipients, lead, proposal, { replyTo: lead.contact.email }));
  if (proposal.status === "accepted") tasks.push(deliver(clientWelcomeEmail(lead, proposal, l), lead.contact.email, lead, proposal));
  await Promise.all(tasks);
}
