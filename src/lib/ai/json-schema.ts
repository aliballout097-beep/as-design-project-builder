import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ScopeAnalysisSchema } from "@/lib/schemas/analysis";

/**
 * The exact JSON Schema sent as the structured-output format — produced by the
 * Anthropic SDK's own zod transformer so the in-app request, the n8n template
 * and the OpenAI `json_schema` response format are byte-for-byte identical.
 */
export const SCOPE_ANALYSIS_JSON_SCHEMA: Record<string, unknown> = betaZodOutputFormat(ScopeAnalysisSchema).schema;

export const SCOPE_ANALYSIS_SCHEMA_NAME = "scope_analysis";
