/** Errors raised by AI providers, classified for logging and fallback decisions. */
export class AnalysisError extends Error {
  constructor(
    message: string,
    public readonly reason: "refusal" | "truncated" | "invalid_output" | "provider_error" | "not_configured",
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "AnalysisError";
  }
}
