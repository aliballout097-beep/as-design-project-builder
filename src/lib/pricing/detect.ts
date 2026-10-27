import { ITEM_MAP, type ItemKey, type ServiceKey } from "@/config/catalog";

/**
 * Reads the client's project description for work they didn't tick — e.g. they
 * select "Brand identity" (a $50 logo) but write "I need a website for my
 * restaurant". The pipeline adds what it finds to the priced scope, so the
 * proposal covers what the client actually asked for; the builder offers it
 * as a one-tap suggestion before they submit.
 *
 * Deliberately conservative (a wrong addition costs trust):
 *  - Arabic "موقع" alone also means "location", so a website needs context
 *    ("موقع إلكتروني", "بدي موقع", "ويبسايت", "website").
 *  - Things the client already has or doesn't want are skipped:
 *    "عندي موقع", "ما بدي لوغو", "we already have a logo", "الموقع موجود".
 *  - Possessive forms ("موقعي", "my website") point at existing work, not new work.
 */

export interface Detection {
  /** Services found in the text (tiered services, or the parent of a found item). */
  services: ServiceKey[];
  /** Fixed-price items found in the text, with any quantity written next to them ("10 ستيكرز"). */
  items: Partial<Record<ItemKey, number>>;
  /** The phrases that matched, for the team's notes. */
  evidence: string[];
}

type Target = { service: ServiceKey } | { item: ItemKey };

interface Rule {
  target: Target;
  /** Matches on their own. */
  strong: RegExp[];
  /** Only count right after a "want/make" word ("بدي تطبيق", "تصميم تطبيق"). */
  bare?: RegExp[];
  /** Add to the priced scope automatically (otherwise only suggested in the builder). */
  auto: boolean;
}

// Arabic has no \b: a match must not be glued to other letters. Optional
// proclitics (و، ف، ب، ل، ال، لل) are allowed before a keyword.
const L = "\\p{L}\\p{M}";
const PRE = `(?<![${L}])(?:[وفبل]?(?:ال|لل)?)`;
const END = `(?![${L}])`;
const ar = (source: string) => new RegExp(`${PRE}(?:${source})${END}`, "giu");
const en = (source: string) => new RegExp(`(?<![\\p{L}])(?:${source})(?![\\p{L}])`, "giu");

