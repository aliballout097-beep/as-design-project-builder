import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sent: { to: string | string[]; subject: string; replyTo?: string; attachments?: { filename: string }[]; text: string }[] = [];
vi.mock("@/lib/email/transport", () => ({
  sendMail: vi.fn(async (mail: (typeof sent)[number]) => {
    sent.push(mail);
    return { ok: true, messageId: `<${sent.length}@asdesignlb.com>`, attempts: 1 };
  }),
  verifySmtp: vi.fn(async () => ({ ok: true })),
}));

import { getRepository, setRepositoryForTests } from "@/lib/db";
import { LocalRepository } from "@/lib/db/local";
import { toPlainText } from "@/lib/email/layout";
import { resetConfigForTests } from "@/lib/env";
import { createLeadFromSubmission, processNewLead } from "@/lib/pipeline";
import { priceScope } from "@/lib/pricing/estimate";
import { leadScope } from "@/lib/pricing/scope";
import { analyzeHeuristically } from "@/lib/ai/heuristic";
import { makeLead } from "./helpers";
import { sampleSubmission } from "./fixtures";


describe("rule-based analysis", () => {
  it("prices the scope exactly at the client's plan from the rate card", () => {
    const lead = makeLead();
    const analysis = analyzeHeuristically(lead);
    const scope = leadScope(lead);
    expect(analysis.budget.recommended).toBe(priceScope(scope.input, "standard").list);
    expect(analysis.deliverables.every((d) => d.price >= 0)).toBe(true);
  });
});

describe("emails", () => {
  it("builds a readable plain-text alternative", () => {
    const text = toPlainText('<p>Hi <strong>Rana</strong></p><a href="https://automation.asdesignlb.com/p/x">Review</a>');
    expect(text).toContain("Hi Rana");
    expect(text).toContain("Review: https://automation.asdesignlb.com/p/x");
  });
});

describe("pipeline with the app sending emails over SMTP", () => {
  beforeEach(() => {
    for (const key of ["N8N_WEBHOOK_BASE_URL", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "SUPABASE_URL", "AI_PROVIDER", "EMAIL_DELIVERY", "ADMIN_NOTIFY_EMAILS"]) delete process.env[key];
    process.env.SMTP_USER = "info@asdesignlb.com";
    process.env.SMTP_PASS = "test-password";
    resetConfigForTests();
    setRepositoryForTests(new LocalRepository(null));
    sent.length = 0;
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    resetConfigForTests();
    setRepositoryForTests(undefined);
  });

  it("alerts info@ about the lead and emails the client the PDF â€” no clicks", async () => {
    const lead = await createLeadFromSubmission(sampleSubmission(), { ipHash: null, userAgent: "vitest", actor: "client" });
    await processNewLead(lead.id);

    const repo = getRepository();
    const [proposal] = (await repo.listProposals({ leadId: lead.id })).items;
    for (let i = 0; i < 100 && (await repo.getProposal(proposal.id))?.status !== "sent"; i++) await new Promise((r) => setTimeout(r, 100));

    const final = await repo.getProposal(proposal.id);
    expect(final?.status).toBe("sent");
    expect(final?.discount).toBeNull(); // no automatic promotion in the default catalog
    expect(final?.totals.total).toBe(final?.plans?.find((p) => p.recommended)?.price);
    expect((await repo.getLead(lead.id))?.status).toBe("sent");

    const adminAlert = sent.find((m) => m.subject.startsWith("New lead"));
    expect(adminAlert?.to).toEqual(["info@asdesignlb.com"]);
    expect(adminAlert?.replyTo).toBe("rana@example.com");

    const clientMail = sent.find((m) => m.to === "rana@example.com");
    expect(clientMail?.attachments?.[0].filename).toMatch(/^AS-Design-Proposal-ASD-.*\.pdf$/);
    expect(clientMail?.text).toContain("/p/");
    expect(sent.some((m) => m.subject.startsWith("Proposal sent to"))).toBe(true);
    // With auto-send on, the client gets the proposal only â€” not an extra acknowledgement.
    expect(sent.filter((m) => m.to === "rana@example.com")).toHaveLength(1);

    const types = (await repo.listEvents({ leadId: lead.id, limit: 100, order: "asc" })).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["email.sent", "proposal.sent"]));
  }, 30_000);
});

