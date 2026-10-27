import "server-only";
import { after } from "next/server";
import { analysisPrompt, runAnalysis, type AnalysisOutcome } from "@/lib/ai";
import { getRepository } from "@/lib/db";
import { appSendsEmail, emailDeliveryFailed, emailNewLead, emailProposal, emailProposalResponse, emailProposalTeamCopy } from "@/lib/email";
import { formatMoney } from "@/lib/format";
import { proposalPdfFilename } from "@/lib/pdf/render";
import { sendProposalWhatsApp, type WhatsAppResult } from "@/lib/whatsapp";
import { getConfig } from "@/lib/env";
import { ApiError } from "@/lib/http";
import { createLeadReference } from "@/lib/ids";
import { sendToN8n, type DeliveryResult, type N8nTarget, type OutboundEventType } from "@/lib/n8n";
import { estimateProject } from "@/lib/pricing/estimate";
import { discountFrom, fitTimeline, proposalLinesFrom, snapToTotal } from "@/lib/pricing/lines";
import { buildPlans, pricedPlan, recommendedTierFor } from "@/lib/pricing/plans";
import { hasAdditions, leadScope } from "@/lib/pricing/scope";
import { withPlans } from "@/lib/pricing/resolve-plans";
import { sanitizeOverrides } from "@/lib/pricing/overrides";
import { buildProposalDraft, isProposalExpired, isShareable } from "@/lib/proposals";
import { publishEvent } from "@/lib/realtime/bus";
import { promoFromSettings, resolveSettings } from "@/lib/settings";
import type { ScopeAnalysis } from "@/lib/schemas/analysis";
import type { LeadSubmission } from "@/lib/schemas/lead";
import type {
  AnalysisProvider,
  AnalysisRecord,
  AnalysisRunner,
  EventType,
  Lead,
  LeadEvent,
  LeadStatus,
  Proposal,
} from "@/lib/types";
import { pipelinePayload } from "./payloads";

/**
 * The onboarding pipeline — a small state machine around each lead:
 *
 *   new ──► analyzing ──► review ──► approved ──► sent ──► won / lost
 *            (AI via n8n or in-app)   (human)      (n8n dispatch)  (client portal)
 *
 * Route handlers call these functions and schedule the slow parts with
 * `after()`. Every transition is recorded in the event log, which powers the
 * dashboard activity feed and its live stream.
 */

/** Business-rule violation; extends ApiError so route handlers map it to an HTTP status. */
export class PipelineError extends ApiError {
  constructor(message: string, status = 409, code = "invalid_state") {
    super(status, code, message);
    this.name = "PipelineError";
  }
}

/**
 * Run slow work (AI, PDF rendering, SMTP) without holding up the response: via
 * `after()` inside a request, or started directly when there is no request
 * scope (timers, the startup sweeper). Never throws.
 */
export function runInBackground(label: string, task: () => Promise<unknown>) {
  const run = () =>
    task().catch((error) => {
      console.error(`[pipeline] ${label} failed`, error);
    });
  try {
    after(run);
  } catch {
    void run();
  }
}

/* ----------------------------------------------------------------------------
 * Events
 * ------------------------------------------------------------------------- */

export async function recordEvent(input: {
  type: EventType;
  leadId?: string | null;
  proposalId?: string | null;
  actor: string;
  data?: Record<string, unknown>;
}): Promise<LeadEvent> {
  const event = await getRepository().addEvent({
    type: input.type,
    leadId: input.leadId ?? null,
    proposalId: input.proposalId ?? null,
    actor: input.actor,
    data: input.data ?? {},
  });
  publishEvent(event);
  return event;
}

/** Deliver to n8n and log failures to the event log (never throws). */
async function deliver(
  target: N8nTarget,
  type: OutboundEventType,
  lead: Lead,
  proposal: Proposal | null,
  extra: Record<string, unknown> = {},
): Promise<DeliveryResult> {
  const result = await sendToN8n(target, type, pipelinePayload(lead, proposal, extra));
  if (!result.ok && !result.skipped) {
    await recordEvent({
      type: "webhook.failed",
      leadId: lead.id,
      proposalId: proposal?.id ?? null,
      actor: "system",
      data: { target, event: type, status: result.status ?? null, error: result.error ?? null, attempts: result.attempts },
    }).catch((error) => console.error("[pipeline] could not record webhook failure", error));
  }
  return result;
}

