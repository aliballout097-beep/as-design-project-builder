import { describe, expect, it } from "vitest";
import { buildSystemPrompt, renderRateCard } from "@/lib/ai/prompt";
import { detectRequests, mergeDetection } from "@/lib/pricing/detect";
import { estimateProject, priceScope } from "@/lib/pricing/estimate";
import { discountFrom, proposalLinesFrom } from "@/lib/pricing/lines";
import { resolveFeatureMap, resolveServiceMap, sanitizeOverrides } from "@/lib/pricing/overrides";
import { buildPlans, distinctTiers, pickRecommendedTier } from "@/lib/pricing/plans";
import { leadScope } from "@/lib/pricing/scope";

const PROMO = { percent: 25 };
const at = (services: Parameters<typeof priceScope>[0]["services"], tier: Parameters<typeof priceScope>[1], extra: Partial<Parameters<typeof priceScope>[0]> = {}) =>
  priceScope({ services, timeline: "1-2-months", ...extra }, tier);

describe("rate card", () => {
  it("prices a website at the published package without an implicit discount", () => {
    expect((["starter", "standard", "advanced", "enterprise"] as const).map((tier) => at(["web-design"], tier).list)).toEqual([300, 450, 800, 1200]);
    const essential = at(["web-design"], "starter");
    expect([essential.list, essential.discount.amount, essential.total]).toEqual([300, 0, 300]);
  });

  it("delivers fast: a basic website in 1–2 weeks, never under a week", () => {
    const essential = at(["web-design"], "starter");
    expect([essential.weeksMin, essential.weeksMax]).toEqual([1, 2]);
    expect(at(["career-docs"], "starter").weeksMin).toBe(1);
    expect(at(["web-design"], "enterprise").weeksMin).toBeLessThanOrEqual(5);
  });

  it("starts the AI website + system at $1,000", () => {
    expect(at(["ai-website"], "starter").list).toBe(1000);
    expect(at(["ai-website"], "enterprise").list).toBe(1000);
  });

  it("prices items per unit × quantity, and a bare brand identity as one logo", () => {
    expect(at(["brand-identity"], "standard").list).toBe(50);
    expect(at([], "standard", { items: { logo: 1, packaging: 2, stickers: 10 } }).list).toBe(50 + 40 + 50);
    expect(at(["motion-3d"], "standard", { items: { reel: 3 } }).list).toBe(105);
    expect(at(["career-docs"], "standard", { items: { "cv-ats": 1, "cover-letter": 1, linkedin: 1 } }).list).toBe(57);
  });

  it("prices social media for a month at $160, or $200 with Ads Manager", () => {
    expect(at(["social-media"], "starter").list).toBe(160);
    expect(at(["social-media"], "standard").list).toBe(200);
    expect(at(["social-media"], "enterprise").list).toBe(200);
  });

  it("charges less for edits to existing work than for new work", () => {
    const fresh = at(["web-design"], "starter");
    const edit = at(["web-design"], "starter", { projectType: "extend" });
    expect(edit.list).toBe(150);
    expect(edit.total).toBe(150);
    expect(edit.list).toBeLessThan(fresh.list);
    expect(at(["brand-identity"], "standard", { projectType: "extend" }).list).toBe(25);
  });

  it("never puts the payment gateway in the Essential plan", () => {
    const essential = at(["ecommerce"], "starter", { features: ["payments"] });
    expect(essential.paymentsExcluded).toBe(true);
    expect(essential.lines.some((l) => l.key === "payments")).toBe(false);
    const professional = at(["ecommerce"], "standard", { features: ["payments"] });
    expect(professional.paymentsExcluded).toBe(false);
    expect(professional.lines.some((l) => l.key === "payments")).toBe(true);
  });

  it("applies an explicit promotion to packages only, never fixed-price items or add-ons", () => {
    expect(priceScope({ services: ["web-design"] }, "starter", null, { promo: PROMO }).total).toBe(225);
    expect(priceScope({ services: ["web-design"] }, "starter", null, { promo: null }).total).toBe(300);
    const business = priceScope({ services: ["web-design"] }, "standard", null, { promo: PROMO });
    expect([business.list, business.discount.amount, business.total]).toEqual([450, 113, 337]);
    expect(priceScope({ services: ["brand-identity"] }, "standard", null, { promo: PROMO }).total).toBe(50);
    expect(priceScope({ services: ["social-media"] }, "starter", null, { promo: PROMO }).total).toBe(160);
    const mixed = priceScope({ services: ["web-design"], items: { logo: 1 } }, "standard", null, { promo: PROMO });
    expect(mixed.discount.amount).toBe(113); // 25% of the website only
    expect(mixed.total).toBe(450 + 50 - 113);
  });

  it("has no bundle discount", () => {
    expect(estimateProject({ services: ["web-design", "brand-identity"], scale: "standard" }).discountRate).toBe(0);
  });

  it("charges extra languages beyond the multilingual add-on", () => {
    const base = estimateProject({ services: ["web-design"], features: ["multilingual"], languages: ["en", "ar"] });
    const three = estimateProject({ services: ["web-design"], features: ["multilingual"], languages: ["en", "ar", "fr"] });
    expect(three.lines.some((l) => l.key === "extra-languages")).toBe(true);
    expect(base.lines.some((l) => l.key === "extra-languages")).toBe(false);
    expect(three.min).toBeGreaterThan(base.min);
  });

  it("returns zeros without services", () => {
    const e = estimateProject({ services: [] });
    expect([e.min, e.max, e.weeksMin]).toEqual([0, 0, 0]);
  });
});

