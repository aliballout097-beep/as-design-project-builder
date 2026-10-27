import "server-only";
import { BUDGET_MAP, CONTACT_METHODS, CURRENCY, labelFor, SERVICE_MAP, timelineLabel } from "@/config/catalog";
import { toAiBrief } from "@/lib/ai/brief";
import { getConfig } from "@/lib/env";
import { formatDate, formatMoney, formatRange, formatWeeks } from "@/lib/format";
import { paymentBreakdown } from "@/lib/proposals";
import type { Lead, Proposal } from "@/lib/types";

/**
 * Stable JSON contracts sent to n8n (documented in README → API reference). Treat
 * field removals as breaking changes for the workflow templates.
 */

export function leadLinks(lead: Pick<Lead, "id">, proposal?: Pick<Proposal, "id" | "shareToken"> | null) {
  const { appUrl } = getConfig();
  return {
    admin: `${appUrl}/admin/leads/${lead.id}`,
    ...(proposal
      ? {
          proposal: `${appUrl}/p/${proposal.shareToken}`,
          proposalPdf: `${appUrl}/p/${proposal.shareToken}/pdf`,
          proposalApi: `${appUrl}/api/v1/proposals/${proposal.id}`,
          proposalPdfApi: `${appUrl}/api/v1/proposals/${proposal.id}/pdf`,
        }
      : {}),
  };
}

export function leadPayload(lead: Lead) {
  const budget = BUDGET_MAP[lead.plan.budget];
  return {
    id: lead.id,
    reference: lead.reference,
    status: lead.status,
    source: lead.source,
    createdAt: lead.createdAt,
    contact: lead.contact,
    project: lead.project,
    plan: lead.plan,
    estimate: lead.estimate,
    fitScore: lead.fitScore,
    estimatedValue: lead.estimatedValue,
    crm: lead.crm,
    utm: lead.meta.utm,
    marketingOptIn: lead.meta.consent?.marketing ?? false,
    /** Pre-formatted strings for notifications and CRM fields. */
    display: {
      name: lead.contact.name,
      company: lead.contact.company ?? null,
      services: lead.project.services.map((key) => SERVICE_MAP[key]?.name ?? key).join(", "),
      budget: budget?.label ?? lead.plan.budget,
      timeline: timelineLabel(lead.plan),
      preferredContact: labelFor(CONTACT_METHODS, lead.contact.preferredContact),
      estimate: formatRange(lead.estimate.min, lead.estimate.max, CURRENCY),
      estimatedValue: lead.estimatedValue ? formatMoney(lead.estimatedValue, CURRENCY) : null,
    },
    /** Data-minimised brief for AI analysis (no contact details). */
    aiBrief: toAiBrief(lead),
  };
}

export function proposalPayload(proposal: Proposal) {
  return {
    id: proposal.id,
    leadId: proposal.leadId,
    version: proposal.version,
    status: proposal.status,
    title: proposal.title,
    executiveSummary: proposal.executiveSummary,
    approach: proposal.approach,
    currency: proposal.currency,
    lineItems: proposal.lineItems,
    phases: proposal.phases,
    discount: proposal.discount,
    taxRate: proposal.taxRate,
    totals: proposal.totals,
    paymentSchedule: paymentBreakdown(proposal.totals.total, proposal.paymentSchedule),
    assumptions: proposal.assumptions,
    nextSteps: proposal.nextSteps,
    notes: proposal.notes,
    validUntil: proposal.validUntil,
    approvedAt: proposal.approvedAt,
    approvedBy: proposal.approvedBy,
    sentAt: proposal.sentAt,
    clientResponse: proposal.clientResponse,
    /** The plans offered (the client picks one on the proposal page). */
    plans: proposal.plans,
    display: {
      total: formatMoney(proposal.totals.total, proposal.currency),
      monthly: proposal.totals.monthlyTotal ? `${formatMoney(proposal.totals.monthlyTotal, proposal.currency)}/month` : null,
      duration: formatWeeks(proposal.totals.totalWeeks),
      validUntil: formatDate(proposal.validUntil),
    },
  };
}

export function pipelinePayload(lead: Lead, proposal?: Proposal | null, extra: Record<string, unknown> = {}) {
  return {
    lead: leadPayload(lead),
    proposal: proposal ? proposalPayload(proposal) : null,
    links: leadLinks(lead, proposal),
    ...extra,
  };
}
