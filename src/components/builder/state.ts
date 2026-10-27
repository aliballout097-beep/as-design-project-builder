"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ITEMS,
  ITEM_KEYS,
  SERVICE_KEYS,
  SCALE_KEYS,
  type AssetKey,
  type BudgetKey,
  type ContactMethodKey,
  type FeatureKey,
  type GoalKey,
  type ItemKey,
  type LanguageKey,
  type ProjectTypeKey,
  type ScaleKey,
  type ServiceKey,
  type TimelineKey,
} from "@/config/catalog";
import { COUNTRY_MAP, DEFAULT_COUNTRY, joinPhone, splitPhone } from "@/config/countries";
import { BUILDER_STEP_SCHEMAS, issuesToFieldErrors, type BuilderStepKey, type LeadSubmissionInput } from "@/lib/schemas/lead";

/** Form state for the Project Builder (mirrors LeadSubmission, with UI-friendly empties). */
export interface BuilderDraft {
  project: {
    type: ProjectTypeKey;
    name: string;
    services: ServiceKey[];
    /** Quantities of fixed-price items (logo, stickers, reels, CV…). */
    items: Partial<Record<ItemKey, number>>;
    description: string;
    goals: GoalKey[];
    industry: string;
    audience: string;
    features: FeatureKey[];
    scale: ScaleKey;
    languages: LanguageKey[];
    references: string[];
    assets: AssetKey[];
  };
  plan: {
    budget: BudgetKey | "";
    budgetFlexible: boolean;
    timeline: TimelineKey | "";
    deadline: string;
    /** Typed delivery time in days (timeline "custom"). */
    deliveryDays: string;
  };
  contact: {
    name: string;
    email: string;
    /** The national number; `phoneCountry` holds the country code picked beside it. */
    phone: string;
    phoneCountry: string;
    whatsapp: boolean;
    company: string;
    role: string;
    website: string;
    country: string;
    preferredContact: ContactMethodKey;
    deliveryChannel: "email" | "whatsapp" | "both";
    consent: boolean;
    marketingOptIn: boolean;
  };
}

export const EMPTY_DRAFT: BuilderDraft = {
  project: {
    type: "new",
    name: "",
    services: [],
    items: {},
    description: "",
    goals: [],
    industry: "",
    audience: "",
    features: [],
    // The Essential plan is the default suggestion — clients move up only if they want to.
    scale: "starter",
    languages: ["en"],
    references: [""],
    assets: [],
  },
  plan: { budget: "", budgetFlexible: false, timeline: "", deadline: "", deliveryDays: "" },
  contact: {
    name: "",
    email: "",
    phone: "",
    phoneCountry: DEFAULT_COUNTRY.code,
    whatsapp: false,
    company: "",
    role: "",
    website: "",
    country: "",
    preferredContact: "email",
    deliveryChannel: "email",
    consent: false,
    marketingOptIn: false,
  },
};

export type BuilderStep = "services" | "vision" | "plan" | "contact";

/**
 * Four short steps (was six): every optional question lives behind an
 * "optional details" fold, so a client on a phone can finish in ~3 minutes.
 */
export const STEPS: { key: BuilderStep; validates: BuilderStepKey[]; label: string; title: string; subtitle: string }[] = [
  { key: "services", validates: ["services"], label: "الخدمات", title: "ما الذي تحتاجه؟", subtitle: "اختر خدمة أو أكثر — السعر يظهر لك مباشرة." },
  { key: "vision", validates: ["vision"], label: "فكرتك", title: "أخبرنا عن مشروعك باختصار", subtitle: "جملتان أو ثلاث تكفي — أو سجّل رسالة صوتية." },
  { key: "plan", validates: ["scope", "plan"], label: "الخطة والميزانية", title: "الخطة والميزانية", subtitle: "اختر الخطة الأنسب لك — كل خطة بسعرها النهائي — ثم الميزانية والوقت." },
  { key: "contact", validates: ["contact"], label: "التواصل", title: "أين نرسل لك العرض؟", subtitle: "يصلك العرض بصيغة PDF على بريدك — وعلى واتساب إن أردت — خلال دقائق." },
];

