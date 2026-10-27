/**
 * AS Design Studio — service catalog & rate card (defaults).
 *
 * The single source of truth for everything price-related:
 *   • the Project Builder's live price (client side),
 *   • the plans in every proposal and their exact prices,
 *   • the rate card injected into the AI system prompt (in-app and n8n),
 *   • the rule-based estimator used when no AI is available.
 *
 * Every number here is a default: the admin edits them in Settings → Pricing
 * (plan prices per service, what each plan includes, item prices, add-ons,
 * the price factor for edits and where the payment gateway starts), and the
 * edits reach the builder, the proposals and the AI immediately.
 *
 * Two kinds of service:
 *   • "tiered" — priced per plan (Essential · Professional · Advanced · Premium),
 *     e.g. the website: $300 Startup · $450 Business · $800 Enterprise · $1,200 web app.
 *     A missing tier means "not offered" (the next lower tier's price is used).
 *   • "items"  — fixed-price pieces the client picks with a quantity, e.g. a logo
 *     $50, a packaging design $20, a sticker $5, a reel $35, an ATS CV $20.
 *
 * Keep this module free of server-only imports: it is bundled into the browser.
 */

export const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY ?? "USD";

/* ----------------------------------------------------------------------------
 * Services (in the order the builder shows them)
 * ------------------------------------------------------------------------- */

export const SERVICE_KEYS = [
  "ai-website",
  "web-design",
  "landing-page",
  "ecommerce",
  "pos-system",
  "mobile-app",
  "brand-identity",
  "social-media",
  "motion-3d",
  "career-docs",
  "ui-ux",
  "seo-content",
] as const;
export type ServiceKey = (typeof SERVICE_KEYS)[number];

/** Icon names map to lucide-react components in `components/builder/icons.tsx`. */
export type CatalogIcon =
  | "gem"
  | "monitor"
  | "shopping-bag"
  | "pen-tool"
  | "smartphone"
  | "bot"
  | "search"
  | "megaphone"
  | "clapperboard"
  | "layout"
  | "receipt"
  | "sparkles"
  | "file-text";

export interface Range {
  min: number;
  max: number;
}

export interface ServiceDefinition {
  key: ServiceKey;
  name: string;
  tagline: string;
  icon: CatalogIcon;
  kind: "tiered" | "items";
  /** Price range shown to the AI and in admin (tiered: lowest–highest plan; items: cheapest–dearest item). */
  price: Range;
  /** Regular one-time price per plan (tiered services). A missing tier is not offered. */
  tiers: Partial<Record<ScaleKey, number>>;
  /** Whether the current promotion (Settings → Promotion) discounts this service. */
  promo: boolean;
  /**
   * A special discount (%) on a specific plan, used instead of the general promotion —
   * e.g. the Essential website: $300 with 50% off → $150. Admin-editable.
   */
  offers?: Partial<Record<ScaleKey, number>>;
  /** The published packages behind the tiers (injected into the AI rate card). */
  packages?: { name: string; price: number; includes: string }[];
  /** Delivery time in weeks: `min` for the Essential plan up to `max` for the top plan (we deliver fast). */
  weeks: Range;
  /** Optional recurring retainer (per month) commonly attached to this service. */
  monthly?: Range & { label: string };
  /** Typical deliverables, in delivery order. Used by the rule-based estimator and the AI prompt. */
  deliverables: { title: string; description: string }[];
  /** Features most relevant to this service (shown first in the builder). */
  relatedFeatures: FeatureKey[];
}

