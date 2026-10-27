import { FEATURE_MAP, ITEM_MAP, SERVICE_MAP } from "@/config/catalog";
import { PLAN_NAMES } from "@/config/plans";
import { normalizeAnalysis, type AnalysisPhase, type Deliverable, type ScopeAnalysis } from "@/lib/schemas/analysis";
import type { ProposalDiscount, ProposalLineItem } from "@/lib/types";
import type { PricedScope } from "./estimate";
import { resolveFeatureMap, resolveIncludes, resolveServiceMap, type PricingOverrides } from "./overrides";

/**
 * Proposal line items straight from the pricing engine — one per service (at
 * its plan), item and add-on — so every price the client sees is a catalog
 * price. The AI writes the words (summary, approach, phases, timeline); it
 * never sets a price.
 */
export function proposalLinesFrom(
  priced: PricedScope,
  phases: Pick<AnalysisPhase, "name">[],
  overrides?: PricingOverrides | null,
  options: { serviceCount?: number; aiDeliverables?: Pick<Deliverable, "title" | "serviceKey" | "optional" | "billing">[] } = {},
): Omit<ProposalLineItem, "id">[] {
  const phase = (index: number) => phases[Math.min(index, Math.max(phases.length - 1, 0))]?.name ?? "";
  const designPhase = phase(1);
  const buildPhase = phase(2);
  const serviceMap = resolveServiceMap(overrides);
  const lines: Omit<ProposalLineItem, "id">[] = [];
  const edit = priced.typeFactor < 1 ? " Priced as edits to existing work." : "";
  // The AI's deliverables for a service describe the work in this client's terms.
  const aiScope = (service: string) =>
    (options.aiDeliverables ?? [])
      .filter((d) => d.serviceKey === service && !d.optional && d.billing === "one_time")
      .map((d) => d.title.trim())
      .filter(Boolean)
      .slice(0, 6);

  for (const line of priced.lines) {
    if (line.kind === "service" && line.service) {
      const plan = line.tier ? PLAN_NAMES[line.tier] : null;
      const bullets = line.tier ? resolveIncludes(line.service, line.tier, overrides) : null;
      lines.push({
        title: `${serviceMap[line.service]?.name ?? line.label}${plan ? ` — ${plan.en} plan` : ""}`,
        description: `${(aiScope(line.service).length ? aiScope(line.service) : (bullets?.en ?? [])).join(" · ")}.${edit}`.replace(/^.s*/, "").trim(),
        serviceKey: line.service,
        phase: buildPhase,
        price: line.price,
        billing: "one_time",
        optional: false,
        included: true,
      });
    } else if (line.kind === "item") {
      const item = ITEM_MAP[line.key as keyof typeof ITEM_MAP];
      const qty = line.qty ?? 1;
      lines.push({
        title: `${item?.name ?? line.label}${qty > 1 ? ` × ${qty}` : ""}`,
        description: `${qty} ${item?.unit ?? "unit"}${qty > 1 ? "s" : ""} at $${line.unitPrice ?? line.price} each.${edit}`,
        serviceKey: line.service ?? "other",
        phase: designPhase,
        price: line.price,
        billing: "one_time",
        optional: false,
        included: true,
      });
    } else if (line.kind === "feature") {
      const feature = FEATURE_MAP[line.key as keyof typeof FEATURE_MAP];
      lines.push({
        title: feature?.name ?? line.label,
        description: feature?.description ?? "",
        serviceKey: "other",
        phase: buildPhase,
        price: line.price,
        billing: "one_time",
        optional: false,
        included: true,
      });
    } else {
      lines.push({
        title: line.label,
        description: "Translation workflow, localised layouts and native-speaker review.",
        serviceKey: "other",
        phase: buildPhase,
        price: line.price,
        billing: "one_time",
        optional: false,
        included: true,
      });
    }
  }

  // An optional care/management retainer, at the catalog's starting monthly price.
  const retainer = priced.lines
    .map((l) => (l.service ? serviceMap[l.service] : undefined))
    .find((service) => service?.monthly);
  if (retainer?.monthly) {
    lines.push({
      title: retainer.monthly.label,
      description: "Optional ongoing support after launch, billed monthly and cancellable with 30 days' notice.",
      serviceKey: retainer.key,
      phase: phase(phases.length - 1),
      price: retainer.monthly.min,
      billing: "monthly",
      optional: true,
      included: false,
    });
  }
  // Up to two related add-ons the client didn't pick, as optional extras at catalog prices.
  const featureMap = resolveFeatureMap(overrides);
  const chosen = new Set(priced.lines.filter((l) => l.kind === "feature").map((l) => l.key));
  const related = [...new Set(priced.lines.flatMap((l) => (l.service ? (SERVICE_MAP[l.service]?.relatedFeatures ?? []) : [])))]
    .filter((key) => !chosen.has(key) && key !== "payments" && featureMap[key]?.price > 0)
    .slice(0, options.serviceCount && options.serviceCount > 2 ? 1 : 2);
  for (const key of related) {
    const feature = featureMap[key];
    lines.push({
      title: feature.name,
      description: `Recommended add-on: ${feature.description.charAt(0).toLowerCase()}${feature.description.slice(1)}.`,
      serviceKey: "other",
      phase: buildPhase,
      price: feature.price,
      billing: "one_time",
      optional: true,
      included: false,
    });
  }
  return lines;
}

