import { getRepository } from "@/lib/db";
import { appSendsEmail } from "@/lib/email";
import { getConfig } from "@/lib/env";
import { jsonOk, route } from "@/lib/http";
import { EMPTY_OVERRIDES, sanitizeOverrides } from "@/lib/pricing/overrides";
import { promoFromSettings, resolveSettings } from "@/lib/settings";
import type { Promo } from "@/config/catalog";

/**
 * GET /api/v1/catalog — public. Current price overrides (admin-set in
 * Settings → Pricing), so the client-side Project Builder's live estimate
 * matches whatever an admin has configured instead of the bundled
 * catalog.ts defaults, plus the active promotion. Numbers only — safe to
 * expose publicly.
 */
export const GET = route(async () => {
  let overrides = EMPTY_OVERRIDES;
  let promo: Promo | null = null;
  try {
    const repo = getRepository();
    const [stored, settings] = await Promise.all([repo.getPricingOverrides(), repo.getAppSettings()]);
    overrides = sanitizeOverrides(stored);
    promo = promoFromSettings(resolveSettings(settings));
  } catch (error) {
    console.error("[catalog] failed to load pricing overrides, serving defaults", error);
  }
  // Offer "send it on WhatsApp too" only when the app can actually deliver it.
  const channels = { whatsapp: Boolean(getConfig().whatsapp) && appSendsEmail() };
  return jsonOk({ overrides, promo, channels }, { headers: { "Cache-Control": "no-store, max-age=0" } });
});