export const SERVICES: ServiceDefinition[] = [
  {
    key: "ai-website",
    name: "AI-Powered Website & System",
    tagline: "A professional website with a built-in AI assistant & automation",
    icon: "sparkles",
    kind: "tiered",
    price: { min: 1000, max: 1000 },
    tiers: { starter: 1000 },
    promo: false,
    weeks: { min: 2, max: 3 },
    deliverables: [
      { title: "Discovery & AI use-case mapping", description: "Mapping your services, questions and workflows to decide what the AI should answer and automate." },
      { title: "Website UX/UI design", description: "A custom, responsive design for every page of the website." },
      { title: "Website build + AI assistant", description: "The website with an AI assistant trained on your business information, integrated end to end." },
      { title: "Automation, testing & launch", description: "Automations for enquiries and follow-ups, full testing and a monitored launch." },
    ],
    relatedFeatures: ["booking", "multilingual", "crm", "integrations", "dashboard"],
  },
  {
    key: "web-design",
    name: "Website Design & Build",
    tagline: "Company & business websites and web apps",
    icon: "monitor",
    kind: "tiered",
    // Startup Website $300 (special offer 50% → $150) → Business $350 → Enterprise + Social $650 → custom web app $900.
    price: { min: 300, max: 1200 },
    tiers: { starter: 300, standard: 450, advanced: 800, enterprise: 1200 },
    promo: true,
    packages: [
      { name: "Startup Website", price: 300, includes: "up to 5 pages, responsive design, simple admin access to edit content, free domain for 1 year, free hosting for 5 months, basic SEO, contact form + map" },
      { name: "Business Website", price: 450, includes: "everything in Startup, up to 10 pages, quote/service forms, team & portfolio sections, blog, analytics" },
      { name: "Enterprise Website + Social Media", price: 800, includes: "everything in Business, 20+ pages, Arabic/English, client portal, advanced animations, document sharing, social media starter package" },
      { name: "Custom Web Application (CRM, HR portal, dashboard)", price: 1200, includes: "role-based access, dashboards, CRUD, reporting, REST API, admin & user panels, secure auth, deployment" },
    ],
    weeks: { min: 1, max: 4 },
    monthly: { label: "Care & hosting plan", min: 20, max: 60 },
    deliverables: [
      { title: "Sitemap & UX wireframes", description: "Information architecture, key user journeys and wireframes for every main template." },
      { title: "Responsive UI design", description: "High-fidelity designs for desktop, tablet and mobile, including interaction details." },
      { title: "Front-end & CMS development", description: "A fast, accessible build with reusable components and an editor-friendly CMS." },
      { title: "Performance, SEO foundations & launch", description: "Speed optimisation, technical SEO, analytics setup and a monitored go-live." },
    ],
    relatedFeatures: ["cms", "booking", "payments", "multilingual", "blog", "ai-assistant", "analytics", "crm"],
  },
  {
    key: "landing-page",
    name: "Landing Page",
    tagline: "Campaign pages & sales funnels",
    icon: "layout",
    kind: "tiered",
    price: { min: 130, max: 600 },
    tiers: { starter: 130, standard: 230, advanced: 400, enterprise: 600 },
    promo: true,
    packages: [
      { name: "Single Landing Page", price: 130, includes: "responsive custom design, headline/features/CTA, lead form, 1 revision, basic analytics, free domain + SSL" },
      { name: "Conversion-Optimized Page", price: 230, includes: "A/B-ready design, CRM or email-marketing integration, Google/Meta event tracking, sticky CTA + exit popup, 3 revisions" },
      { name: "Landing Funnel Bundle", price: 400, includes: "up to 3 funnel pages, upsell/downsell flow, thank-you page & form logic, Zapier/Mailchimp automation, social media starter package" },
    ],
    weeks: { min: 1, max: 2 },
    deliverables: [
      { title: "Offer & message outline", description: "The offer, audience and single call-to-action the page is built around." },
      { title: "Landing page design", description: "A focused, responsive design with headline, benefits, proof and a clear call to action." },
      { title: "Build, forms & tracking", description: "Fast build with the lead form, CRM/email hookup and conversion tracking." },
      { title: "Launch & optimisation", description: "Go-live, QA on every device and a first round of conversion tweaks." },
    ],
    relatedFeatures: ["analytics", "crm", "copywriting"],
  },
  {
    key: "ecommerce",
    name: "E-commerce",
    tagline: "Online stores with checkout & shipping",
    icon: "shopping-bag",
    kind: "tiered",
    price: { min: 400, max: 2200 },
    tiers: { starter: 400, standard: 800, advanced: 1400, enterprise: 2200 },
    promo: true,
    packages: [
      { name: "Basic Storefront", price: 400, includes: "custom storefront, up to 100 products, categories & search, cart & checkout with cash on delivery (online payment gateway is in the Advanced E-Commerce plan), free domain (1st year)" },
      { name: "Advanced E-Commerce", price: 800, includes: "everything in Basic, online payment gateway, unlimited products & bulk import, variants, shipping & tax, order dashboard, customer accounts, coupons" },
      { name: "Marketplace + Social Commerce", price: 1400, includes: "multi-vendor, vendor dashboard & commissions, live chat & reviews, real-time shipping, Facebook/Instagram shop, social media starter package" },
    ],
    weeks: { min: 2, max: 6 },
    monthly: { label: "Store care & optimisation", min: 30, max: 100 },
    deliverables: [
      { title: "Store architecture & product catalogue setup", description: "Catalogue structure, product data model, variants and collections planned for growth." },
      { title: "Storefront UI design", description: "Conversion-focused designs for home, collection, product, cart and checkout experiences." },
      { title: "Checkout, payments & shipping configuration", description: "Payment options, taxes, shipping zones and transactional emails configured end to end." },
      { title: "Integrations, QA & launch", description: "Inventory, analytics and marketing integrations, full QA and a smooth store launch." },
    ],
    relatedFeatures: ["payments", "multilingual", "accounts", "analytics", "crm", "integrations"],
  },
  {
    key: "pos-system",
    name: "POS System",
    tagline: "Point-of-sale for shops & restaurants",
    icon: "receipt",
    kind: "tiered",
    price: { min: 350, max: 1800 },
    tiers: { starter: 350, standard: 700, advanced: 1100, enterprise: 1800 },
    promo: true,
    packages: [
      { name: "POS Lite", price: 350, includes: "desktop POS, products & categories, sales & receipt printing, basic inventory, cashier access, 12 months support" },
      { name: "POS Pro", price: 700, includes: "multi-user & branches, stock alerts & reports, customer loyalty, discounts/taxes engine, sales dashboard, shift reports, Android tablet support" },
      { name: "POS Ultimate + Cloud Sync", price: 1100, includes: "real-time cloud sync, multi-location dashboard, web management portal, printer/barcode integration, online order sync, API access, 24 months support" },
    ],
    weeks: { min: 1, max: 6 },
    monthly: { label: "POS support & cloud hosting", min: 20, max: 80 },
    deliverables: [
      { title: "Workflow & inventory setup", description: "Mapping your sales flow, products, taxes and users before configuration." },
      { title: "POS configuration & interface", description: "A fast cashier interface with your catalogue, discounts and receipts." },
      { title: "Hardware, reports & sync", description: "Printer and barcode setup, reporting dashboards and branch/cloud sync where included." },
      { title: "Training & go-live", description: "Staff training, data import and on-site/remote launch support." },
    ],
    relatedFeatures: ["dashboard", "integrations", "analytics"],
  },
  {
    key: "mobile-app",
    name: "Mobile App",
    tagline: "iOS & Android apps, cross-platform",
    icon: "smartphone",
    kind: "tiered",
    // Hybrid Mobile Applications (Flutter / React Native) — asdesignlb.com, from $700.
    price: { min: 900, max: 5000 },
    tiers: { starter: 900, standard: 1800, advanced: 3500, enterprise: 5000 },
    promo: true,
    packages: [
      { name: "Hybrid Mobile Application (Flutter / React Native)", price: 900, includes: "Android + iOS single codebase, custom UI, REST API, login & registration, push notifications, camera/location/uploads, store deployment" },
    ],
    weeks: { min: 3, max: 10 },
    monthly: { label: "App maintenance & support", min: 40, max: 120 },
    deliverables: [
      { title: "Product scoping & technical architecture", description: "Feature prioritisation, technical architecture and a release roadmap for version one." },
      { title: "App UX/UI design", description: "Native-feeling designs for iOS and Android, from onboarding to every core flow." },
      { title: "Cross-platform development & API", description: "A cross-platform app with the backend and APIs it needs, built in iterative sprints." },
      { title: "Store submission & launch support", description: "App Store and Google Play preparation, submission and launch monitoring." },
    ],
    relatedFeatures: ["accounts", "payments", "booking", "integrations", "dashboard", "ai-assistant"],
  },
  {
    key: "brand-identity",
    name: "Brand Identity & Design",
    tagline: "Logo, packaging & sticker design",
    icon: "gem",
    kind: "items",
    price: { min: 5, max: 50 },
    tiers: {},
    promo: false,
    weeks: { min: 1, max: 1 },
    deliverables: [
      { title: "Concepts", description: "Design directions based on your brief, references and audience." },
      { title: "Refinement", description: "Revisions on the chosen direction until it is right." },
      { title: "Final files", description: "Final files ready for print and web." },
    ],
    relatedFeatures: ["copywriting", "content-production"],
  },
  {
    key: "social-media",
    name: "Social Media Management",
    tagline: "Monthly management, with or without ads",
    icon: "megaphone",
    kind: "tiered",
    price: { min: 160, max: 200 },
    // One month of management · one month with Ads Manager campaigns.
    tiers: { starter: 160, standard: 200 },
    promo: false,
    weeks: { min: 4, max: 4 },
    deliverables: [
      { title: "Monthly content plan", description: "What to post, when and why, aligned with your goals." },
      { title: "Design & publishing", description: "Post designs, captions and scheduled publishing for the month." },
      { title: "Ads Manager campaigns", description: "Paid campaign setup and management in Meta Ads Manager (Professional plan; ad budget paid to Meta separately)." },
    ],
    relatedFeatures: ["content-production", "copywriting", "analytics"],
  },
  {
    key: "motion-3d",
    name: "Reels & Video Design",
    tagline: "Short videos & reels for social media",
    icon: "clapperboard",
    kind: "items",
    price: { min: 35, max: 35 },
    tiers: {},
    promo: false,
    weeks: { min: 1, max: 1 },
    deliverables: [
      { title: "Concept & script", description: "The idea, hook and script for each video." },
      { title: "Editing & motion", description: "Editing, motion graphics, music and captions." },
      { title: "Delivery", description: "Final videos in the right formats for Instagram, TikTok and more." },
    ],
    relatedFeatures: ["content-production", "copywriting"],
  },
  {
    key: "career-docs",
    name: "CV, Cover Letter & LinkedIn",
    tagline: "ATS-friendly CVs, cover letters & LinkedIn profiles",
    icon: "file-text",
    kind: "items",
    price: { min: 7, max: 30 },
    tiers: {},
    promo: false,
    weeks: { min: 1, max: 1 },
    deliverables: [
      { title: "Content review", description: "Reviewing your experience, target role and keywords." },
      { title: "Writing & design", description: "An ATS-friendly structure and a clean professional design." },
      { title: "Final files", description: "PDF and editable files, with one round of revisions." },
    ],
    relatedFeatures: [],
  },
  {
    key: "ui-ux",
    name: "UI/UX & Product Design",
    tagline: "Research, prototypes & design systems",
    icon: "pen-tool",
    kind: "tiered",
    price: { min: 150, max: 500 },
    tiers: { starter: 150, standard: 250, advanced: 400, enterprise: 500 },
    promo: false,
    weeks: { min: 1, max: 4 },
    deliverables: [
      { title: "User research & journey mapping", description: "Interviews, analytics review and journey maps that surface the highest-value opportunities." },
      { title: "Wireframes & interactive prototype", description: "Clickable prototypes to validate flows with real users before visual design." },
      { title: "High-fidelity UI design", description: "Polished interface design for every screen and state, ready for development." },
      { title: "Design system & developer handoff", description: "Components, tokens and documentation so your product scales consistently." },
    ],
    relatedFeatures: ["dashboard", "accounts", "analytics"],
  },
  {
    key: "seo-content",
    name: "SEO & Content",
    tagline: "Technical SEO, content strategy & copy",
    icon: "search",
    kind: "tiered",
    price: { min: 150, max: 600 },
    tiers: { starter: 150, standard: 300, advanced: 450, enterprise: 600 },
    promo: false,
    weeks: { min: 2, max: 4 },
    monthly: { label: "SEO & content retainer", min: 50, max: 150 },
    deliverables: [
      { title: "Technical SEO audit", description: "A crawl-based audit of speed, indexation, structure and on-page issues, prioritised by impact." },
      { title: "Keyword & content strategy", description: "Keyword research, topic clusters and a content calendar aligned with your goals." },
      { title: "On-page optimisation", description: "Optimised titles, structure, internal links and schema across priority pages." },
      { title: "Reporting dashboard", description: "A live dashboard tracking rankings, traffic and conversions." },
    ],
    relatedFeatures: ["copywriting", "blog", "analytics", "multilingual"],
  },
];