/** Fan lifecycle changes out to the n8n CRM Sync workflow (Airtable / Notion / Supabase). */
export async function syncCrm(lead: Lead, trigger: EventType, proposal: Proposal | null = null) {
  if (!getConfig().n8n.crmSyncEnabled) return;
  await deliver("crmSync", "crm.sync", lead, proposal, { trigger });
}

/* ----------------------------------------------------------------------------
 * Intake
 * ------------------------------------------------------------------------- */

export async function createLeadFromSubmission(
  submission: LeadSubmission,
  context: { ipHash: string | null; userAgent: string | null; actor: string },
): Promise<Lead> {
  const repo = getRepository();
  const { project, plan, contact, meta } = submission;
  const [storedOverrides, storedSettings] = await Promise.all([repo.getPricingOverrides(), repo.getAppSettings()]);
  // The builder's inputs plus anything the description clearly asks for (see pricing/detect.ts).
  const estimate = estimateProject(
    leadScope({ project, plan }).input,
    sanitizeOverrides(storedOverrides),
    { promo: promoFromSettings(resolveSettings(storedSettings)) },
  );
  const { consent, marketingOptIn, ...contactFields } = contact;

  let lead: Lead | null = null;
  for (let attempt = 0; attempt < 5 && !lead; attempt++) {
    try {
      lead = await repo.createLead({
        reference: createLeadReference(),
        status: "new",
        source: meta.source,
        contact: contactFields,
        project,
        plan,
        estimate,
        meta: {
          ...meta,
          ipHash: context.ipHash,
          userAgent: context.userAgent?.slice(0, 300) ?? null,
          consent: { privacy: consent, marketing: marketingOptIn, at: new Date().toISOString() },
        },
      });
    } catch (error) {
      // Retry only on reference collisions (unique constraint).
      if (!/duplicate|23505|unique/i.test((error as Error).message)) throw error;
    }
  }
  if (!lead) throw new Error("Could not allocate a unique lead reference");

  await recordEvent({
    type: "lead.created",
    leadId: lead.id,
    actor: context.actor,
    data: { reference: lead.reference, source: lead.source, services: project.services, budget: plan.budget },
  });
  return lead;
}

/**
 * Post-submission work (run inside `after()`): email the team (and, with manual
 * review, acknowledge the client), notify the n8n intake workflow, request the
 * AI analysis and push the new lead to the CRM.
 */
export async function processNewLead(leadId: string): Promise<void> {
  const repo = getRepository();
  const lead = await repo.getLead(leadId);
  if (!lead) return;
  const settings = resolveSettings(await repo.getAppSettings());
  await Promise.all([
    // With auto-send the proposal itself arrives within minutes, so the client gets one email, not two.
    appSendsEmail() ? emailNewLead(lead, { acknowledgeClient: !settings.autoSend }) : null,
    deliver("leadIntake", "lead.created", lead, null),
    requestAnalysis(lead, { trigger: "intake", actor: "system" }),
    syncCrm(lead, "lead.created"),
  ]);
}

/* ----------------------------------------------------------------------------
 * Analysis
 * ------------------------------------------------------------------------- */

export async function setLeadStatus(lead: Lead, status: LeadStatus, actor: string, extra: Record<string, unknown> = {}) {
  if (lead.status === status) return lead;
  const updated = await getRepository().updateLead(lead.id, { status });
  await recordEvent({ type: "lead.status_changed", leadId: lead.id, actor, data: { from: lead.status, to: status, ...extra } });
  return updated;
}

/**
 * Ask for a (re)analysis. With the n8n runner the request goes to the
 * "AI Scope Analysis" workflow, which posts its result to POST /api/v1/proposals;
 * otherwise (or if n8n is unreachable) the analysis runs in-process.
 */
