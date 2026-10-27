import "server-only";
import { z } from "zod";
import { DEV_SESSION_SECRET } from "@/lib/auth/secret";

/**
 * Server configuration, parsed once from `process.env`.
 *
 * Every integration is optional so the platform runs end-to-end on a laptop
 * with zero setup (local JSON store + rule-based estimator + no n8n). Each
 * integration switches on as soon as its variables are present.
 */

const flag = z
  .enum(["true", "false", "1", "0", "yes", "no", "on", "off"])
  .transform((value) => ["true", "1", "yes", "on"].includes(value));

const list = z.string().transform((value) =>
  value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean),
);

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_SITE_URL: z.url().default("https://asdesignlb.com"),

  // Admin access
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters").optional(),
  ADMIN_EMAIL: z.email().optional(),
  ADMIN_PASSWORD_HASH: z.string().startsWith("scrypt.").optional(),
  ADMIN_USERS: z.string().optional(),

  // Data store
  DATA_STORE: z.enum(["supabase", "local"]).optional(),
  SUPABASE_URL: z.url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  LOCAL_DATA_DIR: z.string().default(".data"),

  // AI
  AI_PROVIDER: z.enum(["anthropic", "openai", "heuristic"]).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5"),
  AI_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("high"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5.5"),
  AI_FALLBACK_TO_HEURISTIC: flag.default(true),
  ANALYSIS_RUNNER: z.enum(["n8n", "app"]).optional(),

  // n8n
  N8N_WEBHOOK_BASE_URL: z.url().optional(),
  N8N_WEBHOOK_SECRET: z.string().min(16).optional(),
  N8N_CALLBACK_SECRET: z.string().min(16).optional(),
  // Per-workflow overrides: a full URL, or "off" to stop sending that workflow's events.
  N8N_WEBHOOK_LEAD_INTAKE: z.union([z.url(), z.literal("off")]).optional(),
  N8N_WEBHOOK_ANALYSIS: z.union([z.url(), z.literal("off")]).optional(),
  N8N_WEBHOOK_DISPATCH: z.union([z.url(), z.literal("off")]).optional(),
  N8N_WEBHOOK_CRM_SYNC: z.union([z.url(), z.literal("off")]).optional(),
  N8N_CRM_SYNC_ENABLED: flag.default(true),

  // Email (the app sends client + admin emails itself over SMTP — Hostinger mail by default)
  SMTP_HOST: z.string().default("smtp.hostinger.com"),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: flag.optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  /** Sender address — must be the SMTP mailbox (or an alias of it) so SPF/DKIM/DMARC align. */
  MAIL_FROM: z.email().optional(),
  MAIL_FROM_NAME: z.string().default("Ali Mawla · AS Design"),
  /** Where new-lead and proposal alerts go (comma separated). */
  ADMIN_NOTIFY_EMAILS: list.default(["info@asdesignlb.com"]),
  /** app = this app sends every email (recommended) · n8n = the n8n workflows do · off = no emails. */
  EMAIL_DELIVERY: z.enum(["app", "n8n", "off"]).optional(),
  /** Minutes to wait for n8n's AI analysis before the app runs it itself. */
  ANALYSIS_FALLBACK_MINUTES: z.coerce.number().min(1).max(60).default(8),

  // WhatsApp to the client (Meta WhatsApp Cloud API — official, approved template message)
  WHATSAPP_TOKEN: z.string().trim().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().trim().optional(),
  WHATSAPP_TEMPLATE_NAME: z.string().default("proposal_ready"),
  WHATSAPP_TEMPLATE_LANG: z.string().default("ar"),
  WHATSAPP_API_VERSION: z.string().default("v23.0"),
  /** Country code added to local numbers typed without one (Lebanon: 961). */
  WHATSAPP_DEFAULT_COUNTRY_CODE: z.string().default("961"),

  // Security & limits
  ALLOWED_ORIGINS: list.default([]),
  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  IP_HASH_SALT: z.string().optional(),
  ONBOARD_MIN_FILL_SECONDS: z.coerce.number().int().min(0).default(4),
});

export type AiProvider = "anthropic" | "openai" | "heuristic";

export interface AdminUser {
  email: string;
  passwordHash: string;
}

