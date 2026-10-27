import type { Estimate } from "@/lib/pricing/estimate";
import type { Contact, LeadMeta, Plan, Project } from "@/lib/schemas/lead";
import type { ScopeAnalysis } from "@/lib/schemas/analysis";

/* ----------------------------------------------------------------------------
 * Leads
 * ------------------------------------------------------------------------- */

export const LEAD_STATUSES = ["new", "analyzing", "review", "approved", "sent", "won", "lost", "archived"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const OPEN_LEAD_STATUSES: LeadStatus[] = ["new", "analyzing", "review", "approved", "sent"];

export type LeadSource = LeadMeta["source"];

export interface CrmLinks {
  airtableRecordId?: string;
  notionPageId?: string;
  supabaseRecordId?: string;
  syncedAt?: string;
}

export interface LeadRecordMeta extends LeadMeta {
  ipHash: string | null;
  userAgent: string | null;
  consent: { privacy: true; marketing: boolean; at: string };
}

export interface Lead {
  id: string;
  reference: string;
  status: LeadStatus;
  source: LeadSource;
  contact: Contact;
  project: Project;
  plan: Plan;
  /** Server-computed indicative range from the rate card (what the client saw). */
  estimate: Estimate;
  fitScore: number | null;
  /** Recommended investment from the latest analysis / proposal. */
  estimatedValue: number | null;
  analysisError: string | null;
  tags: string[];
  notes: string | null;
  crm: CrmLinks;
  meta: LeadRecordMeta;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
}

/* ----------------------------------------------------------------------------
 * Analyses
 * ------------------------------------------------------------------------- */

export type AnalysisProvider = "anthropic" | "openai" | "heuristic";
export type AnalysisRunner = "app" | "n8n";

export interface AnalysisRecord {
  id: string;
  leadId: string;
  version: number;
  provider: AnalysisProvider;
  model: string | null;
  runner: AnalysisRunner;
  result: ScopeAnalysis;
  usage: Record<string, unknown> | null;
  instructions: string | null;
  /** Set when an AI provider failed and the rule-based estimator stepped in. */
  fallbackReason: string | null;
  durationMs: number | null;
  createdAt: string;
}

/* ----------------------------------------------------------------------------
 * Proposals
 * ------------------------------------------------------------------------- */

export const PROPOSAL_STATUSES = ["draft", "approved", "sent", "accepted", "declined", "superseded"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export type Billing = "one_time" | "monthly";

export interface ProposalLineItem {
  id: string;
  title: string;
  description: string;
  serviceKey: string;
  phase: string;
  price: number;
  billing: Billing;
  /** Optional items are presented as add-ons; `included` controls the totals. */
  optional: boolean;
  included: boolean;
}

export interface ProposalPhase {
  id: string;
  name: string;
  weeks: number;
  summary: string;
  milestones: string[];
}

export interface PaymentMilestone {
  label: string;
  percent: number;
}

export interface ProposalDiscount {
  type: "percent" | "amount";
  value: number;
  label: string | null;
}

export interface ProposalTotals {
  oneTimeSubtotal: number;
  discountAmount: number;
  oneTimeTotal: number;
  taxAmount: number;
  /** One-time total including tax — the headline investment. */
  total: number;
  monthlyTotal: number;
  optionalTotal: number;
  totalWeeks: number;
}

export interface ClientResponse {
  decision: "accepted" | "declined";
  name: string;
  note: string | null;
  at: string;
  /** The plan the client picked when accepting (proposals with plans). */
  plan?: { key: string; name: string; nameAr: string; price: number } | null;
}

/**
 * One of the 2–3 plans offered in a proposal (e.g. Starter / Business / Enterprise
 * website), priced from the studio's published packages. The client picks one
 * on the proposal page. The proposal's detailed scope and totals describe the
 * recommended plan.
 */
export interface ProposalPlan {
  /** Scope scale the plan is priced at: starter | standard | advanced | enterprise. */
  key: string;
  name: string;
  nameAr: string;
  /** Short client-facing line, Arabic. */
  summaryAr: string;
  /** One-time price the client pays (after the discount). */
  price: number;
  /** Price before the discount (equal to `price` when there is none). */
  listPrice: number;
  weeksMin: number;
  weeksMax: number;
  /** What's included, in Arabic and English. `heading` rows name a service (multi-service plans). */
  includes: { ar: string; en: string; heading?: boolean }[];
  recommended: boolean;
}

/** Arabic translation of the client-facing proposal text, cached on the proposal (see `src/lib/ai/translate.ts`). */
export interface ProposalArabicText {
  title: string;
  executiveSummary: string;
  approach: string;
  nextSteps: string[];
  notes: string | null;
  /** Positionally aligned with `Proposal.phases`. */
  phases: { name: string; summary: string }[];
  /** Positionally aligned with `Proposal.lineItems`. */
  lineItems: { title: string; description: string }[];
}

export interface ProposalTranslations {
  ar: ProposalArabicText;
  /** The `updatedAt` the translation was computed from — recomputed if the proposal changes after. */
  forUpdatedAt: string;
}

export interface Proposal {
  id: string;
  leadId: string;
  analysisId: string | null;
  version: number;
  status: ProposalStatus;
  title: string;
  executiveSummary: string;
  approach: string;
  lineItems: ProposalLineItem[];
  phases: ProposalPhase[];
  currency: string;
  discount: ProposalDiscount | null;
  taxRate: number;
  paymentSchedule: PaymentMilestone[];
  assumptions: string[];
  nextSteps: string[];
  /** Client-facing terms / closing note. */
  notes: string | null;
  totals: ProposalTotals;
  validUntil: string;
  shareToken: string;
  approvedAt: string | null;
  approvedBy: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  respondedAt: string | null;
  clientResponse: ClientResponse | null;
  /** Cached Arabic translation for the bilingual PDF, or `null` until first rendered. */
  translations: ProposalTranslations | null;
  /** Plans the client can choose from (null on older proposals). */
  plans: ProposalPlan[] | null;
  createdAt: string;
  updatedAt: string;
}

/* ----------------------------------------------------------------------------
 * Activity / event log (also the cursor for the real-time dashboard stream)
 * ------------------------------------------------------------------------- */

export const EVENT_TYPES = [
  "lead.created",
  "lead.updated",
  "lead.status_changed",
  "lead.note_added",
  "analysis.requested",
  "analysis.completed",
  "analysis.failed",
  "proposal.created",
  "proposal.updated",
  "proposal.approved",
  "proposal.sent",
  "proposal.viewed",
  "proposal.accepted",
  "proposal.declined",
  "pdf.generated",
  "notification.sent",
  "email.sent",
  "email.failed",
  "crm.synced",
  "webhook.failed",
  "custom",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface LeadEvent {
  id: number;
  leadId: string | null;
  proposalId: string | null;
  type: EventType;
  /** "client", "system", "n8n", "admin:<email>" */
  actor: string;
  data: Record<string, unknown>;
  createdAt: string;
}

/* ----------------------------------------------------------------------------
 * Dashboard
 * ------------------------------------------------------------------------- */

export interface LeadSummary {
  id: string;
  status: LeadStatus;
  estimatedValue: number | null;
  fitScore: number | null;
  createdAt: string;
}

export interface DashboardStats {
  totals: Record<LeadStatus, number>;
  newLast7Days: number;
  newPrev7Days: number;
  awaitingReview: number;
  pipelineValue: number;
  wonValue: number;
  winRate: number | null;
  avgFitScore: number | null;
  daily: { date: string; count: number }[];
}
