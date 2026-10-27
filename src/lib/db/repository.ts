import type { Estimate } from "@/lib/pricing/estimate";
import type { PricingOverrides } from "@/lib/pricing/overrides";
import type { NewProposal } from "@/lib/proposals";
import type { AppSettings } from "@/lib/settings";
import type { Contact, Plan, Project } from "@/lib/schemas/lead";
import type {
  AnalysisRecord,
  CrmLinks,
  Lead,
  LeadEvent,
  LeadRecordMeta,
  LeadSource,
  LeadStatus,
  LeadSummary,
  Proposal,
  ProposalStatus,
} from "@/lib/types";

/**
 * Persistence contract. Two implementations ship with the platform:
 *   • `SupabaseRepository` — production (Postgres + RLS, see supabase/migrations)
 *   • `LocalRepository`    — zero-setup JSON file store for development / demos
 */

export interface NewLeadInput {
  reference: string;
  status: LeadStatus;
  source: LeadSource;
  contact: Contact;
  project: Project;
  plan: Plan;
  estimate: Estimate;
  meta: LeadRecordMeta;
  tags?: string[];
}

export type LeadPatch = Partial<{
  status: LeadStatus;
  fitScore: number | null;
  estimatedValue: number | null;
  analysisError: string | null;
  tags: string[];
  notes: string | null;
  crm: CrmLinks;
}>;

export type NewAnalysisInput = Omit<AnalysisRecord, "id" | "createdAt" | "version">;

export type ProposalUpdate = Partial<Omit<Proposal, "id" | "leadId" | "createdAt" | "updatedAt">>;

export type NewEventInput = Omit<LeadEvent, "id" | "createdAt">;

export interface ListLeadsQuery {
  status?: LeadStatus[];
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ListProposalsQuery {
  leadId?: string;
  status?: ProposalStatus[];
  limit?: number;
  offset?: number;
}

export interface ListEventsQuery {
  leadId?: string;
  /** Return events with id > afterId (ascending) — used by the live stream. */
  afterId?: number;
  limit?: number;
  order?: "asc" | "desc";
}

export interface Page<T> {
  items: T[];
  total: number;
}

export interface Repository {
  readonly kind: "supabase" | "local";

  createLead(input: NewLeadInput): Promise<Lead>;
  getLead(id: string): Promise<Lead | null>;
  getLeadByReference(reference: string): Promise<Lead | null>;
  listLeads(query?: ListLeadsQuery): Promise<Page<Lead>>;
  listLeadSummaries(limit?: number): Promise<LeadSummary[]>;
  updateLead(id: string, patch: LeadPatch): Promise<Lead>;
  deleteLead(id: string): Promise<void>;

  createAnalysis(input: NewAnalysisInput): Promise<AnalysisRecord>;
  getAnalysis(id: string): Promise<AnalysisRecord | null>;
  listAnalyses(leadId: string): Promise<AnalysisRecord[]>;

  createProposal(input: NewProposal): Promise<Proposal>;
  getProposal(id: string): Promise<Proposal | null>;
  getProposalByToken(token: string): Promise<Proposal | null>;
  listProposals(query?: ListProposalsQuery): Promise<Page<Proposal>>;
  nextProposalVersion(leadId: string): Promise<number>;
  updateProposal(id: string, patch: ProposalUpdate): Promise<Proposal>;
  /** Mark the lead's other proposals in `statuses` (default draft/approved) as superseded. */
  supersedeOpenProposals(leadId: string, exceptId: string, statuses?: ProposalStatus[]): Promise<void>;

  addEvent(input: NewEventInput): Promise<LeadEvent>;
  listEvents(query?: ListEventsQuery): Promise<LeadEvent[]>;
  latestEventId(): Promise<number>;

  /**
   * Idempotency for webhook callbacks (n8n retries). `claim` returns the stored
   * response when the key was already processed, `null` when newly claimed.
   */
  claimIdempotencyKey(key: string, scope: string): Promise<{ status: "new" } | { status: "done"; response: unknown } | { status: "in_progress" }>;
  completeIdempotencyKey(key: string, response: unknown): Promise<void>;
  releaseIdempotencyKey(key: string): Promise<void>;

  /** Admin-editable price overrides (Settings → Pricing). `null` = none set, use `catalog.ts` defaults. */
  getPricingOverrides(): Promise<PricingOverrides | null>;
  savePricingOverrides(overrides: PricingOverrides): Promise<void>;

  /** Admin-editable app settings (Settings → Automation). `null` = none set, use defaults. */
  getAppSettings(): Promise<Partial<AppSettings> | null>;
  saveAppSettings(settings: Partial<AppSettings>): Promise<void>;
}

export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} not found`);
    this.name = "NotFoundError";
  }
}