/** Zod messages are English (shared with the API); the builder shows them in Arabic. */
const ERROR_MESSAGES_AR: Record<string, string> = {
  "Pick at least one service to continue": "اختر خدمة واحدة على الأقل للمتابعة",
  "Tell us a little more — at least 30 characters": "أخبرنا أكثر قليلاً — 30 حرفاً على الأقل",
  "Tell us a little more — at least 20 characters": "أخبرنا أكثر قليلاً — 20 حرفاً على الأقل",
  "Please keep it under 5,000 characters": "الرجاء الاختصار — أقل من 5000 حرف",
  "Up to 5 references": "حتى 5 روابط كحد أقصى",
  "Please enter a valid URL": "الرجاء إدخال رابط صحيح",
  "Choose at least one language": "اختر لغة واحدة على الأقل",
  "Choose the budget range that fits best": "اختر الميزانية الأقرب لك",
  "Choose a timeline": "اختر المدة المناسبة",
  "Use the YYYY-MM-DD format": "صيغة التاريخ غير صحيحة",
  "Please enter your full name": "الرجاء إدخال اسمك الكامل",
  "Please enter a valid email address": "الرجاء إدخال بريد إلكتروني صحيح",
  "Please enter a valid phone number": "الرجاء إدخال رقم هاتف صحيح",
  "Please enter your phone number": "رقم الهاتف مطلوب — نتواصل معك عليه إذا كان في خطأ بالإيميل",
  "Enter a number of days": "اكتب عدد الأيام",
  "Up to 365 days": "حتى 365 يوماً",
  "Please accept the privacy notice to continue": "الرجاء الموافقة على شروط الخصوصية للمتابعة",
  "Add a WhatsApp-enabled phone number to receive the proposal on WhatsApp": "أضف رقم واتساب لتستلم العرض على واتساب",
};

export function toArabicError(message: string): string {
  return ERROR_MESSAGES_AR[message] ?? (/[a-z]/i.test(message) ? "الرجاء التحقق من هذا الحقل" : message);
}

const STORAGE_KEY = "asd-builder-draft-v1";

function stepInput(draft: BuilderDraft, step: BuilderStepKey): unknown {
  switch (step) {
    case "services":
      return {
        type: draft.project.type,
        services: draft.project.services,
        items: Object.fromEntries(Object.entries(draft.project.items).filter(([, qty]) => typeof qty === "number" && qty > 0)),
      };
    case "vision":
      return {
        name: draft.project.name,
        description: draft.project.description,
        goals: draft.project.goals,
        industry: draft.project.industry,
        audience: draft.project.audience,
        references: draft.project.references.map((r) => r.trim()).filter(Boolean),
        assets: draft.project.assets,
      };
    case "scope":
      return { features: draft.project.features, scale: draft.project.scale, languages: draft.project.languages };
    case "plan":
      return {
        budget: draft.plan.budget || undefined,
        budgetFlexible: draft.plan.budgetFlexible,
        timeline: draft.plan.timeline || undefined,
        deadline: draft.plan.deadline,
        deliveryDays: draft.plan.timeline === "custom" && draft.plan.deliveryDays ? Number(draft.plan.deliveryDays) : undefined,
      };
    case "contact": {
      const { phoneCountry: _country, ...contact } = draft.contact;
      void _country;
      return { ...contact, phone: fullPhone(draft) || undefined, consent: draft.contact.consent ? true : undefined };
    }
  }
}

function validateSchema(draft: BuilderDraft, step: BuilderStepKey): Record<string, string> {
  const result = BUILDER_STEP_SCHEMAS[step].safeParse(stepInput(draft, step));
  if (result.success) return {};
  return Object.fromEntries(Object.entries(issuesToFieldErrors(result.error)).map(([key, message]) => [key, toArabicError(message)]));
}

/** The phone in international form, e.g. "+961 3123456" ("" when empty). */
export function fullPhone(draft: Pick<BuilderDraft, "contact">): string {
  return joinPhone(COUNTRY_MAP[draft.contact.phoneCountry] ?? DEFAULT_COUNTRY, draft.contact.phone);
}

/** Validate every schema a builder step covers; errors are keyed by field and in Arabic. */
export function validateStep(draft: BuilderDraft, step: BuilderStep): Record<string, string> {
  const definition = STEPS.find((s) => s.key === step);
  const errors: Record<string, string> = Object.assign({}, ...(definition?.validates ?? []).map((key) => validateSchema(draft, key)));
  if (step === "contact") {
    // Required, so we can still reach the client when the email has a typo.
    const digits = draft.contact.phone.replace(/[^0-9]/g, "").replace(/^0+/, "");
    if (!digits) errors.phone = toArabicError("Please enter your phone number");
    else if (digits.length < 6 || digits.length > 12) errors.phone = toArabicError("Please enter a valid phone number");
  }
  if (step === "plan" && draft.plan.timeline === "custom") {
    const days = Number(draft.plan.deliveryDays);
    if (!draft.plan.deliveryDays || !Number.isInteger(days) || days < 1) errors.deliveryDays = toArabicError("Enter a number of days");
    else if (days > 365) errors.deliveryDays = toArabicError("Up to 365 days");
  }
  return errors;
}

