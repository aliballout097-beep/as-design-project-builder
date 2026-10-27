import type {
  ItemKey,
  AssetKey,
  BudgetKey,
  ContactMethodKey,
  FeatureKey,
  GoalKey,
  LanguageKey,
  ProjectTypeKey,
  ScaleKey,
  ServiceKey,
  TimelineKey,
} from "./catalog";

/**
 * Arabic labels for the client-facing Project Builder (and its live blueprint).
 *
 * Deliberately separate from `catalog.ts`: that file is also the AI prompt's
 * rate card and the admin dashboard's data source, both of which stay in
 * English. This file only covers the short picker labels a client actually
 * sees while building a brief — not AI-generated proposal content (phase
 * write-ups, deliverables, executive summaries), which is produced per-lead
 * by the AI/heuristic engine and isn't statically translatable here.
 */

export const SERVICE_NAMES_AR: Record<ServiceKey, string> = {
  "ai-website": "موقع + نظام ذكاء اصطناعي",
  "career-docs": "سيرة ذاتية وLinkedIn",
  "brand-identity": "الهوية البصرية والتصميم",
  "web-design": "تصميم وتطوير المواقع",
  "landing-page": "صفحات الهبوط",
  ecommerce: "المتاجر الإلكترونية",
  "pos-system": "أنظمة نقاط البيع POS",
  "ui-ux": "تصميم واجهة وتجربة المستخدم",
  "mobile-app": "تطبيقات الجوال",
  "seo-content": "السيو والمحتوى",
  "social-media": "إدارة السوشيال ميديا",
  "motion-3d": "تصميم فيديوهات وريلز",
};

export const SERVICE_TAGLINES_AR: Record<ServiceKey, string> = {
  "ai-website": "موقع احترافي مع مساعد ذكي وأتمتة لأعمالك",
  "career-docs": "سيرة ذاتية ATS، رسالة تغطية وحساب LinkedIn",
  "brand-identity": "شعار، تصميم تغليف وستيكرز",
  "web-design": "مواقع شركات، مواقع أعمال وتطبيقات ويب",
  "landing-page": "صفحات حملات إعلانية ومسارات مبيعات",
  ecommerce: "متاجر إلكترونية كاملة مع الدفع والشحن",
  "pos-system": "نظام كاشير ومخزون للمحلات والمطاعم",
  "ui-ux": "أبحاث، نماذج أولية، وأنظمة تصميم",
  "mobile-app": "تطبيقات iOS وAndroid، بتقنية متعددة المنصات",
  "seo-content": "سيو تقني، استراتيجية محتوى، وكتابة",
  "social-media": "إدارة شهرية مع أو بدون إعلانات ممولة",
  "motion-3d": "فيديوهات قصيرة وريلز للسوشيال ميديا",
};

/** Fixed-price items (logo, packaging, stickers, reels, CV…). */
export const ITEM_NAMES_AR: Record<ItemKey, string> = {
  logo: "تصميم شعار (لوغو)",
  packaging: "تصميم تغليف",
  stickers: "تصميم ستيكر",
  reel: "تصميم فيديو ريلز",
  "cv-ats": "سيرة ذاتية متوافقة مع ATS",
  "cover-letter": "رسالة تغطية (Cover Letter)",
  linkedin: "تحسين حساب LinkedIn",
};

/** What one unit of an item is, Arabic ("للتصميم", "للفيديو"…). */
export const ITEM_UNITS_AR: Record<ItemKey, string> = {
  logo: "للشعار",
  packaging: "للتصميم",
  stickers: "للستيكر",
  reel: "للفيديو",
  "cv-ats": "للسيرة",
  "cover-letter": "للرسالة",
  linkedin: "للحساب",
};

export const FEATURE_NAMES_AR: Record<FeatureKey, string> = {
  cms: "لوحة أدمن متقدمة",
  multilingual: "متعدد اللغات (EN · AR · FR)",
  booking: "الحجوزات والمواعيد",
  payments: "بوابة دفع إلكتروني",
  accounts: "حسابات المستخدمين",
  blog: "المدونة",
  crm: "ربط أنظمة العملاء والتسويق",
  "ai-assistant": "مساعد ذكاء اصطناعي",
  analytics: "التحليلات والتتبع",
  dashboard: "لوحة تحكم مخصصة",
  integrations: "تكاملات واجهات برمجية",
  copywriting: "كتابة المحتوى",
  "content-production": "إنتاج الصور والفيديو",
  "care-plan": "خطة الصيانة",
};

export const FEATURE_DESCRIPTIONS_AR: Record<FeatureKey, string> = {
  cms: "تحكّم كامل بتعديل كل الصفحات والأقسام والصور بنفسك",
  multilingual: "محتوى محلي يشمل دعم العربية من اليمين لليسار",
  booking: "جدولة، إتاحة، وتذكيرات",
  payments: "بطاقات وبوابات محلية — متاحة من الخطة الاحترافية",
  accounts: "تسجيل، دخول، ومساحات للأعضاء",
  blog: "قوالب تحريرية وتصنيفات",
  crm: "HubSpot، Airtable، Notion، Mailchimp…",
  "ai-assistant": "مساعد محادثة مدرَّب على محتواكم",
  analytics: "GA4، البكسل، وأحداث التحويل",
  dashboard: "أدوات داخلية وواجهات تقارير",
  integrations: "أنظمة ERP، نقاط البيع، اللوجستيات، وواجهات خارجية",
  copywriting: "نصوص تحويلية بأسلوبكم الخاص",
  "content-production": "تصوير وتحرير موجّه فنيًا",
  "care-plan": "استضافة، تحديثات، نسخ احتياطي، ودعم",
};