/* ----------------------------------------------------------------------------
 * Fixed-price items (for "items" services)
 * ------------------------------------------------------------------------- */

export const ITEM_KEYS = ["logo", "packaging", "stickers", "reel", "cv-ats", "cover-letter", "linkedin"] as const;
export type ItemKey = (typeof ITEM_KEYS)[number];

export interface ItemDefinition {
  key: ItemKey;
  service: ServiceKey;
  name: string;
  /** What one unit is, e.g. "design", "video". */
  unit: string;
  price: number;
}

export const ITEMS: ItemDefinition[] = [
  { key: "logo", service: "brand-identity", name: "Logo design", unit: "logo", price: 50 },
  { key: "packaging", service: "brand-identity", name: "Packaging design", unit: "design", price: 20 },
  { key: "stickers", service: "brand-identity", name: "Sticker design", unit: "sticker", price: 5 },
  { key: "reel", service: "motion-3d", name: "Reel / short video design", unit: "video", price: 35 },
  { key: "cv-ats", service: "career-docs", name: "ATS-friendly CV", unit: "CV", price: 20 },
  { key: "cover-letter", service: "career-docs", name: "Cover letter", unit: "letter", price: 7 },
  { key: "linkedin", service: "career-docs", name: "LinkedIn profile optimisation", unit: "profile", price: 30 },
];