const RULES: Rule[] = [
  {
    target: { service: "ecommerce" },
    auto: true,
    strong: [
      ar("متجر\\s*(?:ال)?(?:إلكتروني|الكتروني|اونلاين|أونلاين|أون\\s*لاين|اون\\s*لاين)"),
      ar("(?:بيع|نبيع|أبيع|ابيع)\\s+(?:اونلاين|أونلاين|أون\\s*لاين|عبر\\s+(?:ال)?(?:إنترنت|انترنت|الموقع))"),
      en("online\\s+(?:store|shop)|e-?commerce|web\\s*shop|shopify|woocommerce|sell\\s+online"),
    ],
  },
  {
    target: { service: "web-design" },
    auto: true,
    strong: [
      ar("موقع\\s*(?:ال)?(?:إلكتروني|الكتروني|ويب|انترنت|إنترنت)"),
      ar("ويب\\s*سايت|ويبسايت|وبسايت|ويب\\s*سايد"),
      en("web\\s*site|site\\s+web"),
    ],
    bare: [ar("موقع")],
  },
  {
    target: { service: "landing-page" },
    auto: false,
    strong: [ar("صفحة\\s+هبوط|لاندينج\\s*بيج|لاندنغ\\s*بيج|لاندينغ"), en("landing\\s+page")],
  },
  {
    target: { service: "mobile-app" },
    auto: true,
    strong: [
      ar("تطبيق\\s*(?:ال)?(?:موبايل|جوال|هاتف|ايفون|آيفون|أندرويد|اندرويد|للموبايل|للجوال)"),
      ar("أبلكيشن|ابلكيشن|ابليكيشن|أبليكيشن|ابلكيشن"),
      en("(?:mobile|ios|android|iphone)\\s+app(?:lication)?|app\\s+store|play\\s+store|mobile\\s+application"),
    ],
    bare: [ar("تطبيق|برنامج\\s+موبايل"), en("app")],
  },
  {
    target: { service: "pos-system" },
    auto: true,
    strong: [
      ar("(?:نظام|سيستم|سيستيم|برنامج)\\s+(?:ال)?(?:نقاط\\s+البيع|نقطة\\s+بيع|كاشير|مبيعات|فواتير|فوترة|مخزون|محاسبة)"),
      ar("كاشير"),
      en("pos\\s+system|point\\s+of\\s+sale|cashier\\s+system|inventory\\s+system"),
    ],
  },
  {
    target: { service: "ai-website" },
    auto: false,
    strong: [ar("شات\\s*بوت|بوت\\s+(?:ذكي|واتس\\s*اب|واتساب)|أتمتة|اتمتة"), en("chat\\s*bot|automation|ai\\s+agent")],
  },
  {
    target: { service: "social-media" },
    auto: true,
    strong: [
      ar("(?:إدارة|ادارة|مسك|ادير|يدير|تدير)\\s+(?:ال)?(?:سوشيال|سوشال|صفحات|صفحة|حسابات|حساب|انستغرام|انستقرام|إنستغرام|فيسبوك|فيس\\s*بوك|تيك\\s*توك)"),
      ar("(?:إعلانات|اعلانات|حملات|حملة)\\s+(?:ممولة|إعلانية|اعلانية|مموّلة)"),
      ar("آدز\\s*مانجر|ادز\\s*مانجر|ادز\\s*مانيجر"),
      en("social\\s+media\\s+(?:management|manager|marketing)|manage\\s+(?:my|our|the)?\\s*(?:social|instagram|facebook|pages)|ads\\s+manager|meta\\s+ads|sponsored\\s+ads|paid\\s+ads"),
    ],
  },
  {
    target: { item: "logo" },
    auto: true,
    strong: [ar("لوغو|لوجو|لوقو|لوكو|شعار"), en("logo(?:type)?")],
  },
  {
    target: { service: "brand-identity" },
    auto: true,
    strong: [ar("هوية\\s+(?:ال)?(?:بصرية|تجارية)|براندينج|براندنج|براندينغ"), en("brand\\s+identity|branding|visual\\s+identity")],
  },
  {
    target: { item: "packaging" },
    auto: true,
    strong: [ar("تغليف|علب|علبة|باكجينج|باكيجينج|باكيجنج|بكجينج|تصميم\\s+(?:ال)?(?:كرتونة|كياس|أكياس|اكياس)"), en("packaging|package\\s+design|box\\s+design|label\\s+design")],
  },
  {
    target: { item: "stickers" },
    auto: true,
    strong: [ar("ستيكر|ستيكرز|ستكر|ستكرز|ستيكرات|ملصق|ملصقات|لاصق|لواصق"), en("stickers?")],
  },
  {
    target: { item: "reel" },
    auto: true,
    strong: [
      ar("ريلز|ريل|ريلات|موشن\\s*(?:جرافيك|غرافيك)|مونتاج|تصميم\\s+(?:ال)?(?:فيديو|فيديوهات)|فيديو\\s+(?:ال)?(?:إعلاني|اعلاني|ترويجي)|فيديوهات\\s+(?:ال)?(?:إعلانية|اعلانية|ترويجية)"),
      en("reels?|motion\\s+graphics?|video\\s+editing|promo(?:tional)?\\s+videos?"),
    ],
  },
  {
    target: { item: "cv-ats" },
    auto: true,
    strong: [ar("سيرة\\s+(?:ال)?ذاتية|سي\\s*في|سيفي"), en("cv|resume|résumé|curriculum\\s+vitae")],
  },
  {
    target: { item: "cover-letter" },
    auto: true,
    strong: [ar("كفر\\s*ليتر|كوفر\\s*ليتر|خطاب\\s+(?:ال)?تقديم|رسالة\\s+(?:ال)?(?:تغطية|تعريفية|تحفيزية)"), en("cover\\s+letter|motivation\\s+letter")],
  },
  {
    target: { item: "linkedin" },
    auto: true,
    strong: [
      ar("(?:بروفايل|بروفايلي|حساب|صفحة|تحسين|تصميم|تعديل|كتابة|ترتيب|تظبيط|تزبيط)\\s+(?:ال)?(?:لينكد\\s*إن|لينكد\\s*ان|لينكدإن|لينكدان|لينكدين|linkedin)"),
      en("linkedin\\s+(?:profile|page|optimi[sz]\\w*|makeover|summary)|(?:optimi[sz]e|improve|update|revamp|write)\\s+(?:my\\s+|our\\s+)?linkedin"),
    ],
  },
];