export const SCALE_NAMES_AR: Record<ScaleKey, string> = {
  starter: "الأساسية",
  standard: "الاحترافية",
  advanced: "المتقدمة",
  enterprise: "المتكاملة",
};

export const SCALE_DESCRIPTIONS_AR: Record<ScaleKey, string> = {
  starter: "الأساسيات بإتقان — مثال: موقع حتى 5 صفحات",
  standard: "مشروع متكامل — مثال: موقع أعمال حتى 10 صفحات",
  advanced: "ميزات متقدمة ولغتين وبوابة عملاء",
  enterprise: "نظام مخصص كامل (لوحات تحكم، صلاحيات، API)",
};

export const BUDGET_LABELS_AR: Record<BudgetKey, string> = {
  "under-300": "أقل من 300$",
  "300-700": "300$ – 700$",
  "700-1.5k": "700$ – 1,500$",
  "1.5k-3k": "1,500$ – 3,000$",
  "3k-plus": "+3,000$",
  "not-sure": "لست متأكدًا بعد",
};

export const TIMELINE_LABELS_AR: Record<TimelineKey, string> = {
  asap: "بأسرع وقت",
  "1-week": "خلال أسبوع",
  "2-weeks": "خلال أسبوعين",
  "1-month": "خلال شهر",
  flexible: "مرن",
  custom: "مدة محددة",
  "1-2-months": "1–2 شهر",
  "2-4-months": "2–4 أشهر",
  "4-plus-months": "+4 أشهر",
};

export const TIMELINE_DESCRIPTIONS_AR: Record<TimelineKey, string> = {
  asap: "تسليم مستعجل (+20%)",
  "1-week": "تسليم سريع",
  "2-weeks": "الوتيرة المعتادة",
  "1-month": "وتيرة مريحة",
  flexible: "نحدّدها معاً",
  custom: "حسب عدد الأيام الذي تكتبه",
  "1-2-months": "الوتيرة المعتادة",
  "2-4-months": "لمشاريع أكبر بوتيرة مريحة",
  "4-plus-months": "برنامج مرحلي أو واسع النطاق",
};

export const PROJECT_TYPE_LABELS_AR: Record<ProjectTypeKey, string> = {
  new: "مشروع جديد",
  redesign: "إعادة تصميم",
  extend: "تعديل على عمل موجود",
};

export const PROJECT_TYPE_DESCRIPTIONS_AR: Record<ProjectTypeKey, string> = {
  new: "نبدأ من الصفر",
  redesign: "تجديد ما هو موجود بالكامل",
  extend: "تعديلات أو إضافات — بسعر أقل",
};

export const GOAL_LABELS_AR: Record<GoalKey, string> = {
  "generate-leads": "توليد عملاء محتملين",
  "sell-online": "البيع أونلاين",
  "elevate-brand": "الارتقاء بالعلامة",
  "launch-product": "إطلاق منتج جديد",
  "automate-operations": "أتمتة العمليات",
  "improve-conversion": "تحسين التحويل",
  "enter-new-market": "دخول سوق جديد",
  "support-fundraising": "دعم جمع التمويل",
};

export const ASSET_LABELS_AR: Record<AssetKey, string> = {
  logo: "شعار",
  "brand-guidelines": "دليل الهوية",
  copy: "محتوى مكتوب",
  photography: "تصوير / فيديو",
  website: "موقع حالي",
  "domain-hosting": "نطاق واستضافة",
};

export const LANGUAGE_LABELS_AR: Record<LanguageKey, string> = {
  en: "الإنجليزية",
  ar: "العربية",
  fr: "الفرنسية",
  other: "أخرى",
};

export const CONTACT_METHOD_LABELS_AR: Record<ContactMethodKey, string> = {
  email: "البريد الإلكتروني",
  whatsapp: "واتساب",
  phone: "مكالمة هاتفية",
  "video-call": "مكالمة فيديو",
};

export const INDUSTRIES_AR: string[] = [
  "العمارة والتصميم الداخلي",
  "التعليم",
  "الأزياء والتجزئة",
  "المال والتكنولوجيا المالية",
  "الأغذية والمشروبات",
  "الرعاية الصحية والعافية",
  "الضيافة والسياحة",
  "المنظمات غير الربحية",
  "العقارات",
  "التكنولوجيا والبرمجيات",
  "أخرى",
];

/** Delivery phase names for the builder's live blueprint sidebar (keyed like `DELIVERY_PHASES`). */
export const DELIVERY_PHASE_NAMES_AR: Record<string, string> = {
  discovery: "الاكتشاف والاستراتيجية",
  design: "التصميم",
  build: "البناء والإنتاج",
  launch: "ضمان الجودة والإطلاق",
};
