import "server-only";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { uuid } from "@/lib/ids";
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
 * Zero-setup JSON file store (`.data/db.json`). Data lives in memory and is
 * flushed atomically (write temp file + rename) shortly after each change.
 *
 * Suitable for development, demos and single-process deployments with a
 * persistent volume. Use Supabase for serverless or multi-instance hosting.
 */

interface LocalData {
  version: 1;
  seq: { event: number };
  leads: Lead[];
  analyses: AnalysisRecord[];
  proposals: Proposal[];
  events: LeadEvent[];
  idempotency: Record<string, { scope: string; response: unknown; done: boolean; createdAt: string }>;
  pricingOverrides: PricingOverrides | null;
  appSettings: Partial<AppSettings> | null;
}

const MAX_EVENTS = 5000;
const clone = <T>(value: T): T => structuredClone(value);
const now = () => new Date().toISOString();

function emptyData(): LocalData {
  return { version: 1, seq: { event: 0 }, leads: [], analyses: [], proposals: [], events: [], idempotency: {}, pricingOverrides: null, appSettings: null };
}

export class LocalRepository implements Repository {
  readonly kind = "local" as const;
  private data: LocalData;
  private readonly file: string | null;
  private flushTimer: NodeJS.Timeout | null = null;

  /** `dir = null` keeps everything in memory (tests). */
  constructor(dir: string | null) {
    this.file = dir ? path.resolve(dir, "db.json") : null;
    this.data = this.load();
  }

