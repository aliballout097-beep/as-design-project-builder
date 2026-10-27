import { z } from "zod";
import { CURRENCY, DEFAULT_PAYMENT_SCHEDULE, PROPOSAL_VALIDITY_DAYS } from "@/config/catalog";
import { createShareToken, shortId } from "@/lib/ids";
import type { ScopeAnalysis } from "@/lib/schemas/analysis";
import type { Proposal, ProposalDiscount, ProposalLineItem, ProposalPhase, ProposalPlan, ProposalTotals } from "@/lib/types";

/**
 * Proposal domain logic: building drafts from an analysis, computing totals,
 * and validating admin edits. Pure functions — shared by server and client.
 */

type TotalsInput = Pick<Proposal, "lineItems" | "phases" | "discount" | "taxRate">;

export function computeTotals(proposal: TotalsInput): ProposalTotals {
  const included = proposal.lineItems.filter((item) => item.included);
  const oneTimeSubtotal = included.filter((i) => i.billing === "one_time").reduce((s, i) => s + i.price, 0);
  const monthlyTotal = included.filter((i) => i.billing === "monthly").reduce((s, i) => s + i.price, 0);
  const optionalTotal = proposal.lineItems
    .filter((item) => !item.included && item.billing === "one_time")
    .reduce((s, i) => s + i.price, 0);

  let discountAmount = 0;
  if (proposal.discount && proposal.discount.value > 0) {
    discountAmount =
      proposal.discount.type === "percent"
        ? Math.round((oneTimeSubtotal * Math.min(proposal.discount.value, 100)) / 100)
        : Math.min(Math.round(proposal.discount.value), oneTimeSubtotal);
  }
  const oneTimeTotal = oneTimeSubtotal - discountAmount;
  const taxAmount = Math.round((oneTimeTotal * Math.max(0, proposal.taxRate)) / 100);

  return {
    oneTimeSubtotal,
    discountAmount,
    oneTimeTotal,
    taxAmount,
    total: oneTimeTotal + taxAmount,
    monthlyTotal,
    optionalTotal,
    totalWeeks: proposal.phases.reduce((s, p) => s + p.weeks, 0),
  };
}

/** Phases with their start week (cumulative), for timeline / Gantt rendering. */
export function phaseOffsets<T extends { weeks: number }>(phases: T[]): (T & { start: number })[] {
  return phases.reduce<(T & { start: number })[]>((acc, phase) => {
    const previous = acc.at(-1);
    acc.push({ ...phase, start: previous ? previous.start + previous.weeks : 0 });
    return acc;
  }, []);
}

/** Amount due per payment milestone (the last milestone absorbs rounding). */
export function paymentBreakdown(total: number, schedule: Proposal["paymentSchedule"]) {
  let allocated = 0;
  return schedule.map((milestone, index) => {
    const amount =
      index === schedule.length - 1 ? total - allocated : Math.round((total * milestone.percent) / 100);
    allocated += amount;
    return { ...milestone, amount };
  });
}

export type NewProposal = Omit<Proposal, "id" | "createdAt" | "updatedAt">;

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function buildProposalDraft(params: {
  leadId: string;
  analysisId: string | null;
  analysis: ScopeAnalysis;
  version: number;
  /** Discount line (the current promotion) — see src/lib/pricing/lines.ts. */
  discount?: ProposalDiscount | null;
  /** Line items priced by the rate card (see src/lib/pricing/lines.ts); defaults to the analysis deliverables. */
  lineItems?: Omit<ProposalLineItem, "id">[] | null;
  /** Plans the client can choose from — see src/lib/pricing/plans.ts. */
  plans?: ProposalPlan[] | null;
  now?: Date;
}): NewProposal {
  const { analysis } = params;
  const now = params.now ?? new Date();

  const phases: ProposalPhase[] = analysis.timeline.phases.map((phase) => ({
    id: shortId("ph"),
    name: phase.name,
    weeks: phase.weeks,
    summary: phase.summary,
    milestones: phase.milestones,
  }));

  const lineItems: ProposalLineItem[] = params.lineItems?.length
    ? params.lineItems.map((item) => ({ ...item, id: shortId("li") }))
    : analysis.deliverables.map((item) => ({
        id: shortId("li"),
        title: item.title,
        description: item.description,
        serviceKey: item.serviceKey,
        phase: item.phase,
        price: item.price,
        billing: item.billing,
        optional: item.optional,
        included: !item.optional,
      }));

  const draft = {
    leadId: params.leadId,
    analysisId: params.analysisId,
    version: params.version,
    status: "draft" as const,
    title: analysis.proposal.title,
    executiveSummary: analysis.proposal.executiveSummary,
    approach: analysis.proposal.approach,
    lineItems,
    phases,
    currency: analysis.budget.currency || CURRENCY,
    discount: params.discount ?? null,
    taxRate: 0,
    paymentSchedule: DEFAULT_PAYMENT_SCHEDULE.map((m) => ({ ...m })),
    assumptions: analysis.assumptions,
    nextSteps: analysis.proposal.nextSteps,
    notes: null,
    validUntil: addDays(now, PROPOSAL_VALIDITY_DAYS).toISOString().slice(0, 10),
    shareToken: createShareToken(),
    approvedAt: null,
    approvedBy: null,
    sentAt: null,
    viewedAt: null,
    respondedAt: null,
    clientResponse: null,
    translations: null,
    plans: params.plans ?? null,
  };
  return { ...draft, totals: computeTotals(draft) };
}

