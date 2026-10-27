import { z } from "zod";
import {
  FEATURE_KEYS,
  FEATURES,
  ITEM_KEYS,
  ITEMS,
  PAYMENTS_MIN_TIER,
  PROJECT_TYPES,
  SCALE_KEYS,
  SERVICE_KEYS,
  SERVICES,
  type FeatureDefinition,
  type FeatureKey,
  type ItemDefinition,
  type ItemKey,
  type ProjectTypeKey,
  type ScaleKey,
  type ServiceDefinition,
  type ServiceKey,
} from "@/config/catalog";
import { PLAN_INCLUDES, type Bullets } from "@/config/plans";

/**
 * Admin-editable pricing (Settings → Pricing), stored as one JSON row.
 *
 * `catalog.ts` + `config/plans.ts` are the shipped defaults; these overrides
 * change what actually reaches clients — the builder's live price, every new
 * proposal and its plans, and the rate card the AI reads (in-app and n8n) —
 * without touching code or redeploying.
 */

const rangeSchema = z.object({ min: z.number().min(0), max: z.number().min(0) }).refine((r) => r.max >= r.min, "max must be ≥ min");
const tierPrice = z.number().min(0).max(1_000_000).nullable();
const bulletList = z.array(z.string().trim().min(1).max(200)).max(12);

export const ServiceOverrideSchema = z.object({
  /** Price per plan; `null` = this plan isn't offered for the service. */
  tiers: z.object({ starter: tierPrice, standard: tierPrice, advanced: tierPrice, enterprise: tierPrice }).partial().optional(),
  /** What each plan includes (Arabic bullets; English optional). */
  includes: z
    .object({
      starter: z.object({ ar: bulletList, en: bulletList.optional() }),
      standard: z.object({ ar: bulletList, en: bulletList.optional() }),
      advanced: z.object({ ar: bulletList, en: bulletList.optional() }),
      enterprise: z.object({ ar: bulletList, en: bulletList.optional() }),
    })
    .partial()
    .optional(),
  promo: z.boolean().optional(),
  /** Special discount % per plan (overrides the general promotion); `null` removes the default offer. */
  offers: z
    .object({
      starter: z.number().min(0).max(95).nullable(),
      standard: z.number().min(0).max(95).nullable(),
      advanced: z.number().min(0).max(95).nullable(),
      enterprise: z.number().min(0).max(95).nullable(),
    })
    .partial()
    .optional(),
  weeks: rangeSchema.optional(),
  monthly: rangeSchema.optional(),
});
export type ServiceOverride = z.infer<typeof ServiceOverrideSchema>;

export const FeatureOverrideSchema = z.object({
  price: z.number().min(0).optional(),
  weeks: z.number().min(0).optional(),
  monthly: z.number().min(0).optional(),
});
export type FeatureOverride = z.infer<typeof FeatureOverrideSchema>;

export const ItemOverrideSchema = z.object({ price: z.number().min(0).max(1_000_000) });

export const PricingOverridesSchema = z.object({
  services: z.record(z.string(), ServiceOverrideSchema).default({}),
  features: z.record(z.string(), FeatureOverrideSchema).default({}),
  items: z.record(z.string(), ItemOverrideSchema).default({}),
  /** Price factor per project type, e.g. { extend: 0.5 } = edits cost 50% of new work. */
  typeFactors: z.record(z.string(), z.number().min(0.05).max(3)).default({}),
  /** First plan that includes the online payment gateway. */
  paymentsMinTier: z.enum(SCALE_KEYS).optional(),
});
export type PricingOverrides = z.infer<typeof PricingOverridesSchema>;

export const EMPTY_OVERRIDES: PricingOverrides = { services: {}, features: {}, items: {}, typeFactors: {} };

/**
 * Drops keys that no longer match the current catalog (e.g. a service was
 * renamed/removed). Overrides saved by the first Pricing page (price *ranges*
 * per service, recognisable by having neither `items` nor `typeFactors`) don't
 * map onto per-plan prices, so they are ignored rather than distorting them.
 */
export function sanitizeOverrides(overrides: Partial<PricingOverrides> | null | undefined): PricingOverrides {
  if (!overrides || (!("items" in overrides) && !("typeFactors" in overrides))) return EMPTY_OVERRIDES;
  const keep = <T,>(record: Record<string, T> | undefined, keys: readonly string[]) =>
    Object.fromEntries(Object.entries(record ?? {}).filter(([key]) => keys.includes(key)));
  return {
    services: keep(overrides.services, SERVICE_KEYS),
    features: keep(overrides.features, FEATURE_KEYS),
    items: keep(overrides.items, ITEM_KEYS),
    typeFactors: keep(overrides.typeFactors, PROJECT_TYPES.map((t) => t.key)),
    ...(overrides.paymentsMinTier ? { paymentsMinTier: overrides.paymentsMinTier } : {}),
  };
}