  private load(): LocalData {
    if (!this.file) return emptyData();
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8")) as LocalData;
      return parsed?.version === 1 ? { ...emptyData(), ...parsed } : emptyData();
    } catch {
      return emptyData();
    }
  }

  private persist() {
    if (!this.file || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushNow();
    }, 25);
  }

  flushNow() {
    if (!this.file) return;
    try {
      mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.data));
      renameSync(tmp, this.file);
    } catch (error) {
      console.error("[local-store] failed to persist data", error);
    }
  }

  /* -------------------------------- leads -------------------------------- */

  async createLead(input: NewLeadInput): Promise<Lead> {
    if (this.data.leads.some((lead) => lead.reference === input.reference)) {
      throw new Error(`duplicate reference ${input.reference}`);
    }
    const timestamp = now();
    const lead: Lead = {
      id: uuid(),
      reference: input.reference,
      status: input.status,
      source: input.source,
      contact: input.contact,
      project: input.project,
      plan: input.plan,
      estimate: input.estimate,
      fitScore: null,
      estimatedValue: null,
      analysisError: null,
      tags: input.tags ?? [],
      notes: null,
      crm: {},
      meta: input.meta,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastActivityAt: timestamp,
    };
    this.data.leads.push(lead);
    this.persist();
    return clone(lead);
  }

  async getLead(id: string) {
    const lead = this.data.leads.find((item) => item.id === id);
    return lead ? clone(lead) : null;
  }

  async getLeadByReference(reference: string) {
    const lead = this.data.leads.find((item) => item.reference.toLowerCase() === reference.toLowerCase());
    return lead ? clone(lead) : null;
  }

  async listLeads(query: ListLeadsQuery = {}): Promise<Page<Lead>> {
    const search = query.search?.trim().toLowerCase();
    const filtered = this.data.leads
      .filter((lead) => !query.status?.length || query.status.includes(lead.status))
      .filter((lead) => {
        if (!search) return true;
        return [lead.reference, lead.contact.name, lead.contact.email, lead.contact.company ?? "", lead.project.name ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(search);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    return { items: clone(filtered.slice(offset, offset + limit)), total: filtered.length };
  }

  async listLeadSummaries(limit = 5000): Promise<LeadSummary[]> {
    return [...this.data.leads]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(({ id, status, estimatedValue, fitScore, createdAt }) => ({ id, status, estimatedValue, fitScore, createdAt }));
  }

  async updateLead(id: string, patch: LeadPatch): Promise<Lead> {
    const lead = this.data.leads.find((item) => item.id === id);
    if (!lead) throw new NotFoundError("Lead", id);
    Object.assign(lead, clone(patch), { updatedAt: now() });
    this.persist();
    return clone(lead);
  }

  async deleteLead(id: string) {
    this.data.leads = this.data.leads.filter((lead) => lead.id !== id);
    this.data.analyses = this.data.analyses.filter((a) => a.leadId !== id);
    this.data.proposals = this.data.proposals.filter((p) => p.leadId !== id);
    this.data.events = this.data.events.filter((e) => e.leadId !== id);
    this.persist();
  }

  /* ------------------------------- analyses ------------------------------ */

  async createAnalysis(input: NewAnalysisInput): Promise<AnalysisRecord> {
    const version = this.data.analyses.filter((a) => a.leadId === input.leadId).reduce((max, a) => Math.max(max, a.version), 0) + 1;
    const record: AnalysisRecord = { ...clone(input), id: uuid(), version, createdAt: now() };
    this.data.analyses.push(record);
    this.persist();
    return clone(record);
  }

  async getAnalysis(id: string) {
    const record = this.data.analyses.find((a) => a.id === id);
    return record ? clone(record) : null;
  }

  async listAnalyses(leadId: string) {
    return clone(this.data.analyses.filter((a) => a.leadId === leadId).sort((a, b) => b.version - a.version));
  }

  /* ------------------------------- proposals ----------------------------- */

  async createProposal(input: NewProposal): Promise<Proposal> {
    const timestamp = now();
    const proposal: Proposal = { ...clone(input), id: uuid(), createdAt: timestamp, updatedAt: timestamp };
    this.data.proposals.push(proposal);
    this.persist();
    return clone(proposal);
  }

  async getProposal(id: string) {
    const proposal = this.data.proposals.find((p) => p.id === id);
    return proposal ? clone(proposal) : null;
  }

  async getProposalByToken(token: string) {
    const proposal = this.data.proposals.find((p) => p.shareToken === token);
    return proposal ? clone(proposal) : null;
  }

  async listProposals(query: ListProposalsQuery = {}): Promise<Page<Proposal>> {
    const filtered = this.data.proposals
      .filter((p) => !query.leadId || p.leadId === query.leadId)
      .filter((p) => !query.status?.length || query.status.includes(p.status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.version - a.version);
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    return { items: clone(filtered.slice(offset, offset + limit)), total: filtered.length };
  }

  async nextProposalVersion(leadId: string) {
    return this.data.proposals.filter((p) => p.leadId === leadId).reduce((max, p) => Math.max(max, p.version), 0) + 1;
  }

  async updateProposal(id: string, patch: ProposalUpdate): Promise<Proposal> {
    const proposal = this.data.proposals.find((p) => p.id === id);
    if (!proposal) throw new NotFoundError("Proposal", id);
    Object.assign(proposal, clone(patch), { updatedAt: now() });
    this.persist();
    return clone(proposal);
  }

  async supersedeOpenProposals(leadId: string, exceptId: string, statuses: ProposalStatus[] = ["draft", "approved"]) {
    let changed = false;
    for (const proposal of this.data.proposals) {
      if (proposal.leadId === leadId && proposal.id !== exceptId && statuses.includes(proposal.status)) {
        proposal.status = "superseded";
        proposal.updatedAt = now();
        changed = true;
      }
    }
    if (changed) this.persist();
  }

  /* -------------------------------- events ------------------------------- */

  async addEvent(input: NewEventInput): Promise<LeadEvent> {
    this.data.seq.event += 1;
    const event: LeadEvent = { ...clone(input), id: this.data.seq.event, createdAt: now() };
    this.data.events.push(event);
    if (this.data.events.length > MAX_EVENTS) this.data.events.splice(0, this.data.events.length - MAX_EVENTS);
    if (input.leadId) {
      const lead = this.data.leads.find((item) => item.id === input.leadId);
      if (lead) lead.lastActivityAt = event.createdAt;
    }
    this.persist();
    return clone(event);
  }

  async listEvents(query: ListEventsQuery = {}): Promise<LeadEvent[]> {
    const limit = query.limit ?? 50;
    let events = this.data.events.filter(
      (e) => (!query.leadId || e.leadId === query.leadId) && (query.afterId === undefined || e.id > query.afterId),
    );
    const order = query.order ?? (query.afterId !== undefined ? "asc" : "desc");
    events = order === "asc" ? events.slice(0, limit) : events.slice(-limit).reverse();
    return clone(events);
  }

  async latestEventId() {
    return this.data.seq.event;
  }

  /* ------------------------------ idempotency ---------------------------- */

  async claimIdempotencyKey(key: string, scope: string) {
    const existing = this.data.idempotency[key];
    if (existing) return existing.done ? { status: "done" as const, response: clone(existing.response) } : { status: "in_progress" as const };
    this.data.idempotency[key] = { scope, response: null, done: false, createdAt: now() };
    this.persist();
    return { status: "new" as const };
  }

  async completeIdempotencyKey(key: string, response: unknown) {
    const entry = this.data.idempotency[key];
    if (entry) {
      entry.response = clone(response);
      entry.done = true;
      this.persist();
    }
  }

  async releaseIdempotencyKey(key: string) {
    delete this.data.idempotency[key];
    this.persist();
  }

  /* --------------------------- pricing overrides -------------------------- */

  async getPricingOverrides() {
    return this.data.pricingOverrides ? clone(this.data.pricingOverrides) : null;
  }

  async savePricingOverrides(overrides: PricingOverrides) {
    this.data.pricingOverrides = clone(overrides);
    this.persist();
  }

  /* ----------------------------- app settings ------------------------------ */

  async getAppSettings() {
    return this.data.appSettings ? clone(this.data.appSettings) : null;
  }

  async saveAppSettings(settings: Partial<AppSettings>) {
    this.data.appSettings = clone(settings);
    this.persist();
  }
}
