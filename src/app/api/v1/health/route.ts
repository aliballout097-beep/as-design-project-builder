import { getAdminSession } from "@/lib/auth/guard";
import { getRepository } from "@/lib/db";
import { getConfig } from "@/lib/env";
import { jsonOk, route } from "@/lib/http";

/**
 * GET /api/v1/health — liveness + dependency check for uptime monitors.
 * Integration details are only included for signed-in admins.
 */
export const GET = route(async () => {
  const config = getConfig();
  const started = Date.now();
  let database: "ok" | "error" = "ok";
  try {
    await getRepository().latestEventId();
  } catch (error) {
    database = "error";
    console.error("[health] database check failed", error);
  }
  const body: Record<string, unknown> = {
    status: database === "ok" ? "ok" : "degraded",
    database,
    latencyMs: Date.now() - started,
    time: new Date().toISOString(),
  };
  if (await getAdminSession()) {
    body.integrations = {
      dataStore: config.dataStore,
      aiProvider: config.ai.provider,
      model: config.ai.provider === "anthropic" ? config.ai.anthropic?.model : config.ai.provider === "openai" ? config.ai.openai?.model : null,
      analysisRunner: config.analysisRunner,
      n8n: Object.fromEntries(Object.entries(config.n8n.urls).map(([key, value]) => [key, Boolean(value)])),
      warnings: config.warnings,
    };
  }
  return jsonOk(body, { status: database === "ok" ? 200 : 503 });
});
