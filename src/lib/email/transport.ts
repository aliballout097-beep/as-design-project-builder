import "server-only";
import { randomUUID } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
import { getConfig } from "@/lib/env";

/**
 * SMTP transport (Hostinger mail by default: smtp.hostinger.com:465, SSL).
 *
 * Sending as the authenticated mailbox itself (info@asdesignlb.com) is what
 * makes SPF, DKIM and DMARC all pass for asdesignlb.com — the single biggest
 * factor in landing in the inbox instead of spam.
 */

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface OutgoingMail {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: MailAttachment[];
}

export type SendResult = { ok: true; messageId: string; attempts: number } | { ok: false; error: string; attempts: number };

let transporter: Transporter | null = null;
function getTransporter(): Transporter | null {
  const { smtp } = getConfig().email;
  if (!smtp) return null;
  transporter ??= nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    // Re-use one authenticated connection for bursts (PDF to client + copy to the team).
    pool: true,
    maxConnections: 2,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });
  return transporter;
}

const RETRY_DELAYS_MS = [3_000, 10_000];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Permanent SMTP failures (bad recipient, auth) are not worth retrying. */
function isPermanent(error: unknown): boolean {
  const code = (error as { responseCode?: number }).responseCode;
  const kind = (error as { code?: string }).code;
  return kind === "EAUTH" || kind === "EENVELOPE" || (typeof code === "number" && code >= 500 && code < 600);
}

export async function sendMail(mail: OutgoingMail): Promise<SendResult> {
  const config = getConfig();
  const transport = getTransporter();
  if (!transport) return { ok: false, error: "SMTP is not configured (SMTP_USER / SMTP_PASS)", attempts: 0 };

  const { from } = config.email;
  const domain = from.address.split("@")[1] ?? "asdesignlb.com";
  let lastError = "";
  for (let attempt = 1; attempt <= RETRY_DELAYS_MS.length + 1; attempt++) {
    try {
      const info = await transport.sendMail({
        from: { name: from.name, address: from.address },
        // Envelope sender = the authenticated mailbox, so SPF aligns with the From domain.
        envelope: { from: from.address, to: mail.to },
        to: mail.to,
        replyTo: mail.replyTo ?? from.address,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        attachments: mail.attachments,
        messageId: `<${randomUUID()}@${domain}>`,
        headers: { "X-Entity-Ref-ID": randomUUID() },
      });
      return { ok: true, messageId: info.messageId, attempts: attempt };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.error(`[email] "${mail.subject}" → ${String(mail.to)} failed (attempt ${attempt}): ${lastError}`);
      if (isPermanent(error)) break;
      const delay = RETRY_DELAYS_MS[attempt - 1];
      if (delay !== undefined) await sleep(delay);
    }
  }
  return { ok: false, error: lastError, attempts: RETRY_DELAYS_MS.length + 1 };
}

/** Checks the SMTP login without sending anything (Settings → Email → Test). */
export async function verifySmtp(): Promise<{ ok: boolean; error?: string }> {
  const transport = getTransporter();
  if (!transport) return { ok: false, error: "SMTP is not configured (SMTP_USER / SMTP_PASS)" };
  try {
    await transport.verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