describe("admin price overrides", () => {
  it("changes plan prices, removes plans, and reprices items, factors and the payments plan", () => {
    const overrides = sanitizeOverrides({
      services: { "web-design": { tiers: { starter: 180, enterprise: null } } },
      features: { cms: { price: 999 } },
      items: { logo: { price: 70 } },
      typeFactors: { extend: 0.4 },
      paymentsMinTier: "advanced",
    });
    expect(priceScope({ services: ["web-design"] }, "starter", overrides).list).toBe(180);
    expect(priceScope({ services: ["web-design"] }, "enterprise", overrides).list).toBe(800); // Premium not offered → Advanced
    expect(priceScope({ services: ["brand-identity"] }, "standard", overrides).list).toBe(70);
    expect(priceScope({ services: ["brand-identity"], projectType: "extend" }, "standard", overrides).list).toBe(28);
    expect(priceScope({ services: ["ecommerce"], features: ["payments"] }, "standard", overrides).paymentsExcluded).toBe(true);
    expect(resolveFeatureMap(overrides).cms.price).toBe(999);
    expect(resolveServiceMap(overrides)["web-design"].price).toEqual({ min: 180, max: 800 });
  });

  it("sanitizes unknown keys and empty input", () => {
    expect(sanitizeOverrides({ services: { nope: { tiers: { starter: 1 } } } } as never).services).toEqual({});
    expect(sanitizeOverrides(null)).toEqual({ services: {}, features: {}, items: {}, typeFactors: {} });
    // Saved by the first Pricing page (price ranges): ignored instead of distorting the plan prices.
    const legacy = sanitizeOverrides({ services: { "social-media": { price: { min: 150, max: 600 } } }, features: { cms: { price: 75 } } } as never);
    expect(priceScope({ services: ["social-media"] }, "starter", legacy).list).toBe(160);
  });

  it("feeds the new prices to the AI", () => {
    const overrides = sanitizeOverrides({ services: { "web-design": { tiers: { starter: 180 } } }, items: { logo: { price: 70 } } });
    const card = renderRateCard(overrides);
    expect(card).toContain("Essential 180");
    expect(card).toContain("logo — Logo design (brand-identity): 70 per logo");
    expect(card).toContain("never in the Essential plan");
    expect(card).toContain("No free business email");
    expect(buildSystemPrompt(overrides)).toContain("pricing.plans");
  });
});

