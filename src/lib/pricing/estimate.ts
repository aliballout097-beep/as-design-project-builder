import {
  ITEMS,
  SCALE_KEYS,
  TIMELINE_MAP,
  effectiveTier,
  phasePlan,
  tierPrice,
  type FeatureKey,
  type ItemKey,
  type LanguageKey,
  type ProjectTypeKey,
  type Promo,
  type ScaleKey,
  type ServiceDefinition,
  type ServiceKey,
  type TimelineKey,
} from "@/config/catalog";
import {
  resolveFeatureMap,
  resolveItemMap,
  resolvePaymentsMinTier,
  resolveServiceMap,
  resolveTypeFactor,
  type PricingOverrides,
} from "./overrides";

/**
 * The one pricing engine. The builder's live price, every plan in a proposal,
 * the proposal's line items, the PDF and the AI's rate card all come from
 * `priceScope`, so they can never disagree.
 *
 * Pure and deterministic: runs in the browser, on the server and in tests.
 */

export interface EstimateInput {
  services: readonly ServiceKey[];
  features?: readonly FeatureKey[];
  /** Fixed-price items and their quantities, e.g. { logo: 1, stickers: 10 }. */
  items?: Partial<Record<ItemKey, number>>;
  projectType?: ProjectTypeKey;
  scale?: ScaleKey;
  timeline?: TimelineKey;
  languages?: readonly LanguageKey[];
}

export interface EstimateOptions {
  /** Active promotion (Settings → Promotion). `null`/omitted = no promo. */
  promo?: Pick<Promo, "percent"> | null;
}

export interface PricedLine {
  key: string;
  kind: "service" | "item" | "feature" | "adjustment";
  label: string;
  service?: ServiceKey;
  /** The plan tier a service line is priced at. */
  tier?: ScaleKey | null;
  qty?: number;
  unitPrice?: number;
  price: number;
  /** Counts towards the offer. */
  promo: boolean;
  /** Discount on this line: the plan's special offer, or the general promotion. */
  discountPercent?: number;
}

export interface PricedScope {
  tier: ScaleKey;
  lines: PricedLine[];
  /** Regular total. */
  list: number;
  /** The part of `list` that is discounted. */
  promoBase: number;
  /** `percent` is the effective discount on the discounted lines. */
  discount: { kind: "promo" | null; amount: number; percent: number; percents: number[] };
  /** What the client pays (one-time). */
  total: number;
  /** The client asked for the payment gateway but this plan doesn't include it. */
  paymentsExcluded: boolean;
  typeFactor: number;
  weeksMin: number;
  weeksMax: number;
  monthlyMin: number;
  monthlyMax: number;
}

const DEFAULT_TIMELINE: TimelineKey = "flexible";

/** Items selected for the scope, with each items-service falling back to its first item. */
export function scopeItems(input: Pick<EstimateInput, "services" | "items">): [ItemKey, number][] {
  const chosen = Object.entries(input.items ?? {}).filter(([, qty]) => typeof qty === "number" && qty > 0) as [ItemKey, number][];
  const result = new Map<ItemKey, number>(chosen.map(([key, qty]) => [key, Math.min(Math.round(qty), 100)]));
  for (const service of new Set(input.services)) {
    const serviceItems = ITEMS.filter((item) => item.service === service);
    if (serviceItems.length && !serviceItems.some((item) => result.has(item.key))) result.set(serviceItems[0].key, 1);
  }
  return [...result.entries()];
}

/** Services in the scope: the selected ones plus the parents of any chosen items. */
export function scopeServices(input: Pick<EstimateInput, "services" | "items">): ServiceKey[] {
  const services = new Set<ServiceKey>(input.services);
  for (const [key, qty] of Object.entries(input.items ?? {})) {
    const item = ITEMS.find((i) => i.key === key);
    if (item && typeof qty === "number" && qty > 0) services.add(item.service);
  }
  return [...services];
}