/**
 * The discount line for a priced scope: the admin's promotion label when only the
 * promotion applies, otherwise a label naming the actual offers (e.g. the website's 50%).
 */
export function discountFrom(priced: PricedScope, promo: { percent: number; label?: string | null } | null | undefined): ProposalDiscount | null {
  if (!priced.discount.amount) return null;
  const percents = priced.discount.percents;
  const onlyPromo = promo && percents.length === 1 && percents[0] === Math.round(promo.percent);
  const label = onlyPromo && promo.label ? promo.label : `Special offer — ${percents.map((p) => `${p}%`).join(" / ")} off`;
  return { type: "amount", value: priced.discount.amount, label };
}

const round5 = (value: number) => Math.max(0, Math.round(value / 5) * 5);

/**
 * Scale the analysis' included one-time deliverables so they add up to exactly
 * `target` (the recommended plan's regular price), so the stored analysis the
 * team reviews shows the same total as the proposal. Rounds each line to 5 and
 * puts the remainder on the largest line.
 */
export function snapToTotal(analysis: ScopeAnalysis, target: number): ScopeAnalysis {
  const included = analysis.deliverables.filter((d) => !d.optional && d.billing === "one_time");
  const current = included.reduce((sum, d) => sum + d.price, 0);
  if (target <= 0 || current <= 0 || current === target) return analysis;
  const factor = target / current;
  const deliverables = analysis.deliverables.map((d) => (!d.optional && d.billing === "one_time" ? { ...d, price: round5(d.price * factor) } : d));
  const sum = deliverables.filter((d) => !d.optional && d.billing === "one_time").reduce((s, d) => s + d.price, 0);
  const remainder = target - sum;
  if (remainder !== 0) {
    let largest = -1;
    deliverables.forEach((d, index) => {
      if (!d.optional && d.billing === "one_time" && (largest < 0 || d.price > deliverables[largest].price)) largest = index;
    });
    if (largest >= 0) deliverables[largest] = { ...deliverables[largest], price: Math.max(0, deliverables[largest].price + remainder) };
  }
  return normalizeAnalysis({ ...analysis, deliverables });
}

/**
 * Keep the proposal's timeline inside the plan's delivery time (we deliver
 * fast — a basic website in about a week): when the analysis plans longer or
 * shorter, its phases are merged (so each keeps at least half a week) and
 * rescaled to the plan's time, and deliverables follow their merged phase.
 */
export function fitTimeline(analysis: ScopeAnalysis, weeksMin: number, weeksMax: number): ScopeAnalysis {
  const total = analysis.timeline.phases.reduce((sum, phase) => sum + phase.weeks, 0);
  if (weeksMax <= 0 || (total >= weeksMin && total <= weeksMax)) return analysis;
  const target = Math.max(weeksMin, Math.min(weeksMax, Math.round(((weeksMin + weeksMax) / 2) * 2) / 2));

  type Merged = AnalysisPhase & { from: string[] };
  const merged: Merged[] = analysis.timeline.phases.map((phase) => ({ ...phase, from: [phase.name] }));
  const maxPhases = Math.max(1, Math.min(4, Math.floor(target / 0.5)));
  while (merged.length > maxPhases) {
    let best = 0;
    for (let i = 1; i < merged.length - 1; i++) {
      if (merged[i].weeks + merged[i + 1].weeks < merged[best].weeks + merged[best + 1].weeks) best = i;
    }
    const [a, b] = [merged[best], merged[best + 1]];
    merged.splice(best, 2, {
      name: `${a.name} & ${b.name}`,
      weeks: a.weeks + b.weeks,
      summary: [a.summary, b.summary].filter(Boolean).join(" "),
      milestones: [...a.milestones, ...b.milestones].slice(0, 6),
      from: [...a.from, ...b.from],
    });
  }

  const sum = merged.reduce((s, phase) => s + phase.weeks, 0) || 1;
  const weeks = merged.map((phase) => Math.max(0.5, Math.round((phase.weeks / sum) * target * 2) / 2));
  let diff = target - weeks.reduce((s, w) => s + w, 0);
  while (Math.abs(diff) >= 0.5) {
    const longest = weeks.reduce((best, w, i) => (w > weeks[best] ? i : best), 0);
    const step = diff > 0 ? 0.5 : -0.5;
    if (weeks[longest] + step < 0.5) break;
    weeks[longest] += step;
    diff -= step;
  }

  const rename = new Map(merged.flatMap((phase) => phase.from.map((name) => [name, phase.name] as const)));
  return normalizeAnalysis({
    ...analysis,
    deliverables: analysis.deliverables.map((d) => ({ ...d, phase: rename.get(d.phase) ?? d.phase })),
    timeline: {
      totalWeeks: target,
      phases: merged.map((phase, i) => ({ name: phase.name, weeks: weeks[i], summary: phase.summary, milestones: phase.milestones })),
    },
  });
}
