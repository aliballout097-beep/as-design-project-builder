import { after } from "next/server";
import { getConfig } from "@/lib/env";
import { ApiError, corsHeaders, getClientIp, jsonOk, readJson, route, withHeaders } from "@/lib/http";
import { createLeadFromSubmission, processNewLead } from "@/lib/pipeline";
import { enforceRateLimit } from "@/lib/rate-limit";
import { LeadSubmissionSchema } from "@/lib/schemas/lead";
import { bearerToken, hashIp, safeEqual } from "@/lib/security";

/**
 * POST /api/v1/onboard — lead intake.
 *
 * Called by the Project Builder (public, rate-limited, spam-checked) and by
 * n8n / server-to-server integrations (Authorization: Bearer N8N_CALLBACK_SECRET),
 * e.g. to import leads from Typeform, Webflow or Meta Lead Ads.
 */

// In-app AI analysis may run inside `after()` — allow long executions.
export const maxDuration = 300;

export const OPTIONS = route(async (request) => {
  return new Response(null, { status: 204, headers: corsHeaders(request, getConfig().allowedOrigins) });
});

export const POST = route(async (request) => {
  const cors = corsHeaders(request, getConfig().allowedOrigins);
  try {
    return await handleSubmission(request, cors);
  } catch (error) {
    // Cross-origin callers can only read error bodies when CORS headers are present.
    if (error instanceof ApiError) {
      throw new ApiError(error.status, error.code, error.message, error.details, { ...cors, ...(error.headers as Record<string, string>) });
    }
    throw error;
  }
});

async function handleSubmission(request: Request, cors: HeadersInit): Promise<Response> {
  const config = getConfig();
  const token = bearerToken(request);
  const trusted = Boolean(token && config.n8n.callbackSecret && safeEqual(token, config.n8n.callbackSecret));
  if (token && !trusted) throw new ApiError(401, "invalid_token", "Invalid API token");

  const ip = getClientIp(request);
  if (!trusted) await enforceRateLimit(`onboard:${ip ?? "unknown"}`, 5, 10 * 60 * 1000);

  const submission = await readJson(request, LeadSubmissionSchema, { maxBytes: 64 * 1024 });

  if (!trusted) {
    // Honeypot & minimum fill time: answer like a success so bots learn nothing.
    const tooFast = submission._t !== undefined && Date.now() - submission._t < config.onboardMinFillMs;
    if (submission._hp || tooFast) {
      console.warn(`[onboard] spam submission dropped (honeypot=${Boolean(submission._hp)}, tooFast=${tooFast})`);
      return withHeaders(jsonOk({ reference: "ASD-RECEIVED", status: "received" }, { status: 201 }), cors);
    }
    // Public callers can only claim the builder / embed sources.
    if (submission.meta.source !== "embed") submission.meta.source = "builder";
  } else if (submission.meta.source === "builder" || submission.meta.source === "embed") {
    submission.meta.source = "api";
  }

  const lead = await createLeadFromSubmission(submission, {
    ipHash: hashIp(ip, config.ipHashSalt),
    userAgent: request.headers.get("user-agent"),
    actor: trusted ? "n8n" : "client",
  });

  after(async () => {
    try {
      await processNewLead(lead.id);
    } catch (error) {
      console.error(`[onboard] post-processing failed for ${lead.reference}`, error);
    }
  });

  return withHeaders(
    jsonOk(
      {
        ...(trusted ? { id: lead.id } : {}),
        reference: lead.reference,
        status: lead.status,
        estimate: {
          min: lead.estimate.min,
          max: lead.estimate.max,
          weeksMin: lead.estimate.weeksMin,
          weeksMax: lead.estimate.weeksMax,
        },
      },
      { status: 201 },
    ),
    cors,
  );
}