/** Delivery weeks for a service at a plan: from `weeks.min` (Essential) to `weeks.max` (top plan). */
export function serviceWeeks(service: ServiceDefinition, tier: ScaleKey): number {
  if (service.kind === "items") return service.weeks.min;
  const rank = SCALE_KEYS.indexOf(effectiveTier(service, tier) ?? tier);
  return service.weeks.min + ((service.weeks.max - service.weeks.min) * Math.max(0, rank)) / (SCALE_KEYS.length - 1);
}

const halfWeeks = (value: number) => Math.round(value * 2) / 2;

export function priceScope(input: EstimateInput, tier: ScaleKey, overrides?: PricingOverrides | null, options: EstimateOptions = {}): PricedScope {
  const serviceMap = resolveServiceMap(overrides);
  const featureMap = resolveFeatureMap(overrides);
  const itemMap = resolveItemMap(overrides);
  const services = scopeServices(input).map((key) => serviceMap[key]).filter(Boolean);
  const features = [...new Set(input.features ?? [])].map((key) => featureMap[key]).filter(Boolean);
  const timeline = TIMELINE_MAP[input.timeline ?? DEFAULT_TIMELINE] ?? TIMELINE_MAP[DEFAULT_TIMELINE];
  const typeFactor = resolveTypeFactor(input.projectType, overrides);
  const workFactor = timeline.priceMultiplier * typeFactor;
  const tierIndex = SCALE_KEYS.indexOf(tier);
  const paymentsFrom = SCALE_KEYS.indexOf(resolvePaymentsMinTier(overrides));
  const promoPercent = options.promo && options.promo.percent > 0 ? Math.min(Math.round(options.promo.percent), 90) : 0;

  const lines: PricedLine[] = [];
  for (const service of services) {
    if (service.kind !== "tiered") continue;
    const actual = effectiveTier(service, tier) ?? tier;
    const price = Math.round(tierPrice(service, tier) * workFactor);
    if (price <= 0) continue;
    // A plan's special offer wins over the general promotion.
    const offer = service.offers?.[actual];
    const percent = typeof offer === "number" ? Math.min(Math.max(offer, 0), 95) : service.promo ? promoPercent : 0;
    lines.push({ key: service.key, kind: "service", label: service.name, service: service.key, tier: actual, price, promo: percent > 0, discountPercent: percent });
  }
  for (const [key, qty] of scopeItems(input)) {
    const item = itemMap[key];
    if (!item) continue;
    const unitPrice = Math.round(item.price * workFactor);
    lines.push({ key, kind: "item", label: item.name, service: item.service, qty, unitPrice, price: unitPrice * qty, promo: false });
  }
  let paymentsExcluded = false;
  for (const feature of features) {
    if (feature.key === "payments" && tierIndex < paymentsFrom) {
      paymentsExcluded = true;
      continue;
    }
    if (feature.price <= 0) continue;
    lines.push({ key: feature.key, kind: "feature", label: feature.name, price: Math.round(feature.price), promo: false });
  }
  // Localisation effort for each extra language beyond the first (the multilingual add-on covers one).
  const extraLanguages = Math.max(0, new Set(input.languages ?? ["en"]).size - 1);
  const billableLanguages = features.some((f) => f.key === "multilingual") ? extraLanguages - 1 : extraLanguages;
  if (billableLanguages > 0 && services.some((s) => s.kind === "tiered")) {
    lines.push({
      key: "extra-languages",
      kind: "adjustment",
      label: `Localisation (+${billableLanguages} language${billableLanguages > 1 ? "s" : ""})`,
      qty: billableLanguages,
      unitPrice: featureMap.multilingual.price,
      price: Math.round(featureMap.multilingual.price * billableLanguages),
      promo: false,
    });
  }

  const list = lines.reduce((sum, line) => sum + line.price, 0);
  const discounted = lines.filter((line) => line.promo && (line.discountPercent ?? 0) > 0);
  const promoBase = discounted.reduce((sum, line) => sum + line.price, 0);
  const amount = discounted.reduce((sum, line) => sum + Math.round((line.price * (line.discountPercent ?? 0)) / 100), 0);
  const percents = [...new Set(discounted.map((line) => line.discountPercent ?? 0))].sort((a, b) => b - a);

  const monthlyMin = services.reduce((sum, s) => sum + (s.monthly?.min ?? 0), 0) + features.reduce((sum, f) => sum + (f.monthly ?? 0), 0);
  const monthlyMax = services.reduce((sum, s) => sum + (s.monthly?.max ?? 0), 0) + features.reduce((sum, f) => sum + (f.monthly ?? 0), 0);

  // Fast delivery: services run in parallel — the longest sets the pace, each other one adds a
  // quarter of its time, add-ons half of theirs. Never under a week.
  let weeksMin = 0;
  let weeksMax = 0;
  if (services.length) {
    const durations = services.map((service) => serviceWeeks(service, tier)).sort((a, b) => b - a);
    const [lead, ...others] = durations;
    const featureWeeks = features.filter((f) => !(f.key === "payments" && paymentsExcluded)).reduce((sum, f) => sum + f.weeks, 0) * 0.5;
    const raw = (lead + others.reduce((sum, w) => sum + w * 0.25, 0) + featureWeeks) * timeline.weeksMultiplier * (typeFactor < 1 ? Math.max(0.5, typeFactor) : 1);
    // Whole weeks read best for the client: "1–2 weeks", "2–3 weeks"…
    weeksMin = Math.max(1, Math.round(raw));
    weeksMax = weeksMin === 1 ? 2 : Math.ceil(weeksMin * 1.25);
  }

  return {
    tier,
    lines,
    list,
    promoBase,
    discount: { kind: amount > 0 ? "promo" : null, amount, percent: promoBase ? Math.round((amount / promoBase) * 100) : 0, percents },
    total: list - amount,
    paymentsExcluded,
    typeFactor,
    weeksMin,
    weeksMax,
    monthlyMin: Math.round(monthlyMin / 5) * 5,
    monthlyMax: Math.round(monthlyMax / 5) * 5,
  };
}

