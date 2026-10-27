import { estimateProject } from "@/lib/pricing/estimate";
import type { Lead } from "@/lib/types";
import { sampleSubmission } from "./fixtures";

export function makeLead(overrides: Partial<Lead> = {}): Lead {
  const s = sampleSubmission();
  const contact: Partial<typeof s.contact> = { ...s.contact };
  delete contact.consent;
  delete contact.marketingOptIn;
  const now = new Date().toISOString();
  return {
    id: "00000000-0000-4000-8000-000000000001",
    reference: "ASD-2609-TEST",
    status: "new",
    source: "builder",
    contact: contact as Lead["contact"],
    project: s.project,
    plan: s.plan,
    estimate: estimateProject({ ...s.project, timeline: s.plan.timeline }),
    fitScore: null,
    estimatedValue: null,
    analysisError: null,
    tags: [],
    notes: null,
    crm: {},
    meta: { ...s.meta, ipHash: null, userAgent: null, consent: { privacy: true, marketing: false, at: now } },
    createdAt: now,
    updatedAt: now,
    lastActivityAt: now,
    ...overrides,
  };
}