export async function requestAnalysis(
  lead: Lead,
  options: { trigger: "intake" | "regenerate"; actor: string; instructions?: string | null },
): Promise<{ runner: AnalysisRunner }> {
  const config = getConfig();
  const repo = getRepository();
  const [previous] = options.trigger === "regenerate" ? await repo.listAnalyses(lead.id) : [];
  const previousSummary = previous
    ? {
        recommended: previous.result.budget.recommended,
        totalWeeks: previous.result.timeline.totalWeeks,
        projectType: previous.result.projectType,
      }
    : null;

  const analyzing = await repo.updateLead(lead.id, { status: "analyzing", analysisError: null });
  if (lead.status !== "analyzing") {
    await recordEvent({ type: "lead.status_changed", leadId: lead.id, actor: options.actor, data: { from: lead.status, to: "analyzing" } });
  }

  if (config.analysisRunner === "n8n" && config.n8n.urls.analysis) {
    const requestedAt = Date.now();
    const result = await deliver("analysis", "analysis.requested", analyzing, null, {
      trigger: options.trigger,
      instructions: options.instructions ?? null,
      previous: previousSummary,
      // The live prompt (current rate card from Settings → Pricing): n8n uses it instead of its baked-in copy.
      ai: await analysisPrompt(analyzing, { instructions: options.instructions ?? null, previous: previousSummary }),
    });
    if (result.ok) {
      await recordEvent({
        type: "analysis.requested",
        leadId: lead.id,
        actor: options.actor,
        data: { runner: "n8n", trigger: options.trigger, instructions: options.instructions ?? null },
      });
      scheduleAnalysisFallback(lead.id, requestedAt, options.instructions ?? null);
      return { runner: "n8n" };
    }
    console.warn(`[pipeline] n8n analysis request failed for ${lead.reference}; running in-app instead`);
  }

  await recordEvent({
    type: "analysis.requested",
    leadId: lead.id,
    actor: options.actor,
    data: { runner: "app", provider: config.ai.provider, trigger: options.trigger, instructions: options.instructions ?? null },
  });
  await runAppAnalysis(analyzing, { instructions: options.instructions ?? null, previous: previousSummary });
  return { runner: "app" };
}

const fallbacksInFlight = new Set<string>();

/**
 * n8n acknowledged the analysis request, but that only means the webhook was
 * received. If the workflow then fails (bad credentials, an inactive node, a
 * timeout) the lead would sit in "analyzing" forever and the client would never
 * get a proposal. After ANALYSIS_FALLBACK_MINUTES, run the analysis in-app instead.
 */
function scheduleAnalysisFallback(leadId: string, requestedAt: number, instructions: string | null) {
  const timer = setTimeout(() => {
    void runAnalysisFallback(leadId, requestedAt, instructions).catch((error) =>
      console.error(`[pipeline] analysis fallback for lead ${leadId} failed`, error),
    );
  }, getConfig().analysisFallbackMs);
  timer.unref?.();
}

/** Runs the in-app analysis if the lead is still waiting on n8n. Returns true when it ran. */
export async function runAnalysisFallback(leadId: string, requestedAt: number, instructions: string | null = null): Promise<boolean> {
  if (fallbacksInFlight.has(leadId)) return false;
  fallbacksInFlight.add(leadId);
  try {
    const repo = getRepository();
    const lead = await repo.getLead(leadId);
    if (!lead || lead.status !== "analyzing") return false;
    const [latest] = await repo.listAnalyses(leadId);
    if (latest && new Date(latest.createdAt).getTime() >= requestedAt) return false;
    const minutes = Math.round(getConfig().analysisFallbackMs / 60_000);
    console.warn(`[pipeline] n8n did not return an analysis for ${lead.reference} within ${minutes} min — running it in-app`);
    await recordEvent({
      type: "custom",
      leadId,
      actor: "system",
      data: { message: `n8n didn't return the analysis within ${minutes} min — generated in-app instead` },
    });
    await runAppAnalysis(lead, { instructions });
    return true;
  } finally {
    fallbacksInFlight.delete(leadId);
  }
}

const analysesInFlight = new Set<string>();

export async function runAppAnalysis(
  lead: Lead,
  options: { instructions?: string | null; previous?: { recommended: number; totalWeeks: number; projectType: string } | null } = {},
): Promise<{ analysis: AnalysisRecord; proposal: Proposal } | null> {
  // One in-app analysis per lead at a time (intake, n8n fallback and the sweeper can overlap).
  if (analysesInFlight.has(lead.id)) return null;
  analysesInFlight.add(lead.id);
  try {
    return await runAppAnalysisOnce(lead, options);
  } finally {
    analysesInFlight.delete(lead.id);
  }
}