describe("plans", () => {
  it("offers three plans around the recommended one", () => {
    const plans = buildPlans({ services: ["web-design"], timeline: "1-2-months" }, "standard", null, PROMO);
    expect(plans.map((p) => [p.key, p.listPrice, p.price])).toEqual([
      ["starter", 300, 225],
      ["standard", 450, 337],
      ["advanced", 800, 600],
    ]);
    expect(plans.find((p) => p.recommended)?.key).toBe("standard");
    expect(plans[0].includes.map((i) => i.ar)).toEqual(expect.arrayContaining(["دومين مجاني لمدة سنة", "استضافة مجانية لمدة 5 أشهر"]));
    expect(plans[0].includes.some((i) => /إيميل|بريد/.test(i.ar))).toBe(false);
  });

  it("gives items-only requests a single quote and social media two plans", () => {
    const cv = buildPlans({ services: ["career-docs"], items: { "cv-ats": 1, "cover-letter": 1 } }, "standard");
    expect(cv).toHaveLength(1);
    expect(cv[0]).toMatchObject({ nameAr: "عرض السعر", price: 27, recommended: true });
    expect(cv[0].includes.map((i) => i.ar).join(" ")).toContain("سيرة");
    const social = buildPlans({ services: ["social-media"] }, "standard");
    expect(social.map((p) => p.price)).toEqual([160, 200]);
  });

  it("recommends a plan with the payment gateway when the client asked for it", () => {
    const input = { services: ["ecommerce" as const], features: ["payments" as const] };
    const tier = pickRecommendedTier(priceScope(input, "starter").list, input);
    expect(tier).toBe("standard");
    const plans = buildPlans(input, tier);
    const essential = plans.find((p) => p.key === "starter")!;
    expect(essential.includes.some((i) => i.ar.includes("الدفع عند الاستلام"))).toBe(true);
    expect(plans.find((p) => p.recommended)?.key).toBe("standard");
  });

  it("drops plans that would cost the same", () => {
    expect(distinctTiers({ services: ["ai-website"] }).map((p) => p.tier)).toEqual(["starter"]);
  });
});

describe("proposal lines come from the rate card", () => {
  it("adds up to the plan price with the promotion as a separate line", () => {
    const priced = priceScope({ services: ["web-design"], items: { logo: 1, stickers: 4 }, features: ["cms"] }, "standard", null, { promo: PROMO });
    const lines = proposalLinesFrom(priced, [{ name: "Discovery" }, { name: "Design" }, { name: "Build" }, { name: "Launch" }]);
    const included = lines.filter((l) => l.included && l.billing === "one_time");
    expect(included.reduce((s, l) => s + l.price, 0)).toBe(priced.list);
    expect(included.find((l) => l.title.startsWith("Sticker"))?.title).toBe("Sticker design × 4");
    expect(discountFrom(priced, { percent: 25, label: "Offer" })).toEqual({ type: "amount", value: 113, label: "Offer" });
    const essential = priceScope({ services: ["web-design"] }, "starter", null, { promo: PROMO });
    expect(discountFrom(essential, { percent: 25, label: "Offer" })?.label).toBe("Offer");
  });
});