/** The delivery time a proposal commits to for a priced plan (mid-point, in half weeks). */
export const plannedWeeks = (priced: Pick<PricedScope, "weeksMin" | "weeksMax">) => Math.max(1, halfWeeks((priced.weeksMin + priced.weeksMax) / 2));

/* ----------------------------------------------------------------------------
 * The builder's live estimate (and the range stored with each lead)
 * ------------------------------------------------------------------------- */

export interface EstimateLine {
  key: string;
  label: string;
  kind: "service" | "feature" | "item" | "adjustment";
  min: number;
  max: number;
}

export interface Estimate {
  /** What the client pays, after any discount. */
  min: number;
  max: number;
  /** Regular (list) prices before the discount. */
  listMin?: number;
  listMax?: number;
  monthlyMin: number;
  monthlyMax: number;
  weeksMin: number;
  weeksMax: number;
  discountRate: number;
  /** Which discount `discountRate` is (older stored estimates don't have it). */
  discountKind?: "promo" | "bundle" | null;
  lines: EstimateLine[];
  phases: { key: string; name: string; weeks: number }[];
}

export function estimateProject(input: EstimateInput, overrides?: PricingOverrides | null, options: EstimateOptions = {}): Estimate {
  const priced = priceScope(input, input.scale ?? "starter", overrides, options);
  return {
    min: priced.total,
    max: priced.total,
    listMin: priced.list,
    listMax: priced.list,
    monthlyMin: priced.lines.length ? priced.monthlyMin : 0,
    monthlyMax: priced.lines.length ? priced.monthlyMax : 0,
    weeksMin: priced.weeksMin,
    weeksMax: priced.weeksMax,
    discountRate: priced.discount.percent / 100,
    discountKind: priced.discount.kind,
    lines: priced.lines.map((line) => ({ key: line.key, label: line.label, kind: line.kind, min: line.price, max: line.price })),
    phases: priced.lines.length ? phasePlan(plannedWeeks(priced)) : [],
  };
}