async function runAppAnalysisOnce(
  lead: Lead,
  options: { instructions?: string | null; previous?: { recommended: number; totalWeeks: number; projectType: string } | null },
): Promise<{ analysis: AnalysisRecord; proposal: Proposal } | null> {
  let outcome: AnalysisOutcome;
  try {
    outcome = await runAnalysis(lead, options);
  } catch (error) {
    await failAnalysis(lead, (error as Error).message, "system");
    return null;
  }
  const result = await applyAnalysisResult({
    lead,
    analysis: outcome.analysis,
    provider: outcome.provider,
    model: outcome.model,
    usage: outcome.usage,
    runner: "app",
    instructions: options.instructions ?? null,
    fallbackReason: outcome.fallbackReason,
    durationMs: outcome.durationMs,
    actor: "system",
  });
  // In n8n-runner mode the analysis workflow sends the "draft ready" alert itself.
  // Skipped when auto-send already dispatched the proposal — it's sent, not "ready for review".
  if (!result.autoSent) await deliver("dispatch", "proposal.created", result.lead, result.proposal);
  return result;
}

export async function failAnalysis(lead: Lead, message: string, actor: string) {
  const repo = getRepository();
  await repo.updateLead(lead.id, { analysisError: message.slice(0, 500), status: lead.status === "analyzing" ? "new" : lead.status });
  await recordEvent({ type: "analysis.failed", leadId: lead.id, actor, data: { error: message.slice(0, 500) } });
}

