import "server-only";
import { getRepository } from "@/lib/db";
import { getConfig } from "@/lib/env";
import { sanitizeOverrides } from "@/lib/pricing/overrides";
import type { ScopeAnalysis } from "@/lib/schemas/analysis";
import type { AnalysisProvider, Lead } from "@/lib/types";
import { analyzeWithClaude } from "./anthropic";
import { toAiBrief } from "./brief";
import { AnalysisError } from "./errors";
import { analyzeHeuristically } from "./heuristic";
import { analyzeWithOpenAI } from "./openai";
import { buildSystemPrompt, buildUserMessage, type UserMessageOptions } from "./prompt";

export { AnalysisError } from "./errors";

export interface AnalysisOutcome {
  analysis: ScopeAnalysis;
  provider: AnalysisProvider;
  model: string | null;
  usage: Record<string, unknown> | null;
  durationMs: number;
  fallbackReason: string | null;
}

/**
 * The exact system prompt and user message for a lead, built from the current
 * rate card (Settings → Pricing). Sent with every n8n analysis request so the
 * workflow always prices from the live rates, not the copy baked in at import.
 */
export async function analysisPrompt(lead: Lead, options: UserMessageOptions = {}): Promise<{ system: string; user: string }> {
  const overrides = sanitizeOverrides(await getRepository().getPricingOverrides());
  return { system: buildSystemPrompt(overrides), user: buildUserMessage(toAiBrief(lead, overrides), options) };
}

/**
 * Run the scope & budget analysis in-process with the configured provider.
 * Falls back to the rule-based estimator when the provider fails (unless
 * AI_FALLBACK_TO_HEURISTIC=false), recording why in `fallbackReason`.
 */
export async function runAnalysis(lead: Lead, options: UserMessageOptions = {}): Promise<AnalysisOutcome> {
  const config = getConfig();
  const started = Date.now();
  const overrides = sanitizeOverrides(await getRepository().getPricingOverrides());
  const system = buildSystemPrompt(overrides);
  const user = buildUserMessage(toAiBrief(lead, overrides), options);

  const heuristic = (fallbackReason: string | null): AnalysisOutcome => ({
    analysis: analyzeHeuristically(lead, overrides),
    provider: "heuristic",
    model: null,
    usage: null,
    durationMs: Date.now() - started,
    fallbackReason,
  });

  try {
    if (config.ai.provider === "anthropic" && config.ai.anthropic) {
      const result = await analyzeWithClaude({
        apiKey: config.ai.anthropic.apiKey,
        model: config.ai.anthropic.model,
        effort: config.ai.effort,
        system,
        user,
      });
      return { ...result, provider: "anthropic", durationMs: Date.now() - started, fallbackReason: null };
    }
    if (config.ai.provider === "openai" && config.ai.openai) {
      const result = await analyzeWithOpenAI({ apiKey: config.ai.openai.apiKey, model: config.ai.openai.model, system, user });
      return { ...result, provider: "openai", durationMs: Date.now() - started, fallbackReason: null };
    }
    return heuristic(null);
  } catch (error) {
    const reason = error instanceof AnalysisError ? error.message : `Unexpected AI error: ${(error as Error).message}`;
    console.error(`[ai] analysis for ${lead.reference} failed: ${reason}`);
    if (config.ai.fallbackToHeuristic) return heuristic(reason);
    throw error instanceof AnalysisError ? error : new AnalysisError(reason, "provider_error");
  }
}
