import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalRepository } from "@/lib/db/local";
import { getRepository, setRepositoryForTests } from "@/lib/db";
import { resetConfigForTests } from "@/lib/env";
import {
  approveProposal,
  createLeadFromSubmission,
  ingestN8nEvent,
  markProposalSent,
  processNewLead,
  respondToProposal,
} from "@/lib/pipeline";
import { sampleSubmission } from "./fixtures";

const ctx = { ipHash: null, userAgent: "vitest", actor: "client" };

describe("onboarding pipeline (local store, rule-based analysis, no n8n)", () => {
  beforeEach(() => {
    for (const key of ["N8N_WEBHOOK_BASE_URL", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "SUPABASE_URL", "AI_PROVIDER"]) delete process.env[key];
    resetConfigForTests();
    setRepositoryForTests(new LocalRepository(null));
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => setRepositoryForTests(undefined));

  it("auto-sends a freshly analysed proposal by default, from submission to won", async () => {
    const lead = await createLeadFromSubmission(sampleSubmission(), ctx);
    expect(lead.reference).toMatch(/^ASD-\d{4}-[A-Z0-9]{4}$/);
    expect(lead.estimate.max).toBeGreaterThan(0);

    await processNewLead(lead.id);
    const repo = getRepository();
    const approvedLead = await repo.getLead(lead.id);
    expect(approvedLead?.status).toBe("approved");
    expect(approvedLead?.estimatedValue).toBeGreaterThan(0);
    const [proposal] = (await repo.listProposals({ leadId: lead.id })).items;
    expect(proposal.status).toBe("approved");
    expect(proposal.approvedBy).toBe("system:auto-send");

    await ingestN8nEvent({ type: "proposal.sent", proposalId: proposal.id, data: { channel: "email" } });
    expect((await repo.getLead(lead.id))?.status).toBe("sent");

    const accepted = await respondToProposal({ token: proposal.shareToken, decision: "accepted", name: "Rana Haddad", note: "Let's go" });
    expect(accepted.status).toBe("accepted");
    expect((await repo.getLead(lead.id))?.status).toBe("won");
    await expect(respondToProposal({ token: proposal.shareToken, decision: "declined", name: "Rana", note: null })).rejects.toThrow(/already/);

    const types = (await repo.listEvents({ leadId: lead.id, limit: 100, order: "asc" })).map((e) => e.type);
    expect(types).toEqual(
      expect.arrayContaining(["lead.created", "analysis.requested", "analysis.completed", "proposal.created", "proposal.approved", "proposal.sent", "proposal.accepted"]),
    );
  });

  it("stays in manual review from submission to won when auto-send is off", async () => {
    await getRepository().saveAppSettings({ autoSend: false });
    const lead = await createLeadFromSubmission(sampleSubmission(), ctx);

    await processNewLead(lead.id);
    const repo = getRepository();
    const reviewed = await repo.getLead(lead.id);
    expect(reviewed?.status).toBe("review");
    const [draft] = (await repo.listProposals({ leadId: lead.id })).items;
    expect(draft.status).toBe("draft");

    await expect(respondToProposal({ token: draft.shareToken, decision: "accepted", name: "Rana", note: null })).rejects.toThrow(/not found/i);

    const approved = await approveProposal(draft.id, "admin:test@asdesignlb.com");
    expect(approved.proposal.status).toBe("approved");
    expect(approved.dispatch.skipped).toBe(true);

    await ingestN8nEvent({ type: "proposal.sent", proposalId: draft.id, data: { channel: "email" } });
    expect((await repo.getLead(lead.id))?.status).toBe("sent");

    const accepted = await respondToProposal({ token: draft.shareToken, decision: "accepted", name: "Rana Haddad", note: "Let's go" });
    expect(accepted.status).toBe("accepted");
    expect((await repo.getLead(lead.id))?.status).toBe("won");
    await expect(respondToProposal({ token: draft.shareToken, decision: "declined", name: "Rana", note: null })).rejects.toThrow(/already/);
  });

  it("records CRM ids and analysis failures reported by n8n", async () => {
    const lead = await createLeadFromSubmission(sampleSubmission(), ctx);
    await ingestN8nEvent({ type: "crm.synced", leadReference: lead.reference, data: { airtableRecordId: "rec123", provider: "airtable" } });
    expect((await getRepository().getLead(lead.id))?.crm.airtableRecordId).toBe("rec123");
    await getRepository().updateLead(lead.id, { status: "analyzing" });
    await ingestN8nEvent({ type: "analysis.failed", leadId: lead.id, data: { error: "rate limited" } });
    const failed = await getRepository().getLead(lead.id);
    expect(failed?.status).toBe("new");
    expect(failed?.analysisError).toBe("rate limited");
  });

  it("refuses to mark a draft as sent", async () => {
    await getRepository().saveAppSettings({ autoSend: false });
    const lead = await createLeadFromSubmission(sampleSubmission(), ctx);
    await processNewLead(lead.id);
    const [draft] = (await getRepository().listProposals({ leadId: lead.id })).items;
    await expect(markProposalSent(draft.id, "n8n")).rejects.toThrow(/cannot be marked/);
  });
});