/** Persist an analysis, derive the proposal draft and move the lead to review. */
export async function applyAnalysisResult(params: {
  lead: Lead;
  analysis: ScopeAnalysis;
  provider: AnalysisProvider;
  model: string | null;
  usage: Record<string, unknown> | null;
  runner: AnalysisRunner;
  instructions: string | null;
  fallbackReason: string | null;
  durationMs: number | null;
  actor: string;
  /** Set to false to skip the CRM webhook (demo data). */
  syncCrm?: boolean;
  /** Set to false to force manual review regardless of the auto-send setting (demo data). */
  autoSend?: boolean;
}): Promise<{ analysis: AnalysisRecord; proposal: Proposal; lead: Lead; autoSent: boolean }> {
  const repo = getRepository();
  const { lead } = params;

  const [storedOverrides, storedSettings, earlier] = await Promise.all([
    repo.getPricingOverrides(),
    repo.getAppSettings(),
    repo.listProposals({ leadId: lead.id, limit: 50 }),
  ]);
  const settings = resolveSettings(storedSettings);
  const promo = promoFromSettings(settings);

  // Prices come only from the rate card (admin-editable): the recommended plan is the one the
  // client picked (Essential by default; moved up only for a requested payment gateway), and
  // every plan, proposal line, total and the timeline are computed here by the pricing engine,
  // so nothing the client sees can drift from it. The AI writes the words.
  const overrides = sanitizeOverrides(storedOverrides);
  const scope = leadScope(lead);
  const { scale: _scale, ...planInput } = scope.input;
  void _scale;
  const recommendedTier = recommendedTierFor(planInput, lead.project.scale, overrides);
  const plans = buildPlans(planInput, recommendedTier, overrides, promo);
  const recommendedPlan = plans.find((plan) => plan.recommended) ?? plans[0];
  const priced = pricedPlan(planInput, (recommendedPlan?.key ?? recommendedTier) as typeof recommendedTier, overrides, promo);
  const fromAi = params.analysis.budget.recommended;
  const result = fitTimeline(snapToTotal(params.analysis, priced.list), priced.weeksMin, priced.weeksMax);
  const adjustment = fromAi !== priced.list ? { from: fromAi, to: priced.list, plan: priced.tier } : null;
  if (hasAdditions(scope.added)) {
    console.info(`[pipeline] ${lead.reference}: description adds ${[...scope.added.services, ...scope.added.items].join(", ")}`);
  }

  const analysis = await repo.createAnalysis({
    leadId: lead.id,
    provider: params.provider,
    model: params.model,
    runner: params.runner,
    result,
    usage: params.usage,
    instructions: params.instructions,
    fallbackReason: params.fallbackReason,
    durationMs: params.durationMs,
  });

  const version = await repo.nextProposalVersion(lead.id);
  const proposal = await repo.createProposal(
    buildProposalDraft({
      leadId: lead.id,
      analysisId: analysis.id,
      analysis: result,
      version,
      discount: discountFrom(priced, promo),
      plans,
      lineItems: proposalLinesFrom(priced, result.timeline.phases, overrides, { aiDeliverables: result.deliverables }),
    }),
  );
  // Only the first proposal for a lead goes out on its own; later versions
  // (regenerated, or a second analysis racing the n8n fallback) wait for review.
  const alreadyDispatched = earlier.items.some(
    (p) => p.sentAt !== null || ["approved", "sent", "accepted", "declined"].includes(p.status),
  );
  // A late second analysis must never cancel a proposal that is already approved,
  // being emailed or sent: it only replaces other drafts and leaves the lead's stage alone.
  const keepStage = alreadyDispatched && !["new", "analyzing", "review"].includes(lead.status);
  await repo.supersedeOpenProposals(lead.id, proposal.id, keepStage ? ["draft"] : undefined);

  const updated = await repo.updateLead(lead.id, {
    ...(keepStage ? {} : { status: "review" as const, estimatedValue: proposal.totals.total }),
    fitScore: result.fitScore,
    analysisError: null,
  });

  await recordEvent({
    type: "analysis.completed",
    leadId: lead.id,
    actor: params.actor,
    data: {
      analysisId: analysis.id,
      version: analysis.version,
      provider: params.provider,
      model: params.model,
      runner: params.runner,
      fitScore: result.fitScore,
      recommended: result.budget.recommended,
      fallbackReason: params.fallbackReason,
      recommendedPlan: recommendedPlan?.key ?? null,
      ...(adjustment ? { priceAdjustment: adjustment } : {}),
      ...(hasAdditions(scope.added) ? { detected: scope.added } : {}),
    },
  });
  await recordEvent({
    type: "proposal.created",
    leadId: lead.id,
    proposalId: proposal.id,
    actor: params.actor,
    data: { version: proposal.version, total: proposal.totals.total, currency: proposal.currency },
  });
  if (!keepStage && lead.status !== "review") {
    await recordEvent({ type: "lead.status_changed", leadId: lead.id, actor: params.actor, data: { from: lead.status, to: "review" } });
  }

  if (params.syncCrm !== false) await syncCrm(updated, "proposal.created", proposal);

  if (params.autoSend !== false && settings.autoSend && !alreadyDispatched) {
    try {
      const approval = await approveProposal(proposal.id, "system:auto-send");
      return { analysis, proposal: approval.proposal, lead: approval.lead, autoSent: true };
    } catch (error) {
      // Leave the proposal in "review" — an admin can approve it manually.
      console.error(`[pipeline] auto-send failed for proposal ${proposal.id}; leaving it for manual review`, error);
    }
  }
  return { analysis, proposal, lead: updated, autoSent: false };
}

/* ----------------------------------------------------------------------------
 * Review, approval & dispatch
 * ------------------------------------------------------------------------- */

export async function approveProposal(
  proposalId: string,
  actor: string,
): Promise<{ proposal: Proposal; lead: Lead; dispatch: DeliveryResult; email: { queued: boolean } }> {
  const repo = getRepository();
  const proposal = await repo.getProposal(proposalId);
  if (!proposal) throw new PipelineError("Proposal not found", 404, "not_found");
  if (proposal.status !== "draft" && proposal.status !== "approved") {
    throw new PipelineError(`A ${proposal.status} proposal cannot be approved`);
  }
  if (proposal.totals.total <= 0 && proposal.totals.monthlyTotal <= 0) {
    throw new PipelineError("Add at least one priced line item before approving", 422, "empty_proposal");
  }
  const lead = await repo.getLead(proposal.leadId);
  if (!lead) throw new PipelineError("Lead not found", 404, "not_found");

  const approved = await repo.updateProposal(proposal.id, {
    status: "approved",
    approvedAt: new Date().toISOString(),
    approvedBy: actor,
  });
  // A newly approved version replaces any older version the client may still have open.
  await repo.supersedeOpenProposals(lead.id, approved.id, ["draft", "approved", "sent"]);
  const updatedLead = await repo.updateLead(lead.id, { status: "approved", estimatedValue: approved.totals.total });

  await recordEvent({
    type: "proposal.approved",
    leadId: lead.id,
    proposalId: approved.id,
    actor,
    data: { version: approved.version, total: approved.totals.total },
  });
  if (lead.status !== "approved") {
    await recordEvent({ type: "lead.status_changed", leadId: lead.id, actor, data: { from: lead.status, to: "approved" } });
  }

  if (appSendsEmail()) {
    // The app emails the PDF itself (rendering + SMTP take a few seconds, so it
    // runs in the background); n8n is told once it's sent, for team alerts.
    runInBackground(`email proposal ${approved.id}`, () => sendProposalEmail(approved.id));
    await syncCrm(updatedLead, "proposal.approved", approved);
    return {
      proposal: approved,
      lead: updatedLead,
      dispatch: { ok: true, skipped: true, attempts: 0, deliveryId: "", url: null, durationMs: 0 },
      email: { queued: true },
    };
  }

  const dispatch = await deliver("dispatch", "proposal.approved", updatedLead, approved);
  await syncCrm(updatedLead, "proposal.approved", approved);
  return { proposal: approved, lead: updatedLead, dispatch, email: { queued: false } };
}