/** Words that mean the client already has it or doesn't want it. */
const SKIP_WORDS = new Set([
  "عندي", "عنا", "عنّا", "عندنا", "لدي", "لديّ", "لدينا", "عندو", "عندها", "عنده", "يوجد", "موجود", "جاهز", "بدون", "بلا", "غير",
  "have", "has", "had", "existing", "current", "without", "no", "already", "our", "my",
]);
/** Words right after the keyword that mean it already exists. */
const SKIP_AFTER = new Set(["موجود", "موجودة", "جاهز", "جاهزة", "الحالي", "الحالية", "عندي", "عنا", "القديم", "القديمة", "existing", "ready", "already"]);
/** "Want / make" words: the keyword that follows is something to build. */
const WANT_WORDS = new Set([
  "بدي", "بدنا", "بدو", "بدها", "نريد", "أريد", "اريد", "بحاجة", "حابب", "حابين", "حابة", "محتاج", "محتاجة", "محتاجين", "نحتاج", "أحتاج", "احتاج", "نبغى", "ابغى", "أبغى", "بغيت",
  "تصميم", "برمجة", "عمل", "إنشاء", "انشاء", "تطوير", "بناء", "اعملي", "اعمللي", "صمملي", "صممولي", "تعمل", "تعملولي", "تعملي",
  "لازم", "لازمني", "لازمنا", "بحتاج", "منحتاج", "مطلوب", "نطلب", "بطلب", "اطلب", "أطلب", "بدكن", "بدكم",
  "want", "need", "needs", "build", "design", "create", "make", "develop", "new", "looking", "require", "requires",
]);
const NEGATIONS = new Set(["ما", "مش", "لا", "مو", "مني", "ماني", "مابدي", "don't", "dont", "not", "no", "never"]);

/** Arabic digits → Latin, and conjunction prefixes stripped ("وبدي" → "بدي"). */
interface Word {
  text: string;
  /** Started with the conjunction "و/ف" ("وبدي", "ولازم") — a new clause begins here. */
  clause: boolean;
}

