import "server-only";
import { DEFAULT_PROMO, type Promo } from "@/config/catalog";

/**
 * Small admin-editable app settings (Settings → Automation), stored the same
 * way as pricing overrides — a single JSON row, `null` meaning "use defaults".
 */

export interface AppSettings {
  /**
   * When true, a freshly generated proposal is approved and dispatched to the
   * client (email with the PDF attached) immediately — no admin review step.
   * Turn off to go back to manual "Approve & send".
   */
  autoSend: boolean;
  /**
   * Promotion applied to every new proposal and to the builder's live estimate,
   * as a percentage of the one-time subtotal (0 = off). Mirrors the offer on
   * asdesignlb.com/pricing.
   */
  promoPercent: number;
  /** Label printed on the proposal's discount line. */
  promoLabel: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoSend: true,
  promoPercent: DEFAULT_PROMO.percent,
  promoLabel: DEFAULT_PROMO.label,
};

export function resolveSettings(stored: Partial<AppSettings> | null): AppSettings {
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

/** The active promotion, or `null` when it's switched off. */
export function promoFromSettings(settings: AppSettings): Promo | null {
  if (!settings.promoPercent || settings.promoPercent <= 0) return null;
  return { percent: settings.promoPercent, label: settings.promoLabel || DEFAULT_PROMO.label, exemptUpTo: DEFAULT_PROMO.exemptUpTo };
}
