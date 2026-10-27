import "server-only";
import { getConfig } from "@/lib/env";
import { uuid } from "@/lib/ids";
import { signPayload } from "@/lib/security";

/**
 * Outbound webhooks to n8n.
 *
 * Every request carries:
 *   Authorization: Bearer <N8N_WEBHOOK_SECRET>   → checked by the n8n Webhook node (Header Auth)
 *   X-ASD-Signature: sha256=<hmac>               → optional extra verification (HMAC of `${ts}.${body}`)
 *   X-ASD-Timestamp / X-ASD-Event / X-ASD-Delivery
 *
 * Delivery is retried with backoff on network errors, 408/429 and 5xx.
 */

export type N8nTarget = "leadIntake" | "analysis" | "dispatch" | "crmSync";

export type OutboundEventType =
  | "lead.created"
  | "analysis.requested"
  | "proposal.created"
  | "proposal.approved"
  /** The app emailed the proposal itself (EMAIL_DELIVERY=app) — n8n only alerts the team. */
  | "proposal.sent"
  | "proposal.accepted"
  | "proposal.declined"
  | "crm.sync"
  | "test.ping";

export interface DeliveryResult {
  ok: boolean;
  skipped?: boolean;
  status?: number;
  attempts: number;
  deliveryId: string;
  url: string | null;
  error?: string;
  durationMs: number;
}

const RETRY_DELAYS_MS = [500, 2000];
const TIMEOUT_MS = 10_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function n8nTargetUrl(target: N8nTarget): string | null {
  return getConfig().n8n.urls[target];
}

export async function sendToN8n(
  target: N8nTarget,
  type: OutboundEventType,
  payload: Record<string, unknown>,
): Promise<DeliveryResult> {
  const config = getConfig();
  const url = n8nTargetUrl(target);
  const deliveryId = uuid();
  const started = Date.now();
  if (!url) return { ok: false, skipped: true, attempts: 0, deliveryId, url: null, durationMs: 0 };

  const envelope = {
    id: deliveryId,
    type,
    createdAt: new Date().toISOString(),
    app: { baseUrl: config.appUrl, apiBase: `${config.appUrl}/api/v1` },
    // "app" = the app already emails the client and the team; n8n workflows skip their email nodes.
    delivery: { email: config.email.delivery },
    ...payload,
  };
  const body = JSON.stringify(envelope);
  const timestamp = Math.floor(Date.now() / 1000);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "asd-automation-suite/1.0",
    "X-ASD-Event": type,
    "X-ASD-Delivery": deliveryId,
    "X-ASD-Timestamp": String(timestamp),
  };
  if (config.n8n.webhookSecret) {
    headers.Authorization = `Bearer ${config.n8n.webhookSecret}`;
    headers["X-ASD-Signature"] = signPayload(config.n8n.webhookSecret, timestamp, body);
  }

  let lastError = "";
  let lastStatus: number | undefined;
  for (let attempt = 1; attempt <= RETRY_DELAYS_MS.length + 1; attempt++) {
    try {
      const response = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
      lastStatus = response.status;
      if (response.ok) {
        return { ok: true, status: response.status, attempts: attempt, deliveryId, url, durationMs: Date.now() - started };
      }
      const text = (await response.text().catch(() => "")).slice(0, 300);
      lastError = `n8n responded ${response.status}${text ? `: ${text}` : ""}`;
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      if (!retryable) break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    const delay = RETRY_DELAYS_MS[attempt - 1];
    if (delay !== undefined) await sleep(delay);
  }

  console.error(`[n8n] ${type} → ${target} failed: ${lastError}`);
  return {
    ok: false,
    status: lastStatus,
    attempts: RETRY_DELAYS_MS.length + 1,
    deliveryId,
    url,
    error: lastError,
    durationMs: Date.now() - started,
  };
}
