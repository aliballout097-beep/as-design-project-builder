import { z } from "zod";
import { CURRENCY, SERVICE_KEYS } from "@/config/catalog";

/**
 * The structured output contract for the AI Scope & Budget Analysis.
 *
 * Constraints for structured outputs (Claude `output_config.format` and OpenAI
 * strict `json_schema`): every property is required (optional values are
 * `nullable`), objects are closed, and numeric/length limits are NOT expressed
 * as schema keywords — guidance lives in `.describe()` and the numbers are
 * clamped afterwards by `normalizeAnalysis()`.
 *
 * The same schema is embedded into the n8n "AI Scope Analysis" workflow by
 * `npm run n8n:build`, so both runners produce identical payloads.
 */

export const COMPLEXITY_LEVELS = ["low", "medium", "high", "very_high"] as const;
export const BUDGET_ALIGNMENTS = ["below", "within", "above", "unknown"] as const;
export const BILLING_TYPES = ["one_time", "monthly"] as const;
export const RISK_SEVERITIES = ["low", "medium", "high"] as const;

export const DeliverableSchema = z.object({
  title: z.string().describe("Client-facing deliverable name."),
  description: z.string().describe("One or two sentences describing what is delivered."),
  serviceKey: z.string().describe(`The rate-card service this belongs to: one of ${SERVICE_KEYS.join(", ")}, or "other".`),
  phase: z.string().describe("Exactly one of the timeline.phases[].name values."),
  price: z.number().describe("Price in the rate-card currency (whole number)."),
  billing: z.enum(BILLING_TYPES).describe('"monthly" only for recurring retainers; otherwise "one_time".'),
  optional: z
    .boolean()
    .describe("true for recommended add-ons/upsells that are NOT included in the recommended investment."),
  estimatedHours: z.number().nullable().describe("Rough effort estimate in hours, or null."),
});

export const PhaseSchema = z.object({
  name: z.string().describe("Phase name, e.g. 'Discovery & Strategy'."),
  weeks: z.number().describe("Duration in weeks (may be fractional, e.g. 1.5)."),
  summary: z.string().describe("What happens in this phase, client-facing."),
  milestones: z.array(z.string()).describe("2–4 concrete milestones or sign-off points."),
});

export const RiskSchema = z.object({
  title: z.string(),
  severity: z.enum(RISK_SEVERITIES),
  mitigation: z.string(),
});

export const ScopeAnalysisSchema = z.object({
  summary: z.string().describe("Internal 2–4 sentence summary of the opportunity for the studio team."),
  clientNeeds: z.array(z.string()).describe("3–6 key needs and objectives extracted from the brief."),
  projectType: z.string().describe("Short label, e.g. 'E-commerce launch + brand refresh'."),
  complexity: z.enum(COMPLEXITY_LEVELS),
  fitScore: z
    .number()
    .describe("0–100. How good a fit this lead is for the studio: budget realism, brief clarity, scope match, timeline feasibility."),
  fitRationale: z.string().describe("One or two sentences explaining the fit score."),
  budget: z.object({
    currency: z.string().describe("ISO 4217 code — use the rate-card currency."),
    estimateLow: z.number().describe("Low end of a realistic one-time investment range for this scope."),
    estimateHigh: z.number().describe("High end of a realistic one-time investment range for this scope."),
    recommended: z
      .number()
      .describe("Recommended one-time investment. Must equal the sum of non-optional one_time deliverable prices."),
    monthlyRecurring: z.number().describe("Sum of non-optional monthly deliverables, or 0."),
    clientBudgetLow: z.number().nullable().describe("Lower bound of the client's stated budget, or null if unknown."),
    clientBudgetHigh: z.number().nullable().describe("Upper bound of the client's stated budget, or null if open-ended/unknown."),
    alignment: z
      .enum(BUDGET_ALIGNMENTS)
      .describe('Recommended investment relative to the client budget: "below", "within", "above" or "unknown".'),
    notes: z.string().describe("How the recommendation relates to the client's budget, and levers to adjust it."),
  }),
  deliverables: z.array(DeliverableSchema).describe("Line items for the proposal, grouped by phase."),
  timeline: z.object({
    totalWeeks: z.number().describe("Total duration in weeks; equals the sum of phase weeks."),
    phases: z.array(PhaseSchema).describe("3–5 sequential delivery phases."),
  }),
  risks: z.array(RiskSchema).describe("Delivery or commercial risks, most important first."),
  assumptions: z.array(z.string()).describe("Scope assumptions the proposal relies on."),
  clarifyingQuestions: z.array(z.string()).describe("Questions to resolve on the discovery call."),
  proposal: z.object({
    title: z.string().describe("Client-facing proposal title."),
    executiveSummary: z
      .string()
      .describe("Client-facing, warm and specific: 1–2 short paragraphs on their goals and the proposed solution."),
    approach: z.string().describe("Client-facing description of how the studio will run the project."),
    nextSteps: z.array(z.string()).describe("3–4 next steps after the client accepts."),
  }),
});

