import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { normalizeAnalysis, ScopeAnalysisSchema, type ScopeAnalysis } from "@/lib/schemas/analysis";
import { AnalysisError } from "./errors";
import { FALLBACK_BETA, supportsAdaptiveThinking, supportsServerFallback } from "./models";

export { FALLBACK_BETA } from "./models";

/**
 * Claude adapter — structured outputs (`output_config.format`) validated by the
 * SDK's zod parser, adaptive thinking, streaming (long outputs never hit HTTP
 * timeouts) and server-side refusal fallbacks.
 */

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export function buildClaudeRequestParams(params: { model: string; effort: Effort; system: string; user: string }) {
  const adaptive = supportsAdaptiveThinking(params.model);
  const fallback = supportsServerFallback(params.model);
  return {
    model: params.model,
    max_tokens: 32_000,
    ...(fallback ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
    ...(adaptive ? { thinking: { type: "adaptive" as const } } : {}),
    output_config: {
      ...(adaptive ? { effort: params.effort } : {}),
      format: betaZodOutputFormat(ScopeAnalysisSchema),
    },
    // The system prompt (with the rate card) is identical for every lead — cache it.
    system: [{ type: "text" as const, text: params.system, cache_control: { type: "ephemeral" as const } }],
    messages: [{ role: "user" as const, content: params.user }],
  };
}

export interface ClaudeResult {
  analysis: ScopeAnalysis;
  model: string;
  usage: Record<string, unknown>;
}

export async function analyzeWithClaude(params: {
  apiKey: string;
  model: string;
  effort: Effort;
  system: string;
  user: string;
}): Promise<ClaudeResult> {
  const client = new Anthropic({ apiKey: params.apiKey, maxRetries: 2, timeout: 10 * 60 * 1000 });

  let message;
  try {
    const stream = client.beta.messages.stream(buildClaudeRequestParams(params));
    message = await stream.finalMessage();
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new AnalysisError(`Anthropic rejected the API key (${error.status}).`, "provider_error");
    }
    if (error instanceof Anthropic.BadRequestError) {
      throw new AnalysisError(`Anthropic rejected the request: ${error.message}`, "provider_error");
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new AnalysisError("Anthropic rate limit reached.", "provider_error", true);
    }
    if (error instanceof Anthropic.APIError) {
      throw new AnalysisError(`Anthropic API error ${error.status ?? ""}: ${error.message}`, "provider_error", true);
    }
    if (error instanceof Anthropic.AnthropicError) {
      // Raised by the zod output parser when the response does not match the schema.
      throw new AnalysisError(`Claude returned output that failed validation: ${error.message}`, "invalid_output", true);
    }
    throw error;
  }

  // Check the stop reason before reading content: a refusal or truncation may not match the schema.
  if (message.stop_reason === "refusal") {
    const category = message.stop_details?.category ?? "unspecified";
    throw new AnalysisError(`Claude declined to analyse this brief (category: ${category}).`, "refusal");
  }
  if (message.stop_reason === "max_tokens") {
    throw new AnalysisError("Claude's response was truncated (max_tokens reached).", "truncated", true);
  }
  if (!message.parsed_output) {
    throw new AnalysisError("Claude returned no structured output.", "invalid_output", true);
  }

  return {
    analysis: normalizeAnalysis(message.parsed_output),
    model: message.model,
    usage: JSON.parse(JSON.stringify(message.usage)) as Record<string, unknown>,
  };
}
