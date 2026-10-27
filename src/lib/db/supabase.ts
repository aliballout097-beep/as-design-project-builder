import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PricingOverrides } from "@/lib/pricing/overrides";
import type { NewProposal } from "@/lib/proposals";
import type { AppSettings } from "@/lib/settings";
import type { AnalysisRecord, Lead, LeadEvent, LeadSummary, Proposal, ProposalStatus } from "@/lib/types";
import {
  NotFoundError,
  type ListEventsQuery,
  type ListLeadsQuery,
  type ListProposalsQuery,
  type LeadPatch,
  type NewAnalysisInput,
  type NewEventInput,
  type NewLeadInput,
  type Page,
  type ProposalUpdate,
  type Repository,
} from "./repository";

/**
 * Supabase (Postgres) repository. Uses the service-role key server-side only;
 * every table has RLS enabled with no public policies (see supabase/migrations),
 * so the anon key can never read client data.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- rows are mapped explicitly below */
type Row = Record<string, any>;

const LEAD_COLUMNS =
  "id, reference, status, source, contact, project, plan, estimate, meta, crm, tags, notes, fit_score, estimated_value, analysis_error, created_at, updated_at, last_activity_at";

function toLead(row: Row): Lead {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    source: row.source,
    contact: row.contact,
    project: row.project,
    plan: row.plan,
    estimate: row.estimate,
    fitScore: row.fit_score,
    estimatedValue: row.estimated_value === null ? null : Number(row.estimated_value),
    analysisError: row.analysis_error,
    tags: row.tags ?? [],
    notes: row.notes,
    crm: row.crm ?? {},
    meta: row.meta ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastActivityAt: row.last_activity_at,
  };
}

function toAnalysis(row: Row): AnalysisRecord {
  return {
    id: row.id,
    leadId: row.lead_id,
    version: row.version,
    provider: row.provider,
    model: row.model,
    runner: row.runner,
    result: row.result,
    usage: row.usage,
    instructions: row.instructions,
    fallbackReason: row.fallback_reason,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  };
}

function toProposal(row: Row): Proposal {
  return {
    id: row.id,
    leadId: row.lead_id,
    analysisId: row.analysis_id,
    version: row.version,
    status: row.status,
    title: row.title,
    executiveSummary: row.executive_summary,
    approach: row.approach,
    lineItems: row.line_items ?? [],
    phases: row.phases ?? [],
    currency: row.currency,
    discount: row.discount,
    taxRate: Number(row.tax_rate ?? 0),
    paymentSchedule: row.payment_schedule ?? [],
    assumptions: row.assumptions ?? [],
    nextSteps: row.next_steps ?? [],
    notes: row.notes,
    totals: row.totals,
    validUntil: row.valid_until,
    shareToken: row.share_token,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    sentAt: row.sent_at,
    viewedAt: row.viewed_at,
    respondedAt: row.responded_at,
    clientResponse: row.client_response,
    translations: row.translations ?? null,
    plans: row.plans ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function proposalToRow(input: ProposalUpdate): Row {
  const map: Record<string, string> = {
    analysisId: "analysis_id",
    version: "version",
    status: "status",
    title: "title",
    executiveSummary: "executive_summary",
    approach: "approach",
    lineItems: "line_items",
    phases: "phases",
    currency: "currency",
    discount: "discount",
    taxRate: "tax_rate",
    paymentSchedule: "payment_schedule",
    assumptions: "assumptions",
    nextSteps: "next_steps",
    notes: "notes",
    totals: "totals",
    validUntil: "valid_until",
    shareToken: "share_token",
    approvedAt: "approved_at",
    approvedBy: "approved_by",
    sentAt: "sent_at",
    viewedAt: "viewed_at",
    respondedAt: "responded_at",
    clientResponse: "client_response",
    translations: "translations",
    plans: "plans",
  };
  const row: Row = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && map[key]) row[map[key]] = value;
  }
  return row;
}

function toEvent(row: Row): LeadEvent {
  return {
    id: Number(row.id),
    leadId: row.lead_id,
    proposalId: row.proposal_id,
    type: row.type,
    actor: row.actor,
    data: row.data ?? {},
    createdAt: row.created_at,
  };
}

