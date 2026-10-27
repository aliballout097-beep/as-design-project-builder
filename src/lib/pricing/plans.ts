import { FEATURE_MAP, ITEM_MAP, SCALE_KEYS, SERVICE_MAP, type Promo, type ScaleKey } from "@/config/catalog";
import { FEATURE_NAMES_AR, ITEM_NAMES_AR, SERVICE_NAMES_AR } from "@/config/catalog.ar";
import { PLAN_NAMES } from "@/config/plans";
import type { ProposalPlan } from "@/lib/types";
import { priceScope, type EstimateInput, type PricedScope } from "./estimate";
import { resolveIncludes, resolvePaymentsMinTier, type PricingOverrides } from "./overrides";

/**
 * The plans offered in a proposal: up to three consecutive plans around the
 * recommended one (e.g. Essential · Professional · Advanced), each priced by
 * `priceScope` exactly like the builder, with the current offer applied.
 * Plans that would cost the same as the previous one are dropped — a request
 * for a CV alone gets a single quote, social media management two plans.
 */

export type PlanInput = Omit<EstimateInput, "scale">;

const TIERS = SCALE_KEYS;
const rank = (tier: ScaleKey) => TIERS.indexOf(tier);

/** Up to `size` consecutive entries of `list` centred on `index` (clamped at the ends). */
function windowAround<T>(list: T[], index: number, size = 3): T[] {
  if (list.length <= size) return list;
  const start = Math.min(Math.max(index - 1, 0), list.length - size);
  return list.slice(start, start + size);
}

/** Every plan tier priced; a tier that costs the same as the previous kept one is dropped. */
export function distinctTiers(input: PlanInput, overrides?: PricingOverrides | null, promo?: Pick<Promo, "percent"> | null): PricedScope[] {
  const kept: PricedScope[] = [];
  for (const tier of TIERS) {
    const priced = priceScope({ ...input, scale: tier }, tier, overrides, { promo });
    const previous = kept[kept.length - 1];
    if (!previous || priced.list !== previous.list || priced.paymentsExcluded !== previous.paymentsExcluded) kept.push(priced);
  }
  return kept;
}

/**
 * The plan to recommend: the one whose regular price is closest to `listTotal`
 * (the analysed scope), never below the first plan with the payment gateway
 * when the client asked for online payments.
 */
export function pickRecommendedTier(listTotal: number, input: PlanInput, overrides?: PricingOverrides | null): ScaleKey {
  const tiers = distinctTiers(input, overrides);
  let best = tiers[0];
  for (const priced of tiers) if (Math.abs(priced.list - listTotal) < Math.abs(best.list - listTotal)) best = priced;
  if ((input.features ?? []).includes("payments") && best.paymentsExcluded) {
    best = tiers.find((p) => !p.paymentsExcluded) ?? best;
  }
  return best.tier;
}

/**
 * The plan the proposal recommends: the one the client picked in the builder
 * (the Essential plan unless they chose otherwise), moved up to the first plan
 * with the payment gateway when they asked for online payments.
 */
export function recommendedTierFor(input: PlanInput, picked: ScaleKey | undefined, overrides?: PricingOverrides | null): ScaleKey {
  const tiers = distinctTiers(input, overrides);
  let best = [...tiers].reverse().find((p) => rank(p.tier) <= rank(picked ?? "starter")) ?? tiers[0];
  if ((input.features ?? []).includes("payments") && best.paymentsExcluded) {
    best = tiers.find((p) => !p.paymentsExcluded) ?? best;
  }
  return best.tier;
}

const stripParens = (text: string) => text.replace(/\s*\([^)]*\)\s*$/, "");