export type ScopeAnalysis = z.output<typeof ScopeAnalysisSchema>;
export type Deliverable = z.output<typeof DeliverableSchema>;
export type AnalysisPhase = z.output<typeof PhaseSchema>;

/* ----------------------------------------------------------------------------
 * Normalisation — makes AI output internally consistent and safe to render.
 * ------------------------------------------------------------------------- */

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const money = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0);
const cleanList = (list: string[], max: number) =>
  list
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);

export function computeAlignment(
  recommended: number,
  low: number | null,
  high: number | null,
): (typeof BUDGET_ALIGNMENTS)[number] {
  if (low === null && high === null) return "unknown";
  if (high !== null && recommended > high * 1.1) return "above";
  if (low !== null && recommended < low * 0.9) return "below";
  return "within";
}

/**
 * Clamp scores, round money, reconcile totals and phase references. Idempotent.
 * The recommended investment is always recomputed from the included line items
 * so the dashboard, PDF and CRM can never disagree.
 */
export function normalizeAnalysis(input: ScopeAnalysis): ScopeAnalysis {
  const phases = input.timeline.phases
    .slice(0, 8)
    .map((phase) => ({
      name: phase.name.trim() || "Delivery",
      weeks: Math.round(clamp(phase.weeks || 0.5, 0.5, 52) * 2) / 2,
      summary: phase.summary.trim(),
      milestones: cleanList(phase.milestones, 6),
    }));
  if (phases.length === 0) {
    phases.push({ name: "Delivery", weeks: 4, summary: "Design, build and launch.", milestones: [] });
  }
  const phaseNames = new Set(phases.map((phase) => phase.name));
  const phaseByLowerName = new Map(phases.map((phase) => [phase.name.toLowerCase(), phase.name]));

  const deliverables = input.deliverables.slice(0, 40).map((item) => {
    const phase = phaseNames.has(item.phase)
      ? item.phase
      : (phaseByLowerName.get(item.phase.trim().toLowerCase()) ?? phases[0].name);
    return {
      title: item.title.trim() || "Deliverable",
      description: item.description.trim(),
      serviceKey: (SERVICE_KEYS as readonly string[]).includes(item.serviceKey) ? item.serviceKey : "other",
      phase,
      price: money(item.price),
      billing: item.billing,
      optional: item.optional,
      estimatedHours:
        item.estimatedHours === null || !Number.isFinite(item.estimatedHours)
          ? null
          : Math.max(0, Math.round(item.estimatedHours)),
    };
  });

  const recommended = deliverables
    .filter((d) => !d.optional && d.billing === "one_time")
    .reduce((sum, d) => sum + d.price, 0);
  const monthlyRecurring = deliverables
    .filter((d) => !d.optional && d.billing === "monthly")
    .reduce((sum, d) => sum + d.price, 0);

  const clientBudgetLow = input.budget.clientBudgetLow === null ? null : money(input.budget.clientBudgetLow);
  const clientBudgetHigh = input.budget.clientBudgetHigh === null ? null : money(input.budget.clientBudgetHigh);
  const estimateLow = Math.min(money(input.budget.estimateLow) || recommended, recommended);
  const estimateHigh = Math.max(money(input.budget.estimateHigh), recommended);

  return {
    summary: input.summary.trim(),
    clientNeeds: cleanList(input.clientNeeds, 8),
    projectType: input.projectType.trim(),
    complexity: input.complexity,
    fitScore: Math.round(clamp(Number.isFinite(input.fitScore) ? input.fitScore : 50, 0, 100)),
    fitRationale: input.fitRationale.trim(),
    budget: {
      currency: (input.budget.currency || CURRENCY).toUpperCase().slice(0, 3),
      estimateLow,
      estimateHigh,
      recommended,
      monthlyRecurring,
      clientBudgetLow,
      clientBudgetHigh,
      alignment: computeAlignment(recommended, clientBudgetLow, clientBudgetHigh),
      notes: input.budget.notes.trim(),
    },
    deliverables,
    timeline: {
      totalWeeks: phases.reduce((sum, phase) => sum + phase.weeks, 0),
      phases,
    },
    risks: input.risks.slice(0, 8).map((risk) => ({
      title: risk.title.trim(),
      severity: risk.severity,
      mitigation: risk.mitigation.trim(),
    })),
    assumptions: cleanList(input.assumptions, 12),
    clarifyingQuestions: cleanList(input.clarifyingQuestions, 10),
    proposal: {
      title: input.proposal.title.trim() || "Project proposal",
      executiveSummary: input.proposal.executiveSummary.trim(),
      approach: input.proposal.approach.trim(),
      nextSteps: cleanList(input.proposal.nextSteps, 6),
    },
  };
}

/** Parse + normalise untrusted analysis JSON (from n8n or a model response). */
export function parseAnalysis(input: unknown): ScopeAnalysis {
  return normalizeAnalysis(ScopeAnalysisSchema.parse(input));
}