describe("detecting what the client really asked for", () => {
  it("finds a website described under another service", () => {
    const found = detectRequests("بدي لوغو لمطعمي وكمان بدي موقع إلكتروني فيه منيو");
    expect(found.services).toEqual(expect.arrayContaining(["web-design", "brand-identity"]));
    expect(found.items.logo).toBe(1);
    expect(detectRequests("We need a new website for our clinic").services).toContain("web-design");
  });

  it("ignores what the client already has or doesn't want", () => {
    expect(detectRequests("عندي موقع وبدي هوية بصرية جديدة").services).toEqual(["brand-identity"]);
    expect(detectRequests("ما بدي تطبيق، بس بدي لوغو").services).not.toContain("mobile-app");
    expect(detectRequests("We already have a logo and a website").services).toEqual([]);
    expect(detectRequests("الموقع موجود بس بدي تعديل ألوان").services).toEqual([]);
  });

  it("doesn't confuse location, links or WhatsApp with a service", () => {
    expect(detectRequests("موقع المحل في بيروت، وبدي تصميم علب للحلويات").services).toEqual(["brand-identity"]);
    expect(detectRequests("Add links to our Instagram and LinkedIn, and a WhatsApp button").services).toEqual([]);
  });

  it("reads quantities and career documents", () => {
    expect(detectRequests("بدي 10 ستيكرز و٣ ريلز").items).toEqual({ stickers: 10, reel: 3 });
    const career = detectRequests("I need an ATS CV, a cover letter and a LinkedIn profile makeover");
    expect(career.items).toEqual({ "cv-ats": 1, "cover-letter": 1, linkedin: 1 });
  });

  it("upgrades a website to a store when the client describes a store", () => {
    const merged = mergeDetection({ services: ["web-design"] }, detectRequests("بدي متجر إلكتروني لبيع الألبسة"));
    expect(merged.services).toEqual(["ecommerce"]);
    expect(merged.added.replaced).toEqual(["web-design"]);
  });

  it("prices the lead on the full scope", () => {
    const scope = leadScope({
      project: { services: ["brand-identity"], features: [], languages: ["ar"], type: "new", scale: "starter", description: "بدي لوغو وبدي موقع إلكتروني بسيط للشركة", items: { logo: 1 } },
      plan: { timeline: "1-2-months" },
    });
    expect(scope.input.services).toEqual(["brand-identity", "web-design"]);
    expect(scope.added.services).toEqual(["web-design"]);
    expect(priceScope(scope.input, "starter").total).toBe(350); // $50 logo + $300 website
  });
});

describe("fast delivery and the Essential plan as the default suggestion", () => {
  it("recommends the plan the client picked — the Essential plan by default", async () => {
    const { recommendedTierFor } = await import("@/lib/pricing/plans");
    expect(recommendedTierFor({ services: ["web-design"] }, undefined)).toBe("starter");
    expect(recommendedTierFor({ services: ["web-design"] }, "advanced")).toBe("advanced");
    // A requested payment gateway moves the recommendation to the first plan that has it.
    expect(recommendedTierFor({ services: ["ecommerce"], features: ["payments"] }, "starter")).toBe("standard");
  });

  it("splits short projects into few half-week phases that add up exactly", async () => {
    const { phasePlan } = await import("@/config/catalog");
    for (const weeks of [1, 1.5, 2, 3, 4, 6]) {
      const phases = phasePlan(weeks);
      expect(phases.reduce((s, p) => s + p.weeks, 0)).toBe(weeks);
      expect(phases.every((p) => p.weeks >= 0.5)).toBe(true);
    }
    expect(phasePlan(1)).toHaveLength(2);
  });

  it("fits a long AI timeline into the plan's delivery time", async () => {
    const { fitTimeline } = await import("@/lib/pricing/lines");
    const { analyzeHeuristically } = await import("@/lib/ai/heuristic");
    const { makeLead } = await import("./helpers");
    const analysis = analyzeHeuristically(makeLead());
    const slow = {
      ...analysis,
      timeline: { totalWeeks: 12, phases: [1, 2, 3, 4].map((n) => ({ name: `Phase ${n}`, weeks: 3, summary: "", milestones: [] })) },
      deliverables: analysis.deliverables.map((d, i) => ({ ...d, phase: `Phase ${(i % 4) + 1}` })),
    };
    const fitted = fitTimeline(slow, 1, 2);
    expect(fitted.timeline.totalWeeks).toBeGreaterThanOrEqual(1);
    expect(fitted.timeline.totalWeeks).toBeLessThanOrEqual(2);
    const names = new Set(fitted.timeline.phases.map((p) => p.name));
    expect(fitted.deliverables.every((d) => names.has(d.phase))).toBe(true);
  });

  it("requires a phone number from the Project Builder", async () => {
    const { LeadSubmissionSchema } = await import("@/lib/schemas/lead");
    const { sampleInput } = await import("./fixtures");
    const noPhone = { ...sampleInput, contact: { ...sampleInput.contact, phone: undefined } };
    expect(LeadSubmissionSchema.safeParse(noPhone).success).toBe(false);
    expect(LeadSubmissionSchema.safeParse({ ...noPhone, meta: { source: "api" } }).success).toBe(true);
  });
});
