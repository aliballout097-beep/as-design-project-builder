import "server-only";
import { getRepository } from "@/lib/db";
import { promoFromSettings, resolveSettings } from "@/lib/settings";
import type { Lead, Proposal } from "@/lib/types";
import { sanitizeOverrides } from "./overrides";
import { buildPlans, pickRecommendedTier } from "./plans";
import { leadScope } from "./scope";

/**
 * The proposal with its plans. New proposals store them; older ones (created
 * before plans existed, or saved while the `plans` column migration was still
 * pending) get them rebuilt from the rate card, with the recommended plan set
 * to exactly this proposal's own totals.
 */
export async function withPlans(proposal: Proposal, lead: Lead): Promise<Proposal> {
  if (proposal.plans?.length) return proposal;
  try {
    const repo = getRepository();
    const [storedOverrides, storedSettings] = await Promise.all([repo.getPricingOverrides(), repo.getAppSettings()]);
    const overrides = sanitizeOverrides(storedOverrides);
    const { scale: _scale, ...input } = leadScope(lead).input;
    void _scale;
    const recommended = pickRecommendedTier(proposal.totals.oneTimeSubtotal, input, overrides);
    const plans = buildPlans(input, recommended, overrides, promoFromSettings(resolveSettings(storedSettings))).map((plan) =>
      plan.recommended ? { ...plan, price: proposal.totals.oneTimeTotal, listPrice: proposal.totals.oneTimeSubtotal } : plan,
    );
    return { ...proposal, plans };
  } catch (error) {
    console.error(`[plans] could not rebuild plans for proposal ${proposal.id}`, error);
    return proposal;
  }
}
