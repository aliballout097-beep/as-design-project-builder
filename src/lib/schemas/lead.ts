import { z } from "zod";
import {
  ASSETS,
  BUDGET_KEYS,
  CONTACT_METHODS,
  FEATURE_KEYS,
  GOALS,
  ITEM_KEYS,
  LANGUAGES,
  PROJECT_TYPES,
  SCALE_KEYS,
  SERVICE_KEYS,
  TIMELINE_KEYS,
} from "@/config/catalog";

/**
 * Lead intake schemas — shared by the Project Builder (client-side step
 * validation) and `POST /api/v1/onboard` (authoritative server validation).
 */

const keysOf = <T extends readonly { key: string }[]>(list: T) =>
  list.map((item) => item.key) as unknown as [T[number]["key"], ...T[number]["key"][]];

export const GOAL_KEYS = keysOf(GOALS);
export const ASSET_KEYS = keysOf(ASSETS);
export const LANGUAGE_KEYS = keysOf(LANGUAGES);
export const CONTACT_METHOD_KEYS = keysOf(CONTACT_METHODS);
export const PROJECT_TYPE_KEYS = keysOf(PROJECT_TYPES);

/** Trimmed optional text; empty strings become `undefined`. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

/** Accepts "acme.com" as well as full URLs and normalises to https://… */
export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const urlField = z
  .string()
  .trim()
  .max(500)
  .transform(normalizeUrl)
  .pipe(z.url({ protocol: /^https?$/, message: "Please enter a valid URL" }));

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((value) => (value ? normalizeUrl(value) : undefined))
  .pipe(z.url({ protocol: /^https?$/, message: "Please enter a valid URL" }).optional());

/* ----------------------------------------------------------------------------
 * Builder steps
 * ------------------------------------------------------------------------- */

export const ServicesStepSchema = z.object({
  type: z.enum(PROJECT_TYPE_KEYS).default("new"),
  services: z
    .array(z.enum(SERVICE_KEYS))
    .min(1, "Pick at least one service to continue")
    .max(SERVICE_KEYS.length),
  /** Fixed-price items and quantities, e.g. { logo: 1, stickers: 10 } (brand, reels, CV…). */
  items: z.partialRecord(z.enum(ITEM_KEYS), z.number().int().min(0).max(100)).default({}),
});

export const VisionStepSchema = z.object({
  name: optionalText(120),
  description: z
    .string()
    .trim()
    .min(20, "Tell us a little more — at least 20 characters")
    .max(5000, "Please keep it under 5,000 characters"),
  goals: z.array(z.enum(GOAL_KEYS)).max(GOAL_KEYS.length).default([]),
  industry: optionalText(80),
  audience: optionalText(300),
  references: z.array(urlField).max(5, "Up to 5 references").default([]),
  assets: z.array(z.enum(ASSET_KEYS)).max(ASSET_KEYS.length).default([]),
});

export const ScopeStepSchema = z.object({
  features: z.array(z.enum(FEATURE_KEYS)).max(FEATURE_KEYS.length).default([]),
  scale: z.enum(SCALE_KEYS).default("standard"),
  languages: z.array(z.enum(LANGUAGE_KEYS)).min(1, "Choose at least one language").default(["en"]),
});

export const PlanStepSchema = z.object({
  budget: z.enum(BUDGET_KEYS, { message: "Choose the budget range that fits best" }),
  budgetFlexible: z.boolean().default(false),
  timeline: z.enum(TIMELINE_KEYS, { message: "Choose a timeline" }),
  /** Delivery the client asked for, in days ("I want it in 5 days") — timeline "custom". */
  deliveryDays: z.number().int().min(1, "Enter a number of days").max(365, "Up to 365 days").optional(),
  deadline: z.iso
    .date({ message: "Use the YYYY-MM-DD format" })
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export const ContactStepSchema = z.object({
  name: z.string().trim().min(2, "Please enter your full name").max(120),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email({ message: "Please enter a valid email address" })),
  phone: z
    .string()
    .trim()
    .max(32)
    .optional()
    .transform((value) => (value ? value : undefined))
    .pipe(
      z
        .string()
        .regex(/^\+?[0-9 ()\-.]{6,}$/, "Please enter a valid phone number")
        .optional(),
    ),
  whatsapp: z.boolean().default(false),
  company: optionalText(160),
  role: optionalText(120),
  website: optionalUrl,
  country: optionalText(80),
  preferredContact: z.enum(CONTACT_METHOD_KEYS).default("email"),
  /** How the proposal PDF itself should be delivered on approval (independent of `preferredContact`, which is about ongoing sales contact). */
  deliveryChannel: z.enum(["email", "whatsapp", "both"]).default("email"),
  consent: z.literal(true, { message: "Please accept the privacy notice to continue" }),
  marketingOptIn: z.boolean().default(false),
}).refine((data) => data.deliveryChannel === "email" || (data.phone && data.whatsapp), {
  message: "Add a WhatsApp-enabled phone number to receive the proposal on WhatsApp",
  path: ["deliveryChannel"],
});

/* ----------------------------------------------------------------------------
 * Full submission
 * ------------------------------------------------------------------------- */

export const ProjectSchema = ServicesStepSchema.extend(VisionStepSchema.shape).extend(ScopeStepSchema.shape);

const utmValue = optionalText(200);

export const LeadMetaSchema = z.object({
  source: z.enum(["builder", "embed", "api", "n8n", "import"]).default("builder"),
  utm: z
    .object({
      source: utmValue,
      medium: utmValue,
      campaign: utmValue,
      term: utmValue,
      content: utmValue,
    })
    .partial()
    .default({}),
  referrer: optionalText(500),
  landingPage: optionalText(500),
  embedOrigin: optionalText(200),
  locale: optionalText(20),
});

export const LeadSubmissionSchema = z
  .object({
  project: ProjectSchema,
  plan: PlanStepSchema,
  contact: ContactStepSchema,
  meta: LeadMetaSchema.prefault({}),
  /** Honeypot — real users never see or fill this field. */
  _hp: z.string().max(500).optional(),
  /** Epoch ms when the visitor opened the builder (minimum fill-time check). */
  _t: z.number().int().positive().optional(),
  })
  // Clients of the Project Builder must leave a phone number: it is how we still reach
  // them (and send the proposal on WhatsApp) when their email address has a typo.
  .superRefine((data, ctx) => {
    if ((data.meta.source === "builder" || data.meta.source === "embed") && !data.contact.phone) {
      ctx.addIssue({ code: "custom", path: ["contact", "phone"], message: "Please enter your phone number" });
    }
  });

export type LeadSubmissionInput = z.input<typeof LeadSubmissionSchema>;
export type LeadSubmission = z.output<typeof LeadSubmissionSchema>;
export type Project = z.output<typeof ProjectSchema>;
export type Plan = z.output<typeof PlanStepSchema>;
export type Contact = Omit<z.output<typeof ContactStepSchema>, "consent" | "marketingOptIn">;
export type LeadMeta = z.output<typeof LeadMetaSchema>;

export const BUILDER_STEP_SCHEMAS = {
  services: ServicesStepSchema,
  vision: VisionStepSchema,
  scope: ScopeStepSchema,
  plan: PlanStepSchema,
  contact: ContactStepSchema,
} as const;
export type BuilderStepKey = keyof typeof BUILDER_STEP_SCHEMAS;

/** Flatten zod issues into `{ "path.to.field": "message" }` for form display. */
export function issuesToFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
