import {
  BUDGET_MAP,
  CURRENCY,
  GOALS,
  phasePlan,
  labelFor,
  TIMELINE_MAP,
  type ServiceKey,
} from "@/config/catalog";
import { estimateProject, plannedWeeks, priceScope } from "@/lib/pricing/estimate";
import { proposalLinesFrom } from "@/lib/pricing/lines";
import { recommendedTierFor } from "@/lib/pricing/plans";
import { leadScope } from "@/lib/pricing/scope";
import { resolveFeatureMap, resolveServiceMap, type PricingOverrides } from "@/lib/pricing/overrides";
import { normalizeAnalysis, type Deliverable, type ScopeAnalysis } from "@/lib/schemas/analysis";
import type { Lead } from "@/lib/types";

/**
 * Deterministic, rule-based scope analysis built purely from the rate card.
 *
 * Used when no AI provider is configured (local development, demos), and as a
 * safety net when an AI call fails — the studio still gets a reviewable draft.
 */

/** Goals phrased for third-person copy ("… wants to elevate its brand"). */
const GOAL_PHRASES: Record<string, string> = {
  "generate-leads": "generate more qualified leads",
  "sell-online": "sell online",
  "elevate-brand": "elevate its brand",
  "launch-product": "launch a new product",
  "automate-operations": "automate day-to-day operations",
  "improve-conversion": "improve conversion",
  "enter-new-market": "enter a new market",
  "support-fundraising": "support its fundraising",
};

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

const SERVICE_QUESTIONS: Partial<Record<ServiceKey, string[]>> = {
  "brand-identity": ["Are there brands (in or outside your industry) whose positioning you admire?", "Do you need naming or only visual identity?"],
  "web-design": ["Roughly how many pages or templates do you expect at launch?", "Who will maintain the content after launch?"],
  ecommerce: ["How many products (and variants) will you launch with?", "Which payment gateways and shipping zones must be supported?"],
  "ui-ux": ["Do you have existing user research or analytics we can build on?", "Which platforms (web, iOS, Android) are in scope for design?"],
  "mobile-app": ["Is there an existing backend/API, or should we build it?", "Which features are essential for the first release?"],
  "seo-content": ["Which markets and languages should we rank in?", "Who approves content before publishing?"],
  "social-media": ["Which channels matter most to your audience?", "Is there a monthly paid media budget in addition to management fees?"],
  "motion-3d": ["Where will the reels be published, and in which formats (9:16, 1:1)?", "Will you supply the footage, or should we source visuals?"],
  "ai-website": ["Which questions should the AI assistant answer for your customers?", "Which tools should it connect to (WhatsApp, email, CRM)?"],
  "pos-system": ["How many branches and cashier devices will use the system?", "Do you need inventory and supplier management?"],
  "career-docs": ["Which roles and industries are you applying to?", "Can you share your current CV or LinkedIn profile?"],
  "landing-page": ["What single action should visitors take on the page?", "Where will the traffic come from (ads, social, email)?"],
};