const emailsInFlight = new Set<string>();
/** Consecutive failed delivery rounds per proposal (the sweeper stops retrying after a few). */
const emailFailures = new Map<string, number>();
export const MAX_EMAIL_ROUNDS = 4;

/** The client asked for WhatsApp (and gave a WhatsApp number) and the Cloud API is configured. */
export function wantsWhatsApp(lead: Lead): boolean {
  return Boolean(getConfig().whatsapp && lead.contact.phone && lead.contact.whatsapp && lead.contact.deliveryChannel !== "email");
}

/**
 * Deliver an approved proposal to the client — email with the PDF attached and,
 * when they asked for it, a WhatsApp template message carrying the same PDF —
 * then mark it sent and send the team a copy. The proposal counts as delivered
 * if either channel reached the client, so WhatsApp is never sent twice.
 * Safe to call repeatedly: it does nothing once the proposal is sent, and the
 * startup sweeper calls it again for proposals no channel could deliver.
 */
export async function sendProposalEmail(proposalId: string): Promise<boolean> {
  if (emailsInFlight.has(proposalId)) return false;
  emailsInFlight.add(proposalId);
  try {
    const repo = getRepository();
    const proposal = await repo.getProposal(proposalId);
    if (!proposal || proposal.status !== "approved" || proposal.sentAt) return false;
    const lead = await repo.getLead(proposal.leadId);
    if (!lead) return false;

    const outcome = await emailProposal(lead, proposal);
    const email = outcome.result;

    let whatsapp: WhatsAppResult | null = null;
    if (wantsWhatsApp(lead)) {
      const appUrl = getConfig().appUrl;
      whatsapp = await sendProposalWhatsApp({
        phone: lead.contact.phone,
        firstName: lead.contact.name.trim().split(/\s+/)[0] ?? lead.contact.name,
        // With plans, the message quotes the starting price ("plans from $X").
        total: formatMoney(
          outcome.proposal.plans?.length ? Math.min(...outcome.proposal.plans.map((plan) => plan.price)) : proposal.totals.total,
          proposal.currency,
        ),
        reference: lead.reference,
        pdfUrl: `${appUrl}/p/${proposal.shareToken}/pdf`,
        pdfFilename: proposalPdfFilename(lead, proposal),
        shareToken: proposal.shareToken,
      });
      await recordEvent({
        type: "notification.sent",
        leadId: lead.id,
        proposalId: proposal.id,
        actor: "system:whatsapp",
        data: whatsapp.ok
          ? { channel: "whatsapp", kind: "client_proposal", delivered: true, to: whatsapp.to, messageId: whatsapp.messageId }
          : { channel: "whatsapp", kind: "client_proposal", delivered: false, to: whatsapp.to, error: whatsapp.error.slice(0, 300) },
      });
    }

    const channels = [email.ok ? "email" : null, whatsapp?.ok ? "whatsapp" : null].filter((c): c is string => c !== null);
    if (!channels.length) {
      const rounds = (emailFailures.get(proposalId) ?? 0) + 1;
      emailFailures.set(proposalId, rounds);
      // Tell the team once, on the first failed round — the sweeper keeps retrying.
      if (rounds === 1) {
        const reasons = [email.ok ? null : `Email: ${email.error}`, whatsapp && !whatsapp.ok ? `WhatsApp: ${whatsapp.error}` : null];
        await emailDeliveryFailed(lead, proposal, reasons.filter(Boolean).join(" · "));
      }
      return false;
    }
    emailFailures.delete(proposalId);
    const sent = await markProposalSent(proposal.id, "system:delivery", {
      channel: channels.join("+"),
      to: email.ok ? lead.contact.email : null,
      whatsapp: whatsapp?.ok ? whatsapp.to : null,
      messageId: email.ok ? email.messageId : null,
    });
    await emailProposalTeamCopy(lead, outcome, {
      email: email.ok ? { ok: true } : { ok: false, error: email.error },
      whatsapp: whatsapp ? (whatsapp.ok ? { ok: true, to: whatsapp.to } : { ok: false, to: whatsapp.to, error: whatsapp.error }) : null,
    });
    await deliver("dispatch", "proposal.sent", sent.lead, sent.proposal, { channel: channels.join("+") });
    return true;
  } finally {
    emailsInFlight.delete(proposalId);
  }
}