export interface ServerConfig {
  isProduction: boolean;
  appUrl: string;
  siteUrl: string;
  sessionSecret: string;
  admins: AdminUser[];
  /** Development-only demo login when no admin is configured. */
  devLogin: { email: string; password: string } | null;
  dataStore: "supabase" | "local";
  supabase: { url: string; serviceRoleKey: string } | null;
  localDataDir: string;
  ai: {
    provider: AiProvider;
    anthropic: { apiKey: string; model: string } | null;
    openai: { apiKey: string; model: string } | null;
    effort: "low" | "medium" | "high" | "xhigh" | "max";
    fallbackToHeuristic: boolean;
  };
  analysisRunner: "n8n" | "app";
  /** Minutes to wait for n8n to post an analysis back before running it in-app. */
  analysisFallbackMs: number;
  email: {
    /** Who sends client/admin emails. "app" requires SMTP_USER + SMTP_PASS. */
    delivery: "app" | "n8n" | "off";
    smtp: { host: string; port: number; secure: boolean; user: string; pass: string } | null;
    from: { name: string; address: string };
    adminRecipients: string[];
  };
  /** Proposal delivery to the client over WhatsApp (Cloud API), sent by the app next to the email. */
  whatsapp: {
    token: string;
    phoneNumberId: string;
    template: string;
    language: string;
    apiVersion: string;
    defaultCountryCode: string;
  } | null;
  n8n: {
    enabled: boolean;
    webhookSecret: string | null;
    callbackSecret: string | null;
    crmSyncEnabled: boolean;
    urls: { leadIntake: string | null; analysis: string | null; dispatch: string | null; crmSync: string | null };
  };
  allowedOrigins: string[];
  upstash: { url: string; token: string } | null;
  ipHashSalt: string;
  onboardMinFillMs: number;
  warnings: string[];
}

