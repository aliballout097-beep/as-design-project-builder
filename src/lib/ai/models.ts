/** Model capability helpers shared by the in-app Claude adapter and the n8n template generator. */

/** Server-side fallback beta: re-runs a policy-declined request on Anthropic's recommended model. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Models that accept `thinking: {type: "adaptive"}` + `output_config.effort` (everything current except Haiku). */
export function supportsAdaptiveThinking(model: string): boolean {
  return !/haiku/i.test(model);
}

/** The `fallbacks: "default"` scalar form is offered for the Opus 5 / Fable 5 generation. */
export function supportsServerFallback(model: string): boolean {
  return /^claude-(opus-5|fable-5|mythos-5)/.test(model);
}