function normalizeWord(word: string): Word {
  const lower = word.toLowerCase().replace(/[^\p{L}\p{M}\p{N}'’]/gu, "");
  if (lower.length > 3 && /^[وف]/.test(lower) && !SKIP_WORDS.has(lower) && !WANT_WORDS.has(lower)) return { text: lower.slice(1), clause: true };
  return { text: lower, clause: false };
}

function digits(text: string): string {
  return text.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

/** The words before `index` in the same sentence, nearest last. */
function wordsBefore(text: string, index: number, count = 6): Word[] {
  const sentence = text.slice(0, index).split(/[.!?؟،,؛;\n:()\-–—]/u).at(-1) ?? "";
  return sentence.split(/\s+/).filter(Boolean).slice(-count).map(normalizeWord);
}

function wordsAfter(text: string, index: number, count = 2): string[] {
  const sentence = text.slice(index).split(/[.!?؟،,؛;\n:()\-–—]/u)[0] ?? "";
  return sentence.split(/\s+/).filter(Boolean).slice(0, count).map((w) => normalizeWord(w).text);
}

type Verdict = "want" | "skip" | "neutral";

function intentBefore(before: Word[]): Verdict {
  for (let i = before.length - 1; i >= 0; i--) {
    const word = before[i].text;
    if (WANT_WORDS.has(word)) {
      const previous = before[i - 1];
      return previous && !before[i].clause && NEGATIONS.has(previous.text) ? "skip" : "want";
    }
    if (SKIP_WORDS.has(word) || NEGATIONS.has(word)) return "skip";
    // "عندي مطعم ولازم لوغو": what the client has stops at the next clause.
    if (before[i].clause) return "neutral";
  }
  return "neutral";
}

/** A number written right before the keyword ("10 ستيكرز", "3 reels"). */
function quantityBefore(text: string, index: number): number | null {
  const match = digits(text.slice(Math.max(0, index - 12), index)).match(/(\d{1,3})\s*(?:x|×)?\s*$/i);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 1 && value <= 100 ? value : null;
}

export interface DetectOptions {
  /** Only the rules that may change the priced scope on their own. */
  autoOnly?: boolean;
}

export function detectRequests(description: string | null | undefined, options: DetectOptions = {}): Detection {
  const text = digits(description ?? "").slice(0, 5000);
  const services = new Set<ServiceKey>();
  const items: Partial<Record<ItemKey, number>> = {};
  const evidence: string[] = [];
  if (!text.trim()) return { services: [], items, evidence };

  for (const rule of RULES) {
    if (options.autoOnly && !rule.auto) continue;
    const found = (regex: RegExp, needsWant: boolean) => {
      for (const match of text.matchAll(regex)) {
        const index = match.index ?? 0;
        const verdict = intentBefore(wordsBefore(text, index));
        if (verdict === "skip") continue;
        if (needsWant && verdict !== "want") continue;
        if (wordsAfter(text, index + match[0].length).some((w) => SKIP_AFTER.has(w))) continue;
        return { phrase: match[0].trim(), qty: quantityBefore(text, index) };
      }
      return null;
    };
    const hit = rule.strong.map((r) => found(r, false)).find(Boolean) ?? rule.bare?.map((r) => found(r, true)).find(Boolean) ?? null;
    if (!hit) continue;
    evidence.push(hit.phrase);
    if ("service" in rule.target) services.add(rule.target.service);
    else {
      items[rule.target.item] = hit.qty ?? 1;
      services.add(ITEM_MAP[rule.target.item].service);
    }
  }
  return { services: [...services], items, evidence };
}

/**
 * Services that already include another one: a store or an AI website is also
 * a website, and a website covers a landing page.
 */
export const COVERS: Partial<Record<ServiceKey, ServiceKey[]>> = {
  "ai-website": ["web-design", "landing-page"],
  ecommerce: ["web-design", "landing-page"],
  "web-design": ["landing-page"],
};

export interface ScopeWithDetection {
  services: ServiceKey[];
  items: Partial<Record<ItemKey, number>>;
  /** What detection added (empty when the selection already covered everything). */
  added: { services: ServiceKey[]; items: ItemKey[]; replaced: ServiceKey[]; evidence: string[] };
}

/**
 * The client's selection plus what the description asks for. A found service
 * that includes a selected one replaces it (picked "Website", wrote "online
 * store" → Online store); one already covered by the selection is ignored.
 */
export function mergeDetection(
  selected: { services: readonly ServiceKey[]; items?: Partial<Record<ItemKey, number>> },
  detection: Detection,
): ScopeWithDetection {
  const services = [...new Set(selected.services)];
  const items: Partial<Record<ItemKey, number>> = { ...(selected.items ?? {}) };
  const added: ScopeWithDetection["added"] = { services: [], items: [], replaced: [], evidence: [] };
  const covered = (key: ServiceKey) => services.some((s) => s === key || COVERS[s]?.includes(key));

  for (const key of detection.services) {
    if (covered(key)) continue;
    const replaces = services.filter((s) => COVERS[key]?.includes(s));
    for (const old of replaces) {
      services.splice(services.indexOf(old), 1);
      added.replaced.push(old);
    }
    services.push(key);
    added.services.push(key);
  }
  for (const [key, qty] of Object.entries(detection.items) as [ItemKey, number][]) {
    if ((items[key] ?? 0) > 0) continue;
    items[key] = qty;
    added.items.push(key);
  }
  // An items-service that was selected with no items keeps its default (the first item);
  // detection only adds items to it, so a found "logo" isn't counted twice.
  if (added.services.length || added.items.length) added.evidence = detection.evidence;
  return { services, items, added };
}