/** What a plan includes, as short Arabic/English rows (plan cards, builder, PDF, email). */
export function includesFor(priced: PricedScope, overrides?: PricingOverrides | null): ProposalPlan["includes"] {
  const rows: ProposalPlan["includes"] = [];
  const serviceKeys = [...new Set(priced.lines.filter((l) => l.kind === "service" || l.kind === "item").map((l) => l.service!))];
  const multi = serviceKeys.length > 1;

  for (const key of serviceKeys) {
    if (multi) rows.push({ ar: SERVICE_NAMES_AR[key] ?? key, en: SERVICE_MAP[key]?.name ?? key, heading: true });
    const serviceLine = priced.lines.find((l) => l.kind === "service" && l.service === key);
    if (serviceLine?.tier) {
      const bullets = resolveIncludes(key, serviceLine.tier, overrides);
      bullets?.ar.slice(0, 6).forEach((ar, index) => rows.push({ ar, en: bullets.en[index] ?? ar }));
    }
    for (const line of priced.lines.filter((l) => l.kind === "item" && l.service === key)) {
      const qty = line.qty ?? 1;
      const times = qty > 1 ? ` × ${qty}` : "";
      rows.push({
        ar: `${ITEM_NAMES_AR[line.key as keyof typeof ITEM_NAMES_AR] ?? line.label}${times}`,
        en: `${ITEM_MAP[line.key as keyof typeof ITEM_MAP]?.name ?? line.label}${times}`,
      });
    }
  }
  for (const line of priced.lines.filter((l) => l.kind === "feature")) {
    const feature = FEATURE_MAP[line.key as keyof typeof FEATURE_MAP];
    // Drop parenthetical Latin like "(EN · AR · FR)" — it breaks right-to-left lines in the PDF.
    const ar = stripParens(FEATURE_NAMES_AR[line.key as keyof typeof FEATURE_NAMES_AR] ?? line.label);
    rows.push({ ar: `إضافة: ${ar}`, en: `Add-on: ${stripParens(feature?.name ?? line.label)}` });
  }
  if (priced.lines.some((l) => l.key === "extra-languages")) rows.push({ ar: "إضافة: لغة إضافية", en: "Add-on: additional language" });
  if (priced.paymentsExcluded) {
    const from = PLAN_NAMES[resolvePaymentsMinTier(overrides)];
    rows.push({
      ar: `الدفع عند الاستلام — بوابة الدفع الإلكتروني متاحة من ${from.ar}`,
      en: `Cash on delivery — the online payment gateway starts with the ${from.en} plan`,
    });
  }
  if (priced.typeFactor < 1) rows.push({ ar: "سعر مخفّض لأنه تعديل على عمل موجود", en: "Reduced price: edits to existing work" });
  return rows;
}

export function buildPlans(
  input: PlanInput,
  recommended: ScaleKey,
  overrides?: PricingOverrides | null,
  promo?: Pick<Promo, "percent"> | null,
): ProposalPlan[] {
  const tiers = distinctTiers(input, overrides, promo);
  // The kept plan that carries the recommended tier's price (the highest kept tier at or below it).
  let index = 0;
  tiers.forEach((priced, i) => {
    if (rank(priced.tier) <= rank(recommended)) index = i;
  });
  const chosen = windowAround(tiers, index);
  const single = chosen.length === 1;

  return chosen.map((priced) => ({
    key: priced.tier,
    name: single ? "Your quote" : PLAN_NAMES[priced.tier].en,
    nameAr: single ? "عرض السعر" : PLAN_NAMES[priced.tier].ar,
    summaryAr: single ? "كل ما طلبته بسعر واضح ونهائي" : PLAN_NAMES[priced.tier].summaryAr,
    price: priced.total,
    listPrice: priced.list,
    weeksMin: priced.weeksMin,
    weeksMax: priced.weeksMax,
    includes: includesFor(priced, overrides),
    recommended: priced === tiers[index],
  }));
}

/** The priced scope behind a plan key (for proposal line items). */
export function pricedPlan(input: PlanInput, tier: ScaleKey, overrides?: PricingOverrides | null, promo?: Pick<Promo, "percent"> | null): PricedScope {
  return priceScope({ ...input, scale: tier }, tier, overrides, { promo });
}