/* ----------------------------------------------------------------------------
 * Feature add-ons
 * ------------------------------------------------------------------------- */

export const FEATURE_KEYS = [
  "cms",
  "multilingual",
  "booking",
  "payments",
  "accounts",
  "blog",
  "crm",
  "ai-assistant",
  "analytics",
  "dashboard",
  "integrations",
  "copywriting",
  "content-production",
  "care-plan",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export interface FeatureDefinition {
  key: FeatureKey;
  name: string;
  description: string;
  /** One-time cost added to the project. */
  price: number;
  /** Extra delivery time in weeks. */
  weeks: number;
  /** Optional recurring cost per month. */
  monthly?: number;
}

export const FEATURES: FeatureDefinition[] = [
  { key: "cms", name: "Advanced admin panel", description: "Full control to edit every page, section & image yourself", price: 75, weeks: 0.5 },
  { key: "multilingual", name: "Multilingual (EN · AR · FR)", description: "Localised content incl. right-to-left Arabic", price: 100, weeks: 0.5 },
  { key: "booking", name: "Bookings & appointments", description: "Scheduling, availability & reminders", price: 100, weeks: 0.5 },
  { key: "payments", name: "Online payment gateway", description: "Cards & local gateways — available from the Professional plan", price: 100, weeks: 0.5 },
  { key: "accounts", name: "User accounts", description: "Sign-up, login & member areas", price: 150, weeks: 1 },
  { key: "blog", name: "Blog / journal", description: "Editorial templates & categories", price: 50, weeks: 0.5 },
  { key: "crm", name: "CRM & marketing sync", description: "HubSpot, Airtable, Notion, Mailchimp…", price: 75, weeks: 0.5 },
  { key: "ai-assistant", name: "AI assistant", description: "Chat assistant trained on your content", price: 150, weeks: 1, monthly: 15 },
  { key: "analytics", name: "Analytics & tracking", description: "GA4, pixels, conversion events", price: 50, weeks: 0.5 },
  { key: "dashboard", name: "Custom dashboard", description: "Internal tools & reporting views", price: 200, weeks: 1.5 },
  { key: "integrations", name: "API integrations", description: "ERP, POS, logistics & third-party APIs", price: 150, weeks: 1 },
  { key: "copywriting", name: "Copywriting", description: "Conversion-focused copy in your voice", price: 75, weeks: 0.5 },
  { key: "content-production", name: "Photo & video production", description: "Art-directed shoots & edits", price: 125, weeks: 1 },
  { key: "care-plan", name: "Care plan", description: "Hosting, updates, backups & support", price: 0, weeks: 0, monthly: 25 },
];

/**
 * The online payment gateway is never part of the Essential plan (it is the
 * hardest part to deliver): plans below this tier leave it out, and a client
 * who asks for it is recommended at least this plan. Admin-editable.
 */
export const PAYMENTS_MIN_TIER: ScaleKey = "standard";


/* ----------------------------------------------------------------------------
 * Scope scale, budgets, timelines & other brief options
 * ------------------------------------------------------------------------- */

export const SCALE_KEYS = ["starter", "standard", "advanced", "enterprise"] as const;
export type ScaleKey = (typeof SCALE_KEYS)[number];

/**
 * Scope scale. Service prices come from each service's `tiers`; `priceMultiplier`
 * only describes relative effort in the AI rate card.
 */
export const SCALES: {
  key: ScaleKey;
  name: string;
  description: string;
  priceMultiplier: number;
  weeksMultiplier: number;
}[] = [
  { key: "starter", name: "Starter", description: "Lean scope — the essentials, beautifully done", priceMultiplier: 0.8, weeksMultiplier: 0.8 },
  { key: "standard", name: "Standard", description: "A complete, polished launch", priceMultiplier: 1, weeksMultiplier: 1 },
  { key: "advanced", name: "Advanced", description: "Custom interactions, integrations & content depth", priceMultiplier: 1.35, weeksMultiplier: 1.25 },
  { key: "enterprise", name: "Enterprise", description: "Multi-market, complex systems & governance", priceMultiplier: 1.85, weeksMultiplier: 1.6 },
];

export const BUDGET_KEYS = ["under-300", "300-700", "700-1.5k", "1.5k-3k", "3k-plus", "not-sure"] as const;
export type BudgetKey = (typeof BUDGET_KEYS)[number];

/** Buckets matched to AS Design's real project sizes ($150 startup site → $1,700 top POS tier). */
export const BUDGETS: { key: BudgetKey; label: string; min: number | null; max: number | null }[] = [
  { key: "under-300", label: "Under $300", min: 0, max: 300 },
  { key: "300-700", label: "$300 – $700", min: 300, max: 700 },
  { key: "700-1.5k", label: "$700 – $1.5k", min: 700, max: 1500 },
  { key: "1.5k-3k", label: "$1.5k – $3k", min: 1500, max: 3000 },
  { key: "3k-plus", label: "$3k +", min: 3000, max: null },
  { key: "not-sure", label: "Not sure yet", min: null, max: null },
];

/**
 * When the client wants it. Short options first — most projects ship within
 * days or a couple of weeks. "custom" = the client typed a number of days.
 * The month-based keys are kept only so older leads still display.
 */
export const TIMELINE_KEYS = ["asap", "1-week", "2-weeks", "1-month", "flexible", "custom", "1-2-months", "2-4-months", "4-plus-months"] as const;
export type TimelineKey = (typeof TIMELINE_KEYS)[number];

export const TIMELINES: {
  key: TimelineKey;
  label: string;
  description: string;
  /** Rush projects carry a premium. */
  priceMultiplier: number;
  /** Rush projects are compressed (more people in parallel). */
  weeksMultiplier: number;
  /** Not offered in the builder (typed-in days, or older leads). */
  hidden?: boolean;
}[] = [
  { key: "asap", label: "ASAP (rush)", description: "Rush delivery, as fast as possible", priceMultiplier: 1.2, weeksMultiplier: 0.75 },
  { key: "1-week", label: "Within a week", description: "Fast delivery", priceMultiplier: 1, weeksMultiplier: 1 },
  { key: "2-weeks", label: "Within 2 weeks", description: "Our usual pace", priceMultiplier: 1, weeksMultiplier: 1 },
  { key: "1-month", label: "Within a month", description: "Relaxed schedule", priceMultiplier: 1, weeksMultiplier: 1 },
  { key: "flexible", label: "Flexible", description: "We'll plan it together", priceMultiplier: 1, weeksMultiplier: 1 },
  { key: "custom", label: "Specific number of days", description: "The client's own delivery date", priceMultiplier: 1, weeksMultiplier: 1, hidden: true },
  { key: "1-2-months", label: "1–2 months", description: "Our usual pace", priceMultiplier: 1, weeksMultiplier: 1, hidden: true },
  { key: "2-4-months", label: "2–4 months", description: "Relaxed schedule", priceMultiplier: 1, weeksMultiplier: 1, hidden: true },
  { key: "4-plus-months", label: "4+ months", description: "Phased programme", priceMultiplier: 1, weeksMultiplier: 1, hidden: true },
];

/**
 * What kind of work it is. `priceFactor` scales every one-time price: editing
 * existing work costs less than making it new. Admin-editable (Settings → Pricing).
 */
export const PROJECT_TYPES = [
  { key: "new", label: "Something new", description: "A new brand, product or platform", priceFactor: 1 },
  { key: "redesign", label: "A redesign", description: "Rebuild or refresh what already exists", priceFactor: 0.8 },
  { key: "extend", label: "Edits to existing work", description: "Changes or additions to an existing site, design or file", priceFactor: 0.5 },
] as const;
export type ProjectTypeKey = (typeof PROJECT_TYPES)[number]["key"];

export const GOALS = [
  { key: "generate-leads", label: "Generate more leads" },
  { key: "sell-online", label: "Sell online" },
  { key: "elevate-brand", label: "Elevate our brand" },
  { key: "launch-product", label: "Launch a new product" },
  { key: "automate-operations", label: "Automate operations" },
  { key: "improve-conversion", label: "Improve conversion" },
  { key: "enter-new-market", label: "Enter a new market" },
  { key: "support-fundraising", label: "Support fundraising" },
] as const;
export type GoalKey = (typeof GOALS)[number]["key"];

export const ASSETS = [
  { key: "logo", label: "Logo" },
  { key: "brand-guidelines", label: "Brand guidelines" },
  { key: "copy", label: "Written content" },
  { key: "photography", label: "Photography / video" },
  { key: "website", label: "Existing website" },
  { key: "domain-hosting", label: "Domain & hosting" },
] as const;
export type AssetKey = (typeof ASSETS)[number]["key"];

export const LANGUAGES = [
  { key: "en", label: "English" },
  { key: "ar", label: "Arabic" },
  { key: "fr", label: "French" },
  { key: "other", label: "Other" },
] as const;
export type LanguageKey = (typeof LANGUAGES)[number]["key"];

export const CONTACT_METHODS = [
  { key: "email", label: "Email" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "phone", label: "Phone call" },
  { key: "video-call", label: "Video call" },
] as const;
export type ContactMethodKey = (typeof CONTACT_METHODS)[number]["key"];

export const INDUSTRIES = [
  "Architecture & interiors",
  "Education",
  "Fashion & retail",
  "Finance & fintech",
  "Food & beverage",
  "Healthcare & wellness",
  "Hospitality & tourism",
  "Non-profit & NGO",
  "Real estate",
  "Technology & SaaS",
  "Other",
];

/* ----------------------------------------------------------------------------
 * Commercial defaults
 * ------------------------------------------------------------------------- */

export const DEFAULT_PAYMENT_SCHEDULE = [
  { label: "Project kickoff", percent: 40 },
  { label: "Design approval", percent: 40 },
  { label: "Launch & handover", percent: 20 },
];

/** Standard delivery phases; `share` is the portion of total weeks (see `phasePlan` for short projects). */
export const DELIVERY_PHASES = [
  { key: "discovery", name: "Discovery & Strategy", share: 0.15 },
  { key: "design", name: "Design", share: 0.3 },
  { key: "build", name: "Build & Production", share: 0.4 },
  { key: "launch", name: "QA & Launch", share: 0.15 },
] as const;

export const PROPOSAL_VALIDITY_DAYS = 30;

/**
 * Default promotion, mirroring asdesignlb.com/pricing ("25% discount applies to all
 * packages except the $150 Startup Website"). Admin-editable in Settings; a percent
 * of 0 turns it off. It discounts only services marked `promo` (the published
 * packages), never PROMO_EXEMPT tiers, items or add-ons.
 */
export const DEFAULT_PROMO = { percent: 0, label: "Project pricing", exemptUpTo: 0 } as const;

export interface Promo {
  percent: number;
  label: string;
  /** Kept for stored settings; eligibility is per service (see `promo` and PROMO_EXEMPT). */
  exemptUpTo: number;
}

/* ----------------------------------------------------------------------------
 * Lookup helpers
 * ------------------------------------------------------------------------- */

export const SERVICE_MAP = Object.fromEntries(SERVICES.map((s) => [s.key, s])) as Record<ServiceKey, ServiceDefinition>;
export const ITEM_MAP = Object.fromEntries(ITEMS.map((i) => [i.key, i])) as Record<ItemKey, ItemDefinition>;
export const PROJECT_TYPE_MAP = Object.fromEntries(PROJECT_TYPES.map((t) => [t.key, t])) as Record<ProjectTypeKey, (typeof PROJECT_TYPES)[number]>;

/**
 * A tiered service's regular price at a plan tier. A tier the service doesn't offer
 * falls back to the nearest lower tier (then the nearest higher one), so a service
 * with two plans (e.g. social media 160 / 200) simply stays at its top plan.
 */
export function tierPrice(service: Pick<ServiceDefinition, "kind" | "tiers">, tier: ScaleKey): number {
  if (service.kind === "items") return 0;
  const index = SCALE_KEYS.indexOf(tier);
  for (let i = index; i >= 0; i--) {
    const price = service.tiers[SCALE_KEYS[i]];
    if (typeof price === "number") return price;
  }
  for (let i = index + 1; i < SCALE_KEYS.length; i++) {
    const price = service.tiers[SCALE_KEYS[i]];
    if (typeof price === "number") return price;
  }
  return 0;
}

/** The tier a service's price actually comes from at `tier` (see `tierPrice`). */
export function effectiveTier(service: Pick<ServiceDefinition, "kind" | "tiers">, tier: ScaleKey): ScaleKey | null {
  if (service.kind === "items") return null;
  const index = SCALE_KEYS.indexOf(tier);
  for (let i = index; i >= 0; i--) if (typeof service.tiers[SCALE_KEYS[i]] === "number") return SCALE_KEYS[i];
  for (let i = index + 1; i < SCALE_KEYS.length; i++) if (typeof service.tiers[SCALE_KEYS[i]] === "number") return SCALE_KEYS[i];
  return null;
}
export const FEATURE_MAP = Object.fromEntries(FEATURES.map((f) => [f.key, f])) as Record<FeatureKey, FeatureDefinition>;
export const SCALE_MAP = Object.fromEntries(SCALES.map((s) => [s.key, s])) as Record<ScaleKey, (typeof SCALES)[number]>;
export const BUDGET_MAP = Object.fromEntries(BUDGETS.map((b) => [b.key, b])) as Record<BudgetKey, (typeof BUDGETS)[number]>;
export const TIMELINE_MAP = Object.fromEntries(TIMELINES.map((t) => [t.key, t])) as Record<TimelineKey, (typeof TIMELINES)[number]>;

export function labelFor<T extends { key: string; label?: string; name?: string }>(
  list: readonly T[],
  key: string | null | undefined,
): string {
  if (!key) return "—";
  const hit = list.find((item) => item.key === key);
  return hit?.label ?? hit?.name ?? key;
}

/**
 * Delivery phases for a project of `totalWeeks`, in half-week steps that add up
 * exactly: two phases for a one-week job, three up to three weeks, four above.
 */
export function phasePlan(totalWeeks: number): { key: string; name: string; weeks: number }[] {
  const total = Math.max(1, Math.round(totalWeeks * 2) / 2);
  const plan: { key: string; name: string; share: number }[] =
    total <= 1.5
      ? [
          { key: "design", name: "Design & approval", share: 0.5 },
          { key: "launch", name: "Build & launch", share: 0.5 },
        ]
      : total <= 3
        ? [
            { key: "design", name: "Discovery & design", share: 0.4 },
            { key: "build", name: "Build & production", share: 0.4 },
            { key: "launch", name: "QA & launch", share: 0.2 },
          ]
        : DELIVERY_PHASES.map((phase) => ({ key: phase.key, name: phase.name, share: phase.share }));
  const phases = plan.map((phase) => ({ key: phase.key, name: phase.name, weeks: Math.max(0.5, Math.round(total * phase.share * 2) / 2) }));
  let diff = total - phases.reduce((sum, phase) => sum + phase.weeks, 0);
  // Put any rounding difference on the longest phase (never below half a week).
  while (Math.abs(diff) >= 0.5) {
    const longest = phases.reduce((best, phase, i) => (phase.weeks > phases[best].weeks ? i : best), 0);
    const step = diff > 0 ? 0.5 : -0.5;
    if (phases[longest].weeks + step < 0.5) break;
    phases[longest].weeks += step;
    diff -= step;
  }
  return phases;
}

/** "Within 5 days" for a typed-in delivery time, otherwise the timeline's label. */
export function timelineLabel(plan: { timeline: string; deliveryDays?: number | null }): string {
  if (plan.timeline === "custom" && plan.deliveryDays) return `Within ${plan.deliveryDays} day${plan.deliveryDays === 1 ? "" : "s"}`;
  return TIMELINE_MAP[plan.timeline as TimelineKey]?.label ?? plan.timeline;
}
