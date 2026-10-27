import {
  ASSETS,
  BUDGET_MAP,
  CURRENCY,
  FEATURE_MAP,
  GOALS,
  ITEM_MAP,
  LANGUAGES,
  labelFor,
  PROJECT_TYPES,
  SCALE_MAP,
  SERVICE_MAP,
  timelineLabel,
  type ItemKey,
} from "@/config/catalog";
import { PLAN_NAMES } from "@/config/plans";
import { resolveIncludes, resolveTypeFactor, type PricingOverrides } from "@/lib/pricing/overrides";
import { plannedWeeks } from "@/lib/pricing/estimate";
import { distinctTiers, recommendedTierFor } from "@/lib/pricing/plans";
import { leadScope } from "@/lib/pricing/scope";
import type { Lead } from "@/lib/types";

/**
 * The data-minimised brief sent to AI providers.
 *
 * Contact details (name, email, phone) are deliberately excluded — they are not
 * needed to scope the work. The same object is included in the n8n webhook
 * payload (`lead.aiBrief`) so both analysis runners send identical input.
 *
 * `pricing.plans` carries the exact regular price of every plan for this
 * client's scope, computed from the admin's rate card: the AI picks a plan and
 * writes the proposal around it, it never invents prices.
 */
export interface AiBrief {
  reference: string;
  submittedAt: string;
  client: {
    company: string | null;
    role: string | null;
    industry: string | null;
    country: string | null;
    website: string | null;
  };
  project: {
    type: string;
    name: string | null;
    services: { key: string; name: string }[];
    /** Fixed-price pieces with quantities (logo, packaging, stickers, reels, CV…). */
    items: { key: string; name: string; quantity: number }[];
    /** Work the client described but didn't select — already included in the plans below. */
    detectedFromDescription: { services: string[]; items: string[]; replaced: string[]; evidence: string[] } | null;
    description: string;
    goals: string[];
    audience: string | null;
    features: { key: string; name: string }[];
    scale: string;
    languages: string[];
    references: string[];
    existingAssets: string[];
  };
  budget: {
    range: string;
    min: number | null;
    max: number | null;
    currency: string;
    flexible: boolean;
  };
  timeline: {
    preference: string;
    deadline: string | null;
    /** The client's own delivery time in days, if they typed one. */
    requestedDays: number | null;
  };
  indicativeEstimate: {
    min: number;
    max: number;
    monthlyMin: number;
    monthlyMax: number;
    weeksMin: number;
    weeksMax: number;
  };
  pricing: {
    currency: string;
    note: string;
    /** The plan the client picked in the builder. */
    clientPickedPlan: string;
    /** The plan the proposal recommends (the client's pick, moved up for a requested payment gateway). */
    recommendedPlan: string;
    plans: {
      key: string;
      name: string;
      regularTotal: number;
      /** Delivery time the proposal commits to, in weeks (phases add up to it). */
      weeks: number;
      deliveryRange: string;
      lines: { item: string; price: number }[];
      includes: string[];
      paymentGatewayIncluded: boolean | null;
    }[];
  };
}

export function toAiBrief(lead: Lead, overrides?: PricingOverrides | null): AiBrief {
  const { project, plan, contact, estimate } = lead;
  const budget = BUDGET_MAP[plan.budget];
  const scope = leadScope(lead);
  const { scale, ...planInput } = scope.input;
  const typeFactor = resolveTypeFactor(project.type, overrides);
  const wantsPayments = project.features.includes("payments");
  const added = scope.added;
  const detected =
    added.services.length || added.items.length
      ? {
          services: added.services.map((key) => SERVICE_MAP[key]?.name ?? key),
          items: added.items.map((key) => ITEM_MAP[key]?.name ?? key),
          replaced: added.replaced.map((key) => SERVICE_MAP[key]?.name ?? key),
          evidence: added.evidence,
        }
      : null;

  return {
    reference: lead.reference,
    submittedAt: lead.createdAt,
    client: {
      company: contact.company ?? null,
      role: contact.role ?? null,
      industry: project.industry ?? null,
      country: contact.country ?? null,
      website: contact.website ?? null,
    },
    project: {
      type: `${labelFor(PROJECT_TYPES, project.type)}${typeFactor !== 1 ? ` (priced at ${Math.round(typeFactor * 100)}% of new work)` : ""}`,
      name: project.name ?? null,
      services: scope.input.services.map((key) => ({ key, name: SERVICE_MAP[key]?.name ?? key })),
      items: (Object.entries(scope.input.items) as [ItemKey, number][])
        .filter(([, qty]) => qty > 0)
        .map(([key, quantity]) => ({ key, name: ITEM_MAP[key]?.name ?? key, quantity })),
      detectedFromDescription: detected,
      description: project.description,
      goals: project.goals.map((key) => labelFor(GOALS, key)),
      audience: project.audience ?? null,
      features: project.features.map((key) => ({ key, name: FEATURE_MAP[key]?.name ?? key })),
      scale: SCALE_MAP[project.scale]?.name ?? project.scale,
      languages: project.languages.map((key) => labelFor(LANGUAGES, key)),
      references: project.references,
      existingAssets: project.assets.map((key) => labelFor(ASSETS, key)),
    },
    budget: {
      range: budget?.label ?? plan.budget,
      min: budget?.min ?? null,
      max: budget?.max ?? null,
      currency: CURRENCY,
      flexible: plan.budgetFlexible,
    },
    timeline: {
      preference: timelineLabel(plan),
      deadline: plan.deadline ?? null,
      requestedDays: plan.deliveryDays ?? null,
    },
    // Regular (pre-discount) price of what the client saw in the builder.
    indicativeEstimate: {
      min: estimate.listMin ?? estimate.min,
      max: estimate.listMax ?? estimate.max,
      monthlyMin: estimate.monthlyMin,
      monthlyMax: estimate.monthlyMax,
      weeksMin: estimate.weeksMin,
      weeksMax: estimate.weeksMax,
    },
    pricing: {
      currency: CURRENCY,
      note: "Exact regular prices for this client's scope, computed from the studio's current rate card. These are the only valid plans and totals.",
      clientPickedPlan: PLAN_NAMES[scale].en,
      recommendedPlan: PLAN_NAMES[recommendedTierFor(planInput, scale, overrides)].en,
      plans: distinctTiers(planInput, overrides).map((priced) => ({
        key: priced.tier,
        name: PLAN_NAMES[priced.tier].en,
        regularTotal: priced.list,
        weeks: plannedWeeks(priced),
        deliveryRange: `${priced.weeksMin}–${priced.weeksMax} weeks`,
        lines: priced.lines.map((line) => ({
          item: `${line.label}${line.tier ? ` — ${PLAN_NAMES[line.tier].en}` : ""}${line.qty && line.qty > 1 ? ` × ${line.qty}` : ""}`,
          price: line.price,
        })),
        includes: [...new Set(priced.lines.filter((l) => l.kind === "service" && l.tier).flatMap((l) => resolveIncludes(l.service!, l.tier!, overrides)?.en ?? []))],
        paymentGatewayIncluded: wantsPayments ? !priced.paymentsExcluded : null,
      })),
    },
  };
}