/** How many delivery rounds have failed for a proposal in this process (for the sweeper). */
export function emailFailureRounds(proposalId: string): number {
  return emailFailures.get(proposalId) ?? 0;
}

export async function markProposalSent(proposalId: string, actor: string, data: Record<string, unknown> = {}) {
  const repo = getRepository();
  const proposal = await repo.getProposal(proposalId);
  if (!proposal) throw new PipelineError("Proposal not found", 404, "not_found");
  if (!["approved", "sent"].includes(proposal.status)) {
    throw new PipelineError(`A ${proposal.status} proposal cannot be marked as sent`);
  }
  const sent = await repo.updateProposal(proposal.id, { status: "sent", sentAt: proposal.sentAt ?? new Date().toISOString() });
  let lead = await repo.getLead(proposal.leadId);
  if (!lead) throw new PipelineError("Lead not found", 404, "not_found");
  if (proposal.status !== "sent") {
    await recordEvent({ type: "proposal.sent", leadId: lead.id, proposalId: sent.id, actor, data });
  }
  if (["new", "analyzing", "review", "approved"].includes(lead.status)) {
    lead = await setLeadStatus(lead, "sent", actor);
  }
  await syncCrm(lead, "proposal.sent", sent);
  return { proposal: sent, lead };
}

/* ----------------------------------------------------------------------------
 * Client portal
 * ------------------------------------------------------------------------- */

const VIEW_THROTTLE_MS = 60 * 60 * 1000;

export async function recordProposalView(proposal: Proposal) {
  if (proposal.viewedAt && Date.now() - new Date(proposal.viewedAt).getTime() < VIEW_THROTTLE_MS) return;
  const repo = getRepository();
  await repo.updateProposal(proposal.id, { viewedAt: new Date().toISOString() });
  await recordEvent({
    type: "proposal.viewed",
    leadId: proposal.leadId,
    proposalId: proposal.id,
    actor: "client",
    data: { firstView: !proposal.viewedAt },
  });
}

