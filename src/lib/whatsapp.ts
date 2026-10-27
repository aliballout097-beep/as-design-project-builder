import "server-only";
import { getConfig } from "@/lib/env";

/**
 * WhatsApp delivery to clients through Meta's official WhatsApp Cloud API.
 *
 * A business can only start a WhatsApp conversation with an *approved message
 * template* (free-form text is only allowed within 24h of the client writing
 * to you). The template this code sends must be created in WhatsApp Manager
 * exactly as described in README → "WhatsApp to clients":
 *
 *   name      proposal_ready   (WHATSAPP_TEMPLATE_NAME)
 *   category  Utility · language Arabic (WHATSAPP_TEMPLATE_LANG=ar)
 *   header    Document                         ← the proposal PDF
 *   body      {{1}} first name · {{2}} starting plan price · {{3}} reference
 *   button    URL  https://automation.asdesignlb.com/p/{{1}}   ← private proposal link
 */

export type WhatsAppResult = { ok: true; messageId: string; to: string } | { ok: false; error: string; to: string | null };

/**
 * Normalise what a client typed ("03 123 456", "+961 3-123456", "009613123456")
 * to the international digits WhatsApp expects ("9613123456"). Numbers without
 * a country code get `defaultCountryCode` (Lebanon: 961). Returns null when it
 * can't be a phone number.
 */
export function normalizeWhatsAppNumber(raw: string | null | undefined, defaultCountryCode = "961"): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  let digits = trimmed.replace(/[^0-9]/g, "");
  if (!digits) return null;
  if (trimmed.startsWith("+")) {
    // already international
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.length <= 9) {
    // Local number (Lebanon: 7–8 digits): drop the trunk 0 ("03 123 456" → "3123456") and add the country code.
    digits = defaultCountryCode + digits.replace(/^0+/, "");
  }
  // Otherwise it already carries a country code ("9613123456", "971501234567").
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** Template text parameters may not contain newlines, tabs or 4+ consecutive spaces. */
const clean = (value: string) => value.replace(/[\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim().slice(0, 200);

const RETRY_DELAYS_MS = [2_000, 6_000];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function sendProposalWhatsApp(params: {
  phone: string | null | undefined;
  firstName: string;
  total: string;
  reference: string;
  pdfUrl: string;
  pdfFilename: string;
  /** The proposal share token — the dynamic part of the template's URL button. */
  shareToken: string;
}): Promise<WhatsAppResult> {
  const config = getConfig().whatsapp;
  if (!config) return { ok: false, error: "WhatsApp is not configured (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)", to: null };
  const to = normalizeWhatsAppNumber(params.phone, config.defaultCountryCode);
  if (!to) return { ok: false, error: `Not a valid WhatsApp number: "${params.phone ?? ""}"`, to: null };

  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: config.template,
      language: { code: config.language },
      components: [
        { type: "header", parameters: [{ type: "document", document: { link: params.pdfUrl, filename: params.pdfFilename } }] },
        {
          type: "body",
          parameters: [
            { type: "text", text: clean(params.firstName) || "—" },
            { type: "text", text: clean(params.total) },
            { type: "text", text: clean(params.reference) },
          ],
        },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: params.shareToken }] },
      ],
    },
  };

  let lastError = "";
  for (let attempt = 1; attempt <= RETRY_DELAYS_MS.length + 1; attempt++) {
    try {
      const response = await fetch(`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      const json = (await response.json().catch(() => ({}))) as {
        messages?: { id: string }[];
        error?: { message?: string; code?: number; error_data?: { details?: string } };
      };
      if (response.ok && json.messages?.[0]?.id) return { ok: true, messageId: json.messages[0].id, to };
      const detail = json.error ? `${json.error.code ?? response.status}: ${json.error.error_data?.details ?? json.error.message ?? "error"}` : `HTTP ${response.status}`;
      lastError = `WhatsApp API ${detail}`;
      // 4xx (bad template, number not on WhatsApp, expired token) won't succeed on retry.
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    const delay = RETRY_DELAYS_MS[attempt - 1];
    if (delay !== undefined) await sleep(delay);
  }
  console.error(`[whatsapp] proposal ${params.reference} → ${to} failed: ${lastError}`);
  return { ok: false, error: lastError, to };
}