export function toSubmission(draft: BuilderDraft, extras: Pick<LeadSubmissionInput, "meta" | "_hp" | "_t">): LeadSubmissionInput {
  return {
    project: {
      ...(stepInput(draft, "services") as object),
      ...(stepInput(draft, "vision") as object),
      ...(stepInput(draft, "scope") as object),
    } as LeadSubmissionInput["project"],
    plan: stepInput(draft, "plan") as LeadSubmissionInput["plan"],
    contact: stepInput(draft, "contact") as LeadSubmissionInput["contact"],
    ...extras,
  };
}

/** Draft state persisted to localStorage (guarded: storage may be unavailable). */
export function useBuilderDraft() {
  const [draft, setDraft] = useState<BuilderDraft>(EMPTY_DRAFT);
  const [restored, setRestored] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if(!raw){
        const params=new URLSearchParams(window.location.search);
        const service=params.get('service'),tier=params.get('tier'),item=params.get('item');
        if(service&&(SERVICE_KEYS as readonly string[]).includes(service)){
          const selected=ITEMS.find(value=>value.key===item&&value.service===service);
          const draft:BuilderDraft={...EMPTY_DRAFT,project:{...EMPTY_DRAFT.project,services:[service as ServiceKey],scale:tier&&(SCALE_KEYS as readonly string[]).includes(tier)?tier as ScaleKey:'starter',items:selected?{[selected.key]:1}:{}}};
          // eslint-disable-next-line react-hooks/set-state-in-effect -- initial selection from the studio package link
          setDraft(draft);
        }
      }
      if (raw) {
        const saved = JSON.parse(raw) as Partial<BuilderDraft>;
        const project = { ...EMPTY_DRAFT.project, ...saved.project };
        const merged: BuilderDraft = {
          // Drafts saved by an older version may hold services or items that no longer exist.
          project: {
            ...project,
            services: (project.services ?? []).filter((key) => (SERVICE_KEYS as readonly string[]).includes(key)),
            items: Object.fromEntries(
              Object.entries(project.items ?? {}).filter(([key, qty]) => (ITEM_KEYS as readonly string[]).includes(key) && typeof qty === "number" && qty > 0),
            ),
          },
          plan: { ...EMPTY_DRAFT.plan, ...saved.plan },
          contact: (() => {
            const contact = { ...EMPTY_DRAFT.contact, ...saved.contact, consent: false };
            // Older drafts kept the full international number in `phone`.
            if (!saved.contact?.phoneCountry && contact.phone.trim().startsWith("+")) {
              const { country, national } = splitPhone(contact.phone);
              return { ...contact, phoneCountry: country.code, phone: national };
            }
            return contact;
          })(),
        };
        if (merged.project.services.length || merged.project.description) {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from storage
          setDraft(merged);
          setRestored(true);
        }
      }
    } catch {
      // Storage blocked or corrupted — start fresh.
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    const timer = setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      } catch {
        // ignore
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [draft]);

  const update = useCallback(<K extends keyof BuilderDraft>(section: K, patch: Partial<BuilderDraft[K]>) => {
    setDraft((current) => ({ ...current, [section]: { ...current[section], ...patch } }));
  }, []);

  const reset = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    setRestored(false);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return { draft, update, reset, restored, dismissRestored: () => setRestored(false) };
}

export function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/**
 * Select or unselect a service. Selecting a service sold as items (brand design,
 * reels, CV…) starts it with one unit of its first item; unselecting drops its items.
 */
export function toggleService(project: Pick<BuilderDraft["project"], "services" | "items">, key: ServiceKey): Pick<BuilderDraft["project"], "services" | "items"> {
  const serviceItems = ITEMS.filter((item) => item.service === key).map((item) => item.key);
  if (project.services.includes(key)) {
    const items = { ...project.items };
    for (const item of serviceItems) delete items[item];
    return { services: project.services.filter((s) => s !== key), items };
  }
  const hasItem = serviceItems.some((item) => (project.items[item] ?? 0) > 0);
  return {
    services: [...project.services, key],
    items: hasItem || !serviceItems.length ? project.items : { ...project.items, [serviceItems[0]]: 1 },
  };
}

/** Set an item's quantity (0 removes it). A service stays selected only while it has items. */
export function setItemQuantity(project: Pick<BuilderDraft["project"], "services" | "items">, key: ItemKey, qty: number): Pick<BuilderDraft["project"], "services" | "items"> {
  const items = { ...project.items };
  const clamped = Math.max(0, Math.min(100, Math.round(qty)));
  if (clamped > 0) items[key] = clamped;
  else delete items[key];
  const service = ITEMS.find((item) => item.key === key)!.service;
  const hasItems = ITEMS.some((item) => item.service === service && (items[item.key] ?? 0) > 0);
  const services = hasItems
    ? project.services.includes(service) ? project.services : [...project.services, service]
    : project.services.filter((s) => s !== service);
  return { services, items };
}