export async function respondToProposal(params: {
  token: string;
  decision: "accepted" | "declined";
  name: string;
  note: string | null;
  /** The plan the client picked (proposals with plans); defaults to the recommended one. */
  plan?: string | null;
}): Promise<Proposal> {
  const repo = getRepository();
  const proposal = await repo.getProposalByToken(params.token);
  if (!proposal || !isShareable(proposal)) throw new PipelineError("Proposal not found", 404, "not_found");
  if (proposal.status === "accepted" || proposal.status === "declined") {
    throw new PipelineError(`This proposal was already ${proposal.status}`, 409, "already_responded");
  }
  if (isProposalExpired(proposal)) {
    throw new PipelineError("This proposal has expired — please contact the studio for an updated version", 410, "expired");
  }

  let lead = await repo.getLead(proposal.leadId);
  if (!lead) throw new PipelineError("Lead not found", 404, "not_found");
  const { plans } = await withPlans(proposal, lead);
  const chosen = params.decision === "accepted" && plans?.length ? (plans.find((p) => p.key === params.plan) ?? plans.find((p) => p.recommended) ?? plans[0]) : null;

  const respondedAt = new Date().toISOString();
  const updated = await repo.updateProposal(proposal.id, {
    status: params.decision,
    respondedAt,
    clientResponse: {
      decision: params.decision,
      name: params.name,
      note: params.note,
      at: respondedAt,
      plan: chosen ? { key: chosen.key, name: chosen.name, nameAr: chosen.nameAr, price: chosen.price } : null,
    },
  });

  await recordEvent({
    type: params.decision === "accepted" ? "proposal.accepted" : "proposal.declined",
    leadId: lead.id,
    proposalId: updated.id,
    actor: "client",
    data: {
      name: params.name,
      note: params.note,
      total: chosen?.price ?? updated.totals.total,
      ...(chosen ? { plan: chosen.name, planKey: chosen.key } : {}),
    },
  });
  lead = await setLeadStatus(lead, params.decision === "accepted" ? "won" : "lost", "client");

  if (appSendsEmail()) {
    const respondedLead = lead;
    runInBackground(`email response ${updated.id}`, () => emailProposalResponse(respondedLead, updated));
  }
  await deliver("dispatch", params.decision === "accepted" ? "proposal.accepted" : "proposal.declined", lead, updated);
  await syncCrm(lead, params.decision === "accepted" ? "proposal.accepted" : "proposal.declined", updated);
  return updated;
}

/* ----------------------------------------------------------------------------
 * Callbacks from n8n (POST /api/v1/events)
 * ------------------------------------------------------------------------- */

export const N8N_EVENT_TYPES = [
  "notification.sent",
  "email.sent",
  "crm.synced",
  "analysis.failed",
  "proposal.sent",
  "pdf.generated",
  "custom",
] as const;
export type N8nEventType = (typeof N8N_EVENT_TYPES)[number];

export async function ingestN8nEvent(input: {
  type: N8nEventType;
  leadId?: string;
  leadReference?: string;
  proposalId?: string;
  data: Record<string, unknown>;
}): Promise<{ leadId: string; eventType: N8nEventType }> {
  const repo = getRepository();
  const proposal = input.proposalId ? await repo.getProposal(input.proposalId) : null;
  const lead =
    (input.leadId ? await repo.getLead(input.leadId) : null) ??
    (input.leadReference ? await repo.getLeadByReference(input.leadReference) : null) ??
    (proposal ? await repo.getLead(proposal.leadId) : null);
  if (!lead) throw new PipelineError("Lead not found", 404, "not_found");

  switch (input.type) {
    case "proposal.sent": {
      if (!proposal) throw new PipelineError("proposalId is required for proposal.sent", 422, "validation_failed");
      await markProposalSent(proposal.id, "n8n", input.data);
      break;
    }
    case "analysis.failed": {
      const message = typeof input.data.error === "string" ? input.data.error : "The n8n analysis workflow reported a failure";
      await failAnalysis(lead, message, "n8n");
      // Don't leave the client without a proposal: run the analysis in-app (Claude/OpenAI
      // directly, falling back to the rule-based estimator) right away.
      if (lead.status === "analyzing") {
        runInBackground(`in-app analysis for ${lead.reference}`, async () => {
          const fresh = await getRepository().getLead(lead.id);
          if (fresh && fresh.status === "new") await runAppAnalysis(fresh);
        });
      }
      break;
    }
    case "crm.synced": {
      const pick = (key: string) => (typeof input.data[key] === "string" ? (input.data[key] as string) : undefined);
      const crm = {
        ...lead.crm,
        ...(pick("airtableRecordId") ? { airtableRecordId: pick("airtableRecordId") } : {}),
        ...(pick("notionPageId") ? { notionPageId: pick("notionPageId") } : {}),
        ...(pick("supabaseRecordId") ? { supabaseRecordId: pick("supabaseRecordId") } : {}),
        syncedAt: new Date().toISOString(),
      };
      await repo.updateLead(lead.id, { crm });
      await recordEvent({ type: "crm.synced", leadId: lead.id, proposalId: proposal?.id ?? null, actor: "n8n", data: input.data });
      break;
    }
    default:
      await recordEvent({ type: input.type, leadId: lead.id, proposalId: proposal?.id ?? null, actor: "n8n", data: input.data });
  }
  return { leadId: lead.id, eventType: input.type };
}