function parseAdminUsers(raw: string | undefined): AdminUser[] {
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf(":");
      return { email: entry.slice(0, separator).trim().toLowerCase(), passwordHash: entry.slice(separator + 1).trim() };
    })
    .filter((user) => user.email.includes("@") && user.passwordHash.startsWith("scrypt."));
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function buildConfig(): ServerConfig {
  // Treat empty strings (`FOO=` in .env files) as unset.
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined && value !== ""));
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  const e = parsed.data;
  const isProduction = e.NODE_ENV === "production";
  const warnings: string[] = [];

  let sessionSecret = e.SESSION_SECRET;
  if (!sessionSecret) {
    if (isProduction) throw new Error("SESSION_SECRET is required in production (min 32 characters).");
    sessionSecret = DEV_SESSION_SECRET;
    warnings.push("SESSION_SECRET is not set — using an insecure development secret.");
  }

  const admins = parseAdminUsers(e.ADMIN_USERS);
  if (e.ADMIN_EMAIL && e.ADMIN_PASSWORD_HASH) {
    admins.unshift({ email: e.ADMIN_EMAIL.toLowerCase(), passwordHash: e.ADMIN_PASSWORD_HASH });
  }
  const devLogin = !isProduction && admins.length === 0 ? { email: "demo@asdesignlb.com", password: "studio-demo" } : null;
  if (devLogin) warnings.push("No admin configured — development demo login is enabled.");
  if (isProduction && admins.length === 0) {
    warnings.push("No admin users configured (ADMIN_EMAIL + ADMIN_PASSWORD_HASH) — the dashboard is inaccessible.");
  }

  const supabase =
    e.SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY ? { url: e.SUPABASE_URL, serviceRoleKey: e.SUPABASE_SERVICE_ROLE_KEY } : null;
  const dataStore = e.DATA_STORE ?? (supabase ? "supabase" : "local");
  if (dataStore === "supabase" && !supabase) {
    throw new Error("DATA_STORE=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  if (dataStore === "local") {
    warnings.push("Using the local file store — configure Supabase for multi-instance / serverless deployments.");
  }

  const anthropic = e.ANTHROPIC_API_KEY ? { apiKey: e.ANTHROPIC_API_KEY, model: e.ANTHROPIC_MODEL } : null;
  const openai = e.OPENAI_API_KEY ? { apiKey: e.OPENAI_API_KEY, model: e.OPENAI_MODEL } : null;
  let provider: AiProvider = e.AI_PROVIDER ?? (anthropic ? "anthropic" : openai ? "openai" : "heuristic");
  if (provider === "anthropic" && !anthropic) {
    warnings.push("AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is missing — using the rule-based estimator.");
    provider = "heuristic";
  }
  if (provider === "openai" && !openai) {
    warnings.push("AI_PROVIDER=openai but OPENAI_API_KEY is missing — using the rule-based estimator.");
    provider = "heuristic";
  }

  const base = e.N8N_WEBHOOK_BASE_URL;
  const target = (override: string | undefined, path: string) =>
    override === "off" ? null : (override ?? (base ? joinUrl(base, path) : null));
  const urls = {
    leadIntake: target(e.N8N_WEBHOOK_LEAD_INTAKE, "asd-lead-intake"),
    analysis: target(e.N8N_WEBHOOK_ANALYSIS, "asd-ai-analysis"),
    dispatch: target(e.N8N_WEBHOOK_DISPATCH, "asd-proposal-dispatch"),
    crmSync: e.N8N_CRM_SYNC_ENABLED ? target(e.N8N_WEBHOOK_CRM_SYNC, "asd-crm-sync") : null,
  };
  const n8nEnabled = Object.values(urls).some(Boolean);
  if (n8nEnabled && !e.N8N_WEBHOOK_SECRET) {
    warnings.push("n8n webhooks are configured but N8N_WEBHOOK_SECRET is missing — requests to n8n are unauthenticated.");
  }
  if (n8nEnabled && !e.N8N_CALLBACK_SECRET) {
    warnings.push("N8N_CALLBACK_SECRET is missing — n8n cannot call back into /api/v1 (proposals, events).");
  }

  const analysisRunner = e.ANALYSIS_RUNNER ?? (urls.analysis ? "n8n" : "app");
  if (analysisRunner === "n8n" && !urls.analysis) {
    warnings.push("ANALYSIS_RUNNER=n8n but no analysis webhook is configured — analyses run in the app.");
  }

  // A bad WhatsApp value only disables WhatsApp (with a warning) — it must never take the site down.
  let whatsappValid = Boolean(e.WHATSAPP_TOKEN && e.WHATSAPP_PHONE_NUMBER_ID);
  if (whatsappValid && !/^[0-9]+$/.test(e.WHATSAPP_PHONE_NUMBER_ID!)) {
    warnings.push("WHATSAPP_PHONE_NUMBER_ID must be the numeric Phone number ID from Meta (WhatsApp Manager → API Setup), not the phone number — WhatsApp is disabled.");
    whatsappValid = false;
  }
  if (Boolean(e.WHATSAPP_TOKEN) !== Boolean(e.WHATSAPP_PHONE_NUMBER_ID)) {
    warnings.push("WhatsApp needs both WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID — WhatsApp is disabled.");
  }

  const smtp =
    e.SMTP_USER && e.SMTP_PASS
      ? { host: e.SMTP_HOST, port: e.SMTP_PORT, secure: e.SMTP_SECURE ?? e.SMTP_PORT === 465, user: e.SMTP_USER, pass: e.SMTP_PASS }
      : null;
  let emailDelivery = e.EMAIL_DELIVERY ?? (smtp ? "app" : n8nEnabled ? "n8n" : "off");
  if (emailDelivery === "app" && !smtp) {
    warnings.push("EMAIL_DELIVERY=app but SMTP_USER / SMTP_PASS are missing — emails are handed to n8n instead.");
    emailDelivery = n8nEnabled ? "n8n" : "off";
  }
  if (emailDelivery === "off") {
    warnings.push("No email delivery configured — set SMTP_USER and SMTP_PASS (e.g. info@asdesignlb.com on smtp.hostinger.com) so proposals and lead alerts are emailed.");
  }
  const fromAddress = (e.MAIL_FROM ?? (smtp?.user.includes("@") ? smtp.user : "info@asdesignlb.com")).toLowerCase();
  if (smtp && smtp.user.includes("@") && fromAddress.split("@")[1] !== smtp.user.toLowerCase().split("@")[1]) {
    warnings.push(`MAIL_FROM (${fromAddress}) is on a different domain than SMTP_USER — emails will fail DMARC and land in spam.`);
  }

  return {
    isProduction,
    appUrl: e.NEXT_PUBLIC_APP_URL.replace(/\/+$/, ""),
    siteUrl: e.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, ""),
    sessionSecret,
    admins,
    devLogin,
    dataStore,
    supabase,
    localDataDir: e.LOCAL_DATA_DIR,
    ai: { provider, anthropic, openai, effort: e.AI_EFFORT, fallbackToHeuristic: e.AI_FALLBACK_TO_HEURISTIC },
    analysisRunner,
    analysisFallbackMs: e.ANALYSIS_FALLBACK_MINUTES * 60_000,
    whatsapp:
      whatsappValid
        ? {
            token: e.WHATSAPP_TOKEN!,
            phoneNumberId: e.WHATSAPP_PHONE_NUMBER_ID!,
            template: e.WHATSAPP_TEMPLATE_NAME,
            language: e.WHATSAPP_TEMPLATE_LANG,
            apiVersion: e.WHATSAPP_API_VERSION,
            defaultCountryCode: e.WHATSAPP_DEFAULT_COUNTRY_CODE.replace(/[^0-9]/g, "") || "961",
          }
        : null,
    email: {
      delivery: emailDelivery,
      smtp,
      from: { name: e.MAIL_FROM_NAME, address: fromAddress },
      adminRecipients: e.ADMIN_NOTIFY_EMAILS.map((address) => address.toLowerCase()),
    },
    n8n: {
      enabled: n8nEnabled,
      webhookSecret: e.N8N_WEBHOOK_SECRET ?? null,
      callbackSecret: e.N8N_CALLBACK_SECRET ?? null,
      crmSyncEnabled: e.N8N_CRM_SYNC_ENABLED,
      urls,
    },
    allowedOrigins: e.ALLOWED_ORIGINS,
    upstash:
      e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN
        ? { url: e.UPSTASH_REDIS_REST_URL, token: e.UPSTASH_REDIS_REST_TOKEN }
        : null,
    ipHashSalt: e.IP_HASH_SALT ?? sessionSecret,
    onboardMinFillMs: e.ONBOARD_MIN_FILL_SECONDS * 1000,
    warnings,
  };
}

let cached: ServerConfig | null = null;

export function getConfig(): ServerConfig {
  if (!cached) {
    cached = buildConfig();
    for (const warning of cached.warnings) console.warn(`[config] ${warning}`);
  }
  return cached;
}

/** Test helper — forces the next `getConfig()` call to re-read `process.env`. */
export function resetConfigForTests() {
  cached = null;
}