/** Keep PostgREST `or()` filters safe: allow only simple search characters. */
function sanitizeSearch(value: string): string {
  return value.replace(/[^\p{L}\p{N}@.\-_ ]/gu, "").trim().slice(0, 80);
}

type Result = { data: any; error: { message: string; code?: string } | null };

/**
 * Proposal columns added by later migrations. If the database doesn't have one
 * yet, writes are retried without it (and it's skipped from then on) so a
 * pending migration never stops a proposal from being created or sent.
 */
const OPTIONAL_PROPOSAL_COLUMNS = ["plans", "translations"];
const missingProposalColumns = new Set<string>();

async function writeProposal(row: Row, run: (row: Row) => PromiseLike<Result>): Promise<Result> {
  for (const column of missingProposalColumns) delete row[column];
  let result = await run(row);
  for (let i = 0; i < OPTIONAL_PROPOSAL_COLUMNS.length && result.error; i++) {
    const message = result.error.message;
    const column = OPTIONAL_PROPOSAL_COLUMNS.find((name) => name in row && message.includes(`'${name}'`));
    if (!column) break;
    missingProposalColumns.add(column);
    console.warn(`[supabase] proposals.${column} column is missing — run supabase/migrations/20260928000000_proposal_plans.sql. Saving without it.`);
    delete row[column];
    result = await run(row);
  }
  return result;
}

function check(result: Result, context: string): any {
  if (result.error) throw new Error(`[supabase] ${context}: ${result.error.message}`);
  return result.data;
}

/** Like `check`, for `.single()` queries that must return a row. */
function checkOne(result: Result, context: string): Row {
  const data = check(result, context);
  if (data === null || data === undefined) throw new Error(`[supabase] ${context}: no row returned`);
  return data as Row;
}

