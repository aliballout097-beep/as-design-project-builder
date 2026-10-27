import "server-only";
import OpenAI from "openai";
import { parseAnalysis, type ScopeAnalysis } from "@/lib/schemas/analysis";
import { AnalysisError } from "./errors";
import { SCOPE_ANALYSIS_JSON_SCHEMA, SCOPE_ANALYSIS_SCHEMA_NAME } from "./json-schema";

/**
 * Optional OpenAI adapter (set AI_PROVIDER=openai). Uses Chat Completions with a
 * strict `json_schema` response format built from the same schema as Claude.
 */

export interface OpenAiResult {
  analysis: ScopeAnalysis;
  model: string;
  usage: Record<string, unknown>;
}

export async function analyzeWithOpenAI(params: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
}): Promise<OpenAiResult> {
  const client = new OpenAI({ apiKey: params.apiKey, maxRetries: 2, timeout: 10 * 60 * 1000 });

  let completion;
  try {
    completion = await client.chat.completions.create({
      model: params.model,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
      max_completion_tokens: 32_000,
      response_format: {
        type: "json_schema",
        json_schema: { name: SCOPE_ANALYSIS_SCHEMA_NAME, strict: true, schema: SCOPE_ANALYSIS_JSON_SCHEMA },
      },
    });
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      const retryable = error.status === 429 || (error.status ?? 500) >= 500;
      throw new AnalysisError(`OpenAI API error ${error.status ?? ""}: ${error.message}`, "provider_error", retryable);
    }
    throw error;
  }

  const choice = completion.choices[0];
  if (!choice) throw new AnalysisError("OpenAI returned no choices.", "invalid_output", true);
  if (choice.message.refusal) throw new AnalysisError(`OpenAI declined: ${choice.message.refusal}`, "refusal");
  if (choice.finish_reason === "length") {
    throw new AnalysisError("OpenAI response was truncated (length).", "truncated", true);
  }

  try {
    return {
      analysis: parseAnalysis(JSON.parse(choice.message.content ?? "")),
      model: completion.model,
      usage: JSON.parse(JSON.stringify(completion.usage ?? {})) as Record<string, unknown>,
    };
  } catch (error) {
    throw new AnalysisError(`OpenAI returned output that failed validation: ${(error as Error).message}`, "invalid_output", true);
  }
}
