import { FEATURES, ITEMS, PAYMENTS_MIN_TIER, PROJECT_TYPES, SCALE_KEYS, SERVICES } from "@/config/catalog";
import { FEATURE_NAMES_AR, ITEM_NAMES_AR, ITEM_UNITS_AR, PROJECT_TYPE_LABELS_AR, SERVICE_NAMES_AR } from "@/config/catalog.ar";
import { PLAN_INCLUDES, PLAN_NAMES } from "@/config/plans";
import { authorize } from "@/lib/auth/guard";
import { getRepository } from "@/lib/db";
import { jsonOk, readJson, route } from "@/lib/http";
import {
  PricingOverridesSchema,
  resolveFeatureMap,
  resolveIncludes,
  resolveItemMap,
  resolvePaymentsMinTier,
  resolveServiceMap,
  resolveTypeFactor,
  sanitizeOverrides,
} from "@/lib/pricing/overrides";

const perTier = <T,>(fn: (tier: (typeof SCALE_KEYS)[number]) => T) => Object.fromEntries(SCALE_KEYS.map((tier) => [tier, fn(tier)]));

/**
 * GET /api/v1/admin/pricing — the rate card as the admin edits it: every
 * current value next to its shipped default (so the page can store only what
 * changed and offer "reset").
 */
export const GET = route(async (request) => {
  await authorize(request, ["admin"]);
  const overrides = sanitizeOverrides(await getRepository().getPricingOverrides());
  const services = resolveServiceMap(overrides);
  const items = resolveItemMap(overrides);
  const features = resolveFeatureMap(overrides);
  return jsonOk({
    overrides,
    plans: SCALE_KEYS.map((key) => ({ key, name: PLAN_NAMES[key].en, nameAr: PLAN_NAMES[key].ar })),
    services: SERVICES.filter((s) => s.kind === "tiered").map((def) => ({
      key: def.key,
      name: def.name,
      nameAr: SERVICE_NAMES_AR[def.key],
      tiers: perTier((tier) => services[def.key].tiers[tier] ?? null),
      defaultTiers: perTier((tier) => def.tiers[tier] ?? null),
      promo: services[def.key].promo,
      defaultPromo: def.promo,
      offers: perTier((tier) => services[def.key].offers?.[tier] ?? null),
      defaultOffers: perTier((tier) => def.offers?.[tier] ?? null),
      includes: perTier((tier) => resolveIncludes(def.key, tier, overrides)?.ar ?? []),
      defaultIncludes: perTier((tier) => PLAN_INCLUDES[def.key]?.[tier]?.ar ?? []),
    })),
    items: ITEMS.map((def) => ({
      key: def.key,
      name: def.name,
      nameAr: ITEM_NAMES_AR[def.key],
      unitAr: ITEM_UNITS_AR[def.key],
      serviceAr: SERVICE_NAMES_AR[def.service],
      price: items[def.key].price,
      defaultPrice: def.price,
    })),
    features: FEATURES.map((def) => ({
      key: def.key,
      name: def.name,
      nameAr: FEATURE_NAMES_AR[def.key],
      price: features[def.key].price,
      defaultPrice: def.price,
      monthly: features[def.key].monthly ?? null,
      defaultMonthly: def.monthly ?? null,
    })),
    typeFactors: PROJECT_TYPES.map((def) => ({
      key: def.key,
      label: def.label,
      labelAr: PROJECT_TYPE_LABELS_AR[def.key],
      factor: resolveTypeFactor(def.key, overrides),
      defaultFactor: def.priceFactor,
    })),
    paymentsMinTier: resolvePaymentsMinTier(overrides),
    defaultPaymentsMinTier: PAYMENTS_MIN_TIER,
  });
});

/**
 * PATCH /api/v1/admin/pricing — replace the stored overrides wholesale. The
 * builder, new proposals and the AI prompt (in-app and n8n) use them at once.
 */
export const PATCH = route(async (request) => {
  await authorize(request, ["admin"]);
  const overrides = await readJson(request, PricingOverridesSchema, { maxBytes: 128 * 1024 });
  const clean = sanitizeOverrides(overrides);
  await getRepository().savePricingOverrides(clean);
  return jsonOk({ overrides: clean });
});