export function analyzeHeuristically(lead: Lead, overrides?: PricingOverrides | null): ScopeAnalysis {
  const { project, plan, contact } = lead;
  const serviceMap = resolveServiceMap(overrides);
  const featureMap = resolveFeatureMap(overrides);
  // The client's selections plus anything the description clearly asks for.
  const scope = leadScope(lead);
  const { scale, ...planInput } = scope.input;
  const estimate = estimateProject(scope.input, overrides);
  const timeline = TIMELINE_MAP[plan.timeline];
  const budget = BUDGET_MAP[plan.budget];
  const services = scope.input.services.map((key) => serviceMap[key]).filter(Boolean);

  // The plan the client picked (moved up when they asked for a payment gateway), priced
  // exactly like the proposal's plans — regular prices; the promotion is added on the proposal.
  const tier = recommendedTierFor(planInput, scale, overrides);
  const priced = priceScope(scope.input, tier, overrides);

  // Phases sized to the plan's (fast) delivery time.
  const phaseSummaries: Record<string, string> = {
    discovery: "Workshops, research and a shared definition of success, scope and priorities.",
    design: "Concepts, iterations and a signed-off design direction across every touchpoint.",
    build: "Production and development in weekly sprints with regular demos and feedback.",
    launch: "Quality assurance, final polish, launch and a handover to your team.",
  };
  const phaseMilestones: Record<string, string[]> = {
    discovery: ["Kickoff workshop", "Strategy & scope sign-off"],
    design: ["Design direction presented", "Final design approval"],
    build: ["Sprint demos", "Content integration complete"],
    launch: ["QA sign-off", "Launch & handover"],
  };
  const phases = phasePlan(plannedWeeks(priced)).map((phase) => ({
    name: phase.name,
    weeks: phase.weeks,
    summary: phaseSummaries[phase.key],
    milestones: phaseMilestones[phase.key],
  }));

  // Deliverables: exactly the rate-card lines for the recommended plan, plus optional extras.
  const deliverables: Deliverable[] = proposalLinesFrom(priced, phases, overrides, { serviceCount: services.length }).map((line) => ({
    title: line.title,
    description: line.description,
    serviceKey: line.serviceKey,
    phase: line.phase,
    price: line.price,
    billing: line.billing,
    optional: line.optional,
    estimatedHours: null,
  }));

  const recommended = priced.list;
  const totalWeeks = phases.reduce((s, p) => s + p.weeks, 0);

  // Risks.
  const risks: ScopeAnalysis["risks"] = [];
  if (plan.timeline === "asap") {
    risks.push({ title: "Compressed timeline", severity: totalWeeks > 6 ? "high" : "medium", mitigation: "Prioritise a launch-critical scope, run design and build in parallel tracks and agree fast feedback windows." });
  }
  if (budget.max !== null && recommended > budget.max * 1.1) {
    const gap = recommended / budget.max - 1;
    risks.push({ title: "Budget below recommended scope", severity: gap > 0.35 ? "high" : "medium", mitigation: "Offer a phased roadmap: launch the core scope first and schedule the remaining items as phase two." });
  }
  if (plan.budget === "not-sure") {
    risks.push({ title: "Budget not yet defined", severity: "low", mitigation: "Share the indicative range early and confirm budget on the discovery call." });
  }
  if (project.languages.includes("ar")) {
    risks.push({ title: "Right-to-left localisation", severity: "medium", mitigation: "Design RTL layouts from the start and plan native Arabic copy review." });
  }
  if (project.features.some((f) => f === "integrations" || f === "payments" || f === "crm")) {
    risks.push({ title: "Third-party dependencies", severity: "medium", mitigation: "Confirm API access, credentials and gateway approvals during discovery." });
  }
  if (priced.paymentsExcluded) {
    risks.push({ title: "Payment gateway not in this plan", severity: "low", mitigation: "The recommended plan uses cash on delivery; the online payment gateway starts with the next plan." });
  }
  if (scope.added.services.length || scope.added.items.length) {
    risks.push({ title: "Scope found in the description", severity: "low", mitigation: `The client described work they didn't select (${scope.added.evidence.join(", ")}); it is included in the plans — confirm it on the first call.` });
  }
  if (!project.assets.length && !scope.input.services.includes("brand-identity") && scope.input.services.some((s) => s === "web-design" || s === "ecommerce")) {
    risks.push({ title: "Content & brand assets readiness", severity: "medium", mitigation: "Agree a content plan and deadlines; consider the copywriting and photography add-ons." });
  }
  if (project.description.length < 120) {
    risks.push({ title: "Brief is light on detail", severity: "low", mitigation: "Validate scope and priorities on the discovery call before final pricing." });
  }

  // Fit score.
  let fit = 60;
  if (budget.min !== null) {
    if (budget.max === null || recommended <= budget.max * 1.1) fit += 15;
    else if (recommended > budget.max * 1.35) fit -= 20;
    else fit -= 5;
  } else fit -= 5;
  if (project.description.length > 200) fit += 10;
  if (project.goals.length >= 2) fit += 5;
  if (contact.company) fit += 5;
  if (plan.timeline === "asap" && totalWeeks > 8) fit -= 10;
  fit = Math.max(5, Math.min(98, fit));

  const complexity: ScopeAnalysis["complexity"] =
    recommended < 500 ? "low" : recommended < 1200 ? "medium" : recommended < 2500 ? "high" : "very_high";

  const clientName = contact.company ?? project.name ?? contact.name;
  const serviceNames = services.map((s) => s.name);
  const serviceList = serviceNames.length ? serviceNames.join(" + ") : "Digital project";
  const serviceProse = joinList(serviceNames.map((name) => name.toLowerCase()));
  const goals = project.goals.map((g) => GOAL_PHRASES[g] ?? labelFor(GOALS, g).toLowerCase());
  const goalsText = goals.length ? joinList(goals) : "strengthen its digital presence";
  const industry = project.industry ? ` in ${project.industry.toLowerCase()}` : "";

  const questions = [
    ...services.flatMap((s) => SERVICE_QUESTIONS[s.key] ?? []).slice(0, 5),
    "Who are the decision-makers and approvers on your side?",
    plan.deadline ? `What drives the ${plan.deadline} deadline, and is it fixed?` : "Is there a launch date or event we should plan around?",
  ];

  const alignmentNote =
    budget.min === null
      ? "The client has not set a budget yet; the recommendation follows the rate card mid-range."
      : budget.max !== null && recommended > budget.max * 1.1
        ? `The recommended scope sits above the stated ${budget.label} range. A phased launch keeps phase one within budget.`
        : `The recommended scope fits the stated ${budget.label} range.`;

  return normalizeAnalysis({
    summary: `${clientName}${industry} is looking for ${serviceProse} to ${goalsText}. Budget: ${budget.label}; timeline: ${timeline.label}. Rule-based estimate (regular prices) ${(estimate.listMin ?? estimate.min).toLocaleString("en-US")}–${(estimate.listMax ?? estimate.max).toLocaleString("en-US")} ${CURRENCY}.`,
    clientNeeds: [
      ...project.goals.map((g) => labelFor(GOALS, g)),
      ...project.features.slice(0, 3).map((f) => featureMap[f]?.name ?? f),
    ].slice(0, 6),
    projectType: serviceList,
    complexity,
    fitScore: fit,
    fitRationale: `Scored on budget realism (${budget.label}), brief detail, stated goals and timeline feasibility (${timeline.label}).`,
    budget: {
      currency: CURRENCY,
      estimateLow: estimate.listMin ?? estimate.min,
      estimateHigh: estimate.listMax ?? estimate.max,
      recommended,
      monthlyRecurring: 0,
      clientBudgetLow: budget.min,
      clientBudgetHigh: budget.max,
      alignment: "unknown",
      notes: `${alignmentNote} Generated by the rule-based estimator from the studio rate card — review before sending.`,
    },
    deliverables,
    timeline: { totalWeeks, phases },
    risks,
    assumptions: [
      "Timelines assume feedback within two business days at each review point.",
      "Two rounds of revisions are included per design deliverable.",
      project.assets.includes("copy") ? "Final copy is supplied by the client." : "Content is supplied or approved by the client unless copywriting is included.",
      "Third-party licences, hosting and paid media spend are billed at cost.",
    ],
    clarifyingQuestions: questions,
    proposal: {
      title: `${clientName} — ${serviceList}`,
      executiveSummary: `Thank you for sharing your plans with us. ${clientName} wants to ${goalsText}, and we see a clear opportunity to get there with ${serviceProse} crafted around your audience${project.audience ? ` — ${project.audience.charAt(0).toLowerCase()}${project.audience.slice(1)}` : ""}.\n\nThis proposal outlines a focused scope, a realistic ${Math.round(totalWeeks)}-week timeline and a transparent investment, designed to launch with confidence and grow from there.`,
      approach:
        "We work in clear phases with a dedicated team: discovery to align on goals and success metrics, design to establish the direction, then build and production in short sprints with regular demos. You get a single point of contact, shared progress boards and sign-off moments at every milestone.",
      nextSteps: [
        "Accept this proposal online",
        "Schedule the kickoff workshop",
        "Share brand assets, content and access to existing tools",
        "Receive the detailed project plan within 3 business days",
      ],
    },
  });
}