describe("WhatsApp to the client", () => {
  it("normalises the numbers clients actually type", async () => {
    const { normalizeWhatsAppNumber } = await import("@/lib/whatsapp");
    expect(normalizeWhatsAppNumber("03 123 456")).toBe("9613123456");
    expect(normalizeWhatsAppNumber("71-123456")).toBe("96171123456");
    expect(normalizeWhatsAppNumber("+961 3 123 456")).toBe("9613123456");
    expect(normalizeWhatsAppNumber("00961 3 123456")).toBe("9613123456");
    expect(normalizeWhatsAppNumber("+971 50 123 4567")).toBe("971501234567");
    expect(normalizeWhatsAppNumber("abc")).toBeNull();
  });

  describe("pipeline", () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    beforeEach(() => {
      for (const key of ["N8N_WEBHOOK_BASE_URL", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "SUPABASE_URL", "AI_PROVIDER", "EMAIL_DELIVERY"]) delete process.env[key];
      process.env.SMTP_USER = "info@asdesignlb.com";
      process.env.SMTP_PASS = "test-password";
      process.env.WHATSAPP_TOKEN = "EAAtest-token-0123456789";
      process.env.WHATSAPP_PHONE_NUMBER_ID = "123456789012345";
      resetConfigForTests();
      setRepositoryForTests(new LocalRepository(null));
      sent.length = 0;
      calls.length = 0;
      vi.spyOn(console, "warn").mockImplementation(() => {});
    });
    afterEach(() => {
      for (const key of ["SMTP_USER", "SMTP_PASS", "WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"]) delete process.env[key];
      vi.unstubAllGlobals();
      resetConfigForTests();
      setRepositoryForTests(undefined);
    });

    const submitWithWhatsApp = async () => {
      const submission = sampleSubmission();
      submission.contact = { ...submission.contact, phone: "03 123 456", whatsapp: true, deliveryChannel: "both" };
      const lead = await createLeadFromSubmission(submission, { ipHash: null, userAgent: "vitest", actor: "client" });
      await processNewLead(lead.id);
      const repo = getRepository();
      const [proposal] = (await repo.listProposals({ leadId: lead.id })).items;
      for (let i = 0; i < 100 && (await repo.getProposal(proposal.id))?.status !== "sent"; i++) await new Promise((r) => setTimeout(r, 100));
      return { lead, proposal: (await repo.getProposal(proposal.id))! };
    };

    it("sends the proposal PDF on WhatsApp as well as by email", async () => {
      vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify({ messages: [{ id: "wamid.TEST" }] }), { status: 200 });
      }));
      const { proposal } = await submitWithWhatsApp();
      expect(proposal.status).toBe("sent");
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://graph.facebook.com/v23.0/123456789012345/messages");
      const template = calls[0].body.template as { name: string; components: { type: string; parameters: { document?: { link: string } }[] }[] };
      expect(calls[0].body.to).toBe("9613123456");
      expect(template.name).toBe("proposal_ready");
      expect(template.components[0].parameters[0].document?.link).toMatch(new RegExp(`/p/${proposal.shareToken}/pdf$`));
      expect(sent.some((m) => m.to === "rana@example.com")).toBe(true);
      const copy = sent.find((m) => m.subject.startsWith("Proposal sent to"));
      expect(copy?.text).toContain("WhatsApp");
    }, 30_000);

    it("still counts as delivered when WhatsApp fails but the email went out", async () => {
      vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify({ error: { code: 132001, message: "Template name does not exist in the translation" } }), { status: 400 });
      }));
      const { lead, proposal } = await submitWithWhatsApp();
      expect(proposal.status).toBe("sent");
      expect(calls).toHaveLength(1); // 4xx is not retried
      const events = await getRepository().listEvents({ leadId: lead.id, limit: 100, order: "asc" });
      const wa = events.find((e) => e.type === "notification.sent" && e.data.channel === "whatsapp");
      expect(wa?.data.delivered).toBe(false);
      expect(String(wa?.data.error)).toContain("132001");
    }, 30_000);
  });
});

describe("plans", () => {
  it("stores plans on the proposal, prices it at the recommended plan and records the client's choice", async () => {
    for (const key of ["N8N_WEBHOOK_BASE_URL", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "SUPABASE_URL", "AI_PROVIDER", "SMTP_USER", "SMTP_PASS"]) delete process.env[key];
    resetConfigForTests();
    setRepositoryForTests(new LocalRepository(null));
    try {
      const { respondToProposal } = await import("@/lib/pipeline");
      const lead = await createLeadFromSubmission(sampleSubmission(), { ipHash: null, userAgent: "vitest", actor: "client" });
      await processNewLead(lead.id);
      const [proposal] = (await getRepository().listProposals({ leadId: lead.id })).items;
      expect(proposal.plans).toHaveLength(3);
      const recommended = proposal.plans!.find((p) => p.recommended)!;
      expect(proposal.totals.oneTimeSubtotal).toBe(recommended.listPrice);
      expect(proposal.totals.total).toBe(recommended.price);

      const other = proposal.plans!.find((p) => !p.recommended)!;
      const accepted = await respondToProposal({ token: proposal.shareToken, decision: "accepted", name: "Rana Haddad", note: null, plan: other.key });
      expect(accepted.clientResponse?.plan).toMatchObject({ key: other.key, price: other.price });
    } finally {
      setRepositoryForTests(undefined);
    }
  }, 30_000);
});