export class SupabaseRepository implements Repository {
  readonly kind = "supabase" as const;
  private readonly db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { "x-client-info": "asd-automation-suite" } },
    });
  }

  /* -------------------------------- leads -------------------------------- */

  async createLead(input: NewLeadInput): Promise<Lead> {
    const row = checkOne(
      await this.db
        .from("leads")
        .insert({
          reference: input.reference,
          status: input.status,
          source: input.source,
          contact: input.contact,
          project: input.project,
          plan: input.plan,
          estimate: input.estimate,
          meta: input.meta,
          tags: input.tags ?? [],
          services: input.project.services,
          budget: input.plan.budget,
        })
        .select(LEAD_COLUMNS)
        .single(),
      "createLead",
    );
    return toLead(row);
  }

  async getLead(id: string) {
    const row = check(await this.db.from("leads").select(LEAD_COLUMNS).eq("id", id).maybeSingle(), "getLead");
    return row ? toLead(row) : null;
  }

  async getLeadByReference(reference: string) {
    const row = check(
      await this.db.from("leads").select(LEAD_COLUMNS).ilike("reference", reference).maybeSingle(),
      "getLeadByReference",
    );
    return row ? toLead(row) : null;
  }

  async listLeads(query: ListLeadsQuery = {}): Promise<Page<Lead>> {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    let request = this.db
      .from("leads")
      .select(LEAD_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (query.status?.length) request = request.in("status", query.status);
    const search = query.search ? sanitizeSearch(query.search) : "";
    if (search) {
      const pattern = `%${search}%`;
      request = request.or(
        `reference.ilike.${pattern},contact_name.ilike.${pattern},contact_email.ilike.${pattern},company.ilike.${pattern}`,
      );
    }
    const { data, count, error } = await request;
    if (error) throw new Error(`[supabase] listLeads: ${error.message}`);
    return { items: (data ?? []).map(toLead), total: count ?? 0 };
  }

  async listLeadSummaries(limit = 5000): Promise<LeadSummary[]> {
    const rows = check(
      await this.db
        .from("leads")
        .select("id, status, estimated_value, fit_score, created_at")
        .order("created_at", { ascending: false })
        .limit(limit),
      "listLeadSummaries",
    );
    return (rows ?? []).map((row: Row) => ({
      id: row.id,
      status: row.status,
      estimatedValue: row.estimated_value === null ? null : Number(row.estimated_value),
      fitScore: row.fit_score,
      createdAt: row.created_at,
    }));
  }

  async updateLead(id: string, patch: LeadPatch): Promise<Lead> {
    const row: Row = {};
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.fitScore !== undefined) row.fit_score = patch.fitScore;
    if (patch.estimatedValue !== undefined) row.estimated_value = patch.estimatedValue;
    if (patch.analysisError !== undefined) row.analysis_error = patch.analysisError;
    if (patch.tags !== undefined) row.tags = patch.tags;
    if (patch.notes !== undefined) row.notes = patch.notes;
    if (patch.crm !== undefined) row.crm = patch.crm;
    const result = check(
      await this.db.from("leads").update(row).eq("id", id).select(LEAD_COLUMNS).maybeSingle(),
      "updateLead",
    );
    if (!result) throw new NotFoundError("Lead", id);
    return toLead(result);
  }

  async deleteLead(id: string) {
    check(await this.db.from("leads").delete().eq("id", id), "deleteLead");
  }

  /* ------------------------------- analyses ------------------------------ */

  async createAnalysis(input: NewAnalysisInput): Promise<AnalysisRecord> {
    // Versions are unique per lead; retry once if two analyses race.
    for (let attempt = 0; attempt < 3; attempt++) {
      const latest = check(
        await this.db
          .from("analyses")
          .select("version")
          .eq("lead_id", input.leadId)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle(),
        "createAnalysis.version",
      );
      const version = (latest?.version ?? 0) + 1;
      const { data, error } = await this.db
        .from("analyses")
        .insert({
          lead_id: input.leadId,
          version,
          provider: input.provider,
          model: input.model,
          runner: input.runner,
          result: input.result,
          usage: input.usage,
          instructions: input.instructions,
          fallback_reason: input.fallbackReason,
          duration_ms: input.durationMs,
        })
        .select("*")
        .single();
      if (!error) return toAnalysis(data);
      if (error.code !== "23505") throw new Error(`[supabase] createAnalysis: ${error.message}`);
    }
    throw new Error("[supabase] createAnalysis: could not allocate a version");
  }

  async getAnalysis(id: string) {
    const row = check(await this.db.from("analyses").select("*").eq("id", id).maybeSingle(), "getAnalysis");
    return row ? toAnalysis(row) : null;
  }

  async listAnalyses(leadId: string) {
    const rows = check(
      await this.db.from("analyses").select("*").eq("lead_id", leadId).order("version", { ascending: false }),
      "listAnalyses",
    );
    return (rows ?? []).map(toAnalysis);
  }

  /* ------------------------------- proposals ----------------------------- */

  async createProposal(input: NewProposal): Promise<Proposal> {
    const row = checkOne(
      await writeProposal({ lead_id: input.leadId, ...proposalToRow(input) }, (values) =>
        this.db.from("proposals").insert(values).select("*").single(),
      ),
      "createProposal",
    );
    // Keep the plans in memory even when the column is missing, for this request's email/PDF.
    return { ...toProposal(row), plans: toProposal(row).plans ?? input.plans ?? null };
  }

  async getProposal(id: string) {
    const row = check(await this.db.from("proposals").select("*").eq("id", id).maybeSingle(), "getProposal");
    return row ? toProposal(row) : null;
  }

  async getProposalByToken(token: string) {
    const row = check(
      await this.db.from("proposals").select("*").eq("share_token", token).maybeSingle(),
      "getProposalByToken",
    );
    return row ? toProposal(row) : null;
  }

  async listProposals(query: ListProposalsQuery = {}): Promise<Page<Proposal>> {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    let request = this.db
      .from("proposals")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("version", { ascending: false })
      .range(offset, offset + limit - 1);
    if (query.leadId) request = request.eq("lead_id", query.leadId);
    if (query.status?.length) request = request.in("status", query.status);
    const { data, count, error } = await request;
    if (error) throw new Error(`[supabase] listProposals: ${error.message}`);
    return { items: (data ?? []).map(toProposal), total: count ?? 0 };
  }

  async nextProposalVersion(leadId: string) {
    const latest = check(
      await this.db
        .from("proposals")
        .select("version")
        .eq("lead_id", leadId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "nextProposalVersion",
    );
    return (latest?.version ?? 0) + 1;
  }

  async updateProposal(id: string, patch: ProposalUpdate): Promise<Proposal> {
    const row = check(
      await writeProposal(proposalToRow(patch), (values) => this.db.from("proposals").update(values).eq("id", id).select("*").maybeSingle()),
      "updateProposal",
    );
    if (!row) throw new NotFoundError("Proposal", id);
    return toProposal(row);
  }

  async supersedeOpenProposals(leadId: string, exceptId: string, statuses: ProposalStatus[] = ["draft", "approved"]) {
    check(
      await this.db
        .from("proposals")
        .update({ status: "superseded" })
        .eq("lead_id", leadId)
        .neq("id", exceptId)
        .in("status", statuses),
      "supersedeOpenProposals",
    );
  }

  /* -------------------------------- events ------------------------------- */

  async addEvent(input: NewEventInput): Promise<LeadEvent> {
    const row = checkOne(
      await this.db
        .from("lead_events")
        .insert({
          lead_id: input.leadId,
          proposal_id: input.proposalId,
          type: input.type,
          actor: input.actor,
          data: input.data,
        })
        .select("*")
        .single(),
      "addEvent",
    );
    return toEvent(row);
  }

  async listEvents(query: ListEventsQuery = {}): Promise<LeadEvent[]> {
    const limit = query.limit ?? 50;
    const ascending = (query.order ?? (query.afterId !== undefined ? "asc" : "desc")) === "asc";
    let request = this.db.from("lead_events").select("*").order("id", { ascending }).limit(limit);
    if (query.leadId) request = request.eq("lead_id", query.leadId);
    if (query.afterId !== undefined) request = request.gt("id", query.afterId);
    const rows = check(await request, "listEvents");
    return (rows ?? []).map(toEvent);
  }

  async latestEventId() {
    const row = check(
      await this.db.from("lead_events").select("id").order("id", { ascending: false }).limit(1).maybeSingle(),
      "latestEventId",
    );
    return row ? Number(row.id) : 0;
  }

  /* ------------------------------ idempotency ---------------------------- */

  async claimIdempotencyKey(key: string, scope: string) {
    const { error } = await this.db.from("idempotency_keys").insert({ key, scope });
    if (!error) return { status: "new" as const };
    if (error.code !== "23505") throw new Error(`[supabase] claimIdempotencyKey: ${error.message}`);
    const existing = check(
      await this.db.from("idempotency_keys").select("response, completed_at").eq("key", key).maybeSingle(),
      "claimIdempotencyKey.fetch",
    );
    if (existing?.completed_at) return { status: "done" as const, response: existing.response };
    return { status: "in_progress" as const };
  }

  async completeIdempotencyKey(key: string, response: unknown) {
    check(
      await this.db
        .from("idempotency_keys")
        .update({ response, completed_at: new Date().toISOString() })
        .eq("key", key),
      "completeIdempotencyKey",
    );
  }

  async releaseIdempotencyKey(key: string) {
    check(await this.db.from("idempotency_keys").delete().eq("key", key), "releaseIdempotencyKey");
  }

  /* --------------------------- pricing overrides -------------------------- */

  async getPricingOverrides(): Promise<PricingOverrides | null> {
    const row = check(await this.db.from("pricing_overrides").select("data").eq("id", 1).maybeSingle(), "getPricingOverrides");
    return row?.data ?? null;
  }

  async savePricingOverrides(overrides: PricingOverrides): Promise<void> {
    check(
      await this.db.from("pricing_overrides").upsert({ id: 1, data: overrides, updated_at: new Date().toISOString() }),
      "savePricingOverrides",
    );
  }

  /* ----------------------------- app settings ------------------------------ */

  async getAppSettings(): Promise<Partial<AppSettings> | null> {
    const row = check(await this.db.from("app_settings").select("data").eq("id", 1).maybeSingle(), "getAppSettings");
    return row?.data ?? null;
  }

  async saveAppSettings(settings: Partial<AppSettings>): Promise<void> {
    check(
      await this.db.from("app_settings").upsert({ id: 1, data: settings, updated_at: new Date().toISOString() }),
      "saveAppSettings",
    );
  }
}