function applyTierOverrides(service: ServiceDefinition, o: ServiceOverride): ServiceDefinition["tiers"] {
  const tiers = { ...service.tiers };
  if (o.tiers) {
    for (const tier of SCALE_KEYS) {
      if (!(tier in o.tiers)) continue;
      const value = o.tiers[tier];
      if (value === null || value === undefined) delete tiers[tier];
      else tiers[tier] = value;
    }
  }
  return tiers;
}

export function resolveServices(overrides?: PricingOverrides | null): ServiceDefinition[] {
  if (!overrides?.services || Object.keys(overrides.services).length === 0) return SERVICES;
  return SERVICES.map((service) => {
    const o = overrides.services[service.key];
    if (!o) return service;
    const tiers = service.kind === "tiered" ? applyTierOverrides(service, o) : service.tiers;
    const offers = { ...(service.offers ?? {}) };
    for (const tier of SCALE_KEYS) {
      if (!o.offers || !(tier in o.offers)) continue;
      const value = o.offers[tier];
      if (value === null || value === undefined || value <= 0) delete offers[tier];
      else offers[tier] = value;
    }
    const prices = Object.values(tiers).filter((v): v is number => typeof v === "number");
    return {
      ...service,
      tiers,
      offers,
      ...(prices.length ? { price: { min: Math.min(...prices), max: Math.max(...prices) } } : {}),
      ...(o.promo !== undefined ? { promo: o.promo } : {}),
      ...(o.weeks ? { weeks: o.weeks } : {}),
      ...(o.monthly && service.monthly ? { monthly: { ...service.monthly, ...o.monthly } } : {}),
    };
  });
}

export function resolveFeatures(overrides?: PricingOverrides | null): FeatureDefinition[] {
  if (!overrides?.features || Object.keys(overrides.features).length === 0) return FEATURES;
  return FEATURES.map((feature) => {
    const o = overrides.features[feature.key];
    if (!o) return feature;
    return {
      ...feature,
      ...(o.price !== undefined ? { price: o.price } : {}),
      ...(o.weeks !== undefined ? { weeks: o.weeks } : {}),
      ...(o.monthly !== undefined ? { monthly: o.monthly } : {}),
    };
  });
}

export function resolveItems(overrides?: PricingOverrides | null): ItemDefinition[] {
  if (!overrides?.items || Object.keys(overrides.items).length === 0) return ITEMS;
  return ITEMS.map((item) => (overrides.items[item.key] ? { ...item, price: overrides.items[item.key].price } : item));
}

export function resolveServiceMap(overrides?: PricingOverrides | null): Record<ServiceKey, ServiceDefinition> {
  return Object.fromEntries(resolveServices(overrides).map((s) => [s.key, s])) as Record<ServiceKey, ServiceDefinition>;
}

export function resolveFeatureMap(overrides?: PricingOverrides | null): Record<FeatureKey, FeatureDefinition> {
  return Object.fromEntries(resolveFeatures(overrides).map((f) => [f.key, f])) as Record<FeatureKey, FeatureDefinition>;
}

export function resolveItemMap(overrides?: PricingOverrides | null): Record<ItemKey, ItemDefinition> {
  return Object.fromEntries(resolveItems(overrides).map((i) => [i.key, i])) as Record<ItemKey, ItemDefinition>;
}

/**
 * Plan bullets for a service at a tier (admin override → shipped default).
 * Admin bullets are written in Arabic; without an English version they are
 * used as-is everywhere (the AI reads Arabic), never mixed with stale defaults.
 */
export function resolveIncludes(service: ServiceKey, tier: ScaleKey, overrides?: PricingOverrides | null): Bullets | null {
  const custom = overrides?.services?.[service]?.includes?.[tier];
  if (custom?.ar?.length) return { ar: custom.ar, en: custom.en?.length ? custom.en : custom.ar };
  return PLAN_INCLUDES[service]?.[tier] ?? null;
}

export function resolveTypeFactor(type: ProjectTypeKey | undefined, overrides?: PricingOverrides | null): number {
  const key = type ?? "new";
  const custom = overrides?.typeFactors?.[key];
  if (typeof custom === "number") return custom;
  return PROJECT_TYPES.find((t) => t.key === key)?.priceFactor ?? 1;
}

export function resolvePaymentsMinTier(overrides?: PricingOverrides | null): ScaleKey {
  return overrides?.paymentsMinTier ?? PAYMENTS_MIN_TIER;
}