export function isProposalExpired(proposal: Pick<Proposal, "validUntil">, now = new Date()): boolean {
  return new Date(`${proposal.validUntil}T23:59:59Z`).getTime() < now.getTime();
}

/** Proposals a client may open through their share link. */
export function isShareable(proposal: Pick<Proposal, "status">): boolean {
  return ["approved", "sent", "accepted", "declined"].includes(proposal.status);
}

/* ----------------------------------------------------------------------------
 * Admin edits
 * ------------------------------------------------------------------------- */

const text = (max: number) => z.string().trim().max(max);

export const LineItemInputSchema = z.object({
  id: z.string().max(40).optional(),
  title: text(200).min(1, "Line item title is required"),
  description: text(1000).default(""),
  serviceKey: text(60).default("other"),
  phase: text(120).default(""),
  price: z.number().min(0).max(10_000_000),
  billing: z.enum(["one_time", "monthly"]).default("one_time"),
  optional: z.boolean().default(false),
  included: z.boolean().default(true),
});

export const PhaseInputSchema = z.object({
  id: z.string().max(40).optional(),
  name: text(120).min(1, "Phase name is required"),
  weeks: z.number().min(0.5).max(104),
  summary: text(1000).default(""),
  milestones: z.array(text(200)).max(10).default([]),
});

export const ProposalPatchSchema = z
  .object({
    title: text(200).min(1),
    executiveSummary: text(6000),
    approach: text(6000),
    lineItems: z.array(LineItemInputSchema).max(60),
    phases: z.array(PhaseInputSchema).min(1).max(12),
    currency: z.string().trim().length(3).toUpperCase(),
    discount: z
      .object({
        type: z.enum(["percent", "amount"]),
        value: z.number().min(0).max(10_000_000),
        label: text(120).nullable().default(null),
      })
      .nullable(),
    taxRate: z.number().min(0).max(50),
    paymentSchedule: z
      .array(z.object({ label: text(120).min(1), percent: z.number().min(0).max(100) }))
      .min(1)
      .max(8)
      .refine((list) => Math.abs(list.reduce((s, m) => s + m.percent, 0) - 100) < 0.01, {
        message: "Payment schedule must add up to 100%",
      }),
    assumptions: z.array(text(500)).max(20),
    nextSteps: z.array(text(300)).max(10),
    notes: text(4000).nullable(),
    validUntil: z.iso.date(),
  })
  .partial();

export type ProposalPatch = z.output<typeof ProposalPatchSchema>;

/** Apply a validated patch, assigning ids to new rows and recomputing totals. */
export function applyProposalPatch(proposal: Proposal, patch: ProposalPatch): Proposal {
  const next: Proposal = {
    ...proposal,
    ...patch,
    lineItems: patch.lineItems
      ? patch.lineItems.map((item) => ({ ...item, id: item.id ?? shortId("li") }))
      : proposal.lineItems,
    phases: patch.phases ? patch.phases.map((phase) => ({ ...phase, id: phase.id ?? shortId("ph") })) : proposal.phases,
    discount: patch.discount === undefined ? proposal.discount : patch.discount,
    notes: patch.notes === undefined ? proposal.notes : patch.notes,
  };
  return { ...next, totals: computeTotals(next) };
}
