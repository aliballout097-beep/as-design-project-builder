import "server-only";
import { analyzeHeuristically } from "@/lib/ai/heuristic";
import { getRepository } from "@/lib/db";
import { applyAnalysisResult, createLeadFromSubmission, recordEvent, setLeadStatus } from "@/lib/pipeline";
import { LeadSubmissionSchema, type LeadSubmissionInput } from "@/lib/schemas/lead";
import type { LeadStatus } from "@/lib/types";

/**
 * Sample leads for demos and local development. All companies are fictional and
 * all contact details use example.com. Analyses come from the rule-based
 * estimator, and no webhooks are sent to n8n.
 */

const SAMPLES: { input: LeadSubmissionInput; stage: LeadStatus }[] = [
  {
    stage: "review",
    input: {
      project: {
        type: "redesign",
        name: "Cedarline portfolio relaunch",
        services: ["web-design", "brand-identity"],
        description:
          "We are an architecture practice with 12 years of built work. Our current website is dated and hard to update. We want a refined, image-led portfolio that wins larger residential and hospitality commissions, with project case studies and a journal.",
        goals: ["elevate-brand", "generate-leads"],
        industry: "Architecture & interiors",
        audience: "Private developers and boutique hotel owners",
        features: ["cms", "multilingual", "blog", "analytics"],
        scale: "standard",
        languages: ["en", "ar"],
        references: ["https://www.example.com/inspiration"],
        assets: ["logo", "photography"],
      },
      plan: { budget: "1.5k-3k", timeline: "2-weeks" },
      contact: {
        name: "Rana Haddad",
        email: "rana@cedarline.example.com",
        phone: "+961 1 555 001",
        company: "Cedarline Studio (demo)",
        role: "Managing partner",
        country: "Lebanon",
        preferredContact: "video-call",
        consent: true,
      },
      meta: { source: "builder", utm: { source: "instagram", medium: "social" } },
    },
  },
  {
    stage: "sent",
    input: {
      project: {
        type: "new",
        name: "Nour Atelier online store",
        services: ["ecommerce", "social-media"],
        description:
          "Independent fashion label launching our first online store for the Gulf and Europe. Around 120 products with sizes and colours, lookbook content and Instagram-driven campaigns. We need local and international payment options.",
        goals: ["sell-online", "enter-new-market"],
        industry: "Fashion & retail",
        features: ["payments", "multilingual", "analytics"],
        scale: "standard",
        languages: ["en", "ar", "fr"],
        assets: ["logo", "brand-guidelines", "photography"],
      },
      plan: { budget: "700-1.5k", timeline: "2-weeks", budgetFlexible: true },
      contact: {
        name: "Lea Mansour",
        email: "lea@nouratelier.example.com",
        company: "Nour Atelier (demo)",
        phone: "+961 70 000 000",
        whatsapp: true,
        preferredContact: "whatsapp",
        consent: true,
      },
      meta: { source: "embed", utm: { source: "google", medium: "cpc", campaign: "ecommerce-launch" } },
    },
  },
  {
    stage: "won",
    input: {
      project: {
        type: "extend",
        name: "Patient journey automation",
        services: ["ai-website"],
        description:
          "Three outpatient clinics. Front desk teams spend hours on booking calls and reminders. We want online booking, an AI assistant for common questions (opening hours, insurance, preparation) and automatic sync of new patients into our CRM.",
        goals: ["automate-operations", "improve-conversion"],
        industry: "Healthcare & wellness",
        features: ["booking", "crm", "ai-assistant", "care-plan"],
        scale: "advanced",
        languages: ["en", "ar"],
        assets: ["logo", "website", "domain-hosting"],
      },
      plan: { budget: "3k-plus", timeline: "2-weeks" },
      contact: {
        name: "Dr. Karim Saleh",
        email: "karim@harborview.example.com",
        phone: "+961 1 555 003",
        company: "Harborview Clinics (demo)",
        role: "Operations director",
        preferredContact: "email",
        consent: true,
      },
      meta: { source: "builder", utm: { source: "linkedin" } },
    },
  },
  {
    stage: "approved",
    input: {
      project: {
        type: "new",
        services: ["web-design", "ui-ux"],
        description:
          "Freight forwarder handling 400 shipments a month. Quotes are built manually in spreadsheets and email. We need an internal dashboard where sales can generate quotes from carrier rates, plus automated follow-ups.",
        goals: ["automate-operations"],
        industry: "Technology & SaaS",
        features: ["dashboard", "integrations", "crm"],
        scale: "advanced",
        languages: ["en"],
        assets: [],
      },
      plan: { budget: "1.5k-3k", timeline: "flexible" },
      contact: {
        name: "Omar Khoury",
        email: "omar@atlasfreight.example.com",
        phone: "+961 1 555 004",
        company: "Atlas Freight Co. (demo)",
        preferredContact: "phone",
        consent: true,
      },
      meta: { source: "api" },
    },
  },
  {
    stage: "new",
    input: {
      project: {
        type: "new",
        name: "Café rebrand",
        services: ["brand-identity", "social-media"],
        description: "Neighbourhood café opening a second branch. We want a fresh identity and a social media kit.",
        goals: ["elevate-brand"],
        industry: "Food & beverage",
        features: ["content-production"],
        scale: "starter",
        languages: ["en", "ar"],
        assets: ["logo"],
      },
      plan: { budget: "under-300", timeline: "asap" },
      contact: {
        name: "Maya Aoun",
        email: "maya@oliveember.example.com",
        company: "Olive & Ember Café (demo)",
        preferredContact: "whatsapp",
        whatsapp: true,
        phone: "+961 3 000 000",
        consent: true,
      },
      meta: { source: "builder" },
    },
  },
];

export async function seedDemoData(): Promise<number> {
  const repo = getRepository();
  let created = 0;
  for (const sample of SAMPLES) {
    const submission = LeadSubmissionSchema.parse(sample.input);
    const lead = await createLeadFromSubmission(submission, { ipHash: null, userAgent: "demo-seed", actor: "system" });
    await repo.updateLead(lead.id, { tags: ["demo"] });
    created++;
    if (sample.stage === "new") continue;

    const { proposal, lead: reviewed } = await applyAnalysisResult({
      lead,
      analysis: analyzeHeuristically(lead),
      provider: "heuristic",
      model: null,
      usage: null,
      runner: "app",
      instructions: null,
      fallbackReason: null,
      durationMs: 0,
      actor: "system",
      syncCrm: false,
      autoSend: false,
    });
    if (sample.stage === "review") continue;

    const now = new Date().toISOString();
    await repo.updateProposal(proposal.id, { status: "approved", approvedAt: now, approvedBy: "admin:demo" });
    await recordEvent({ type: "proposal.approved", leadId: lead.id, proposalId: proposal.id, actor: "admin:demo" });
    let current = await setLeadStatus(reviewed, "approved", "admin:demo");
    if (sample.stage === "approved") continue;

    await repo.updateProposal(proposal.id, { status: "sent", sentAt: now });
    await recordEvent({ type: "proposal.sent", leadId: lead.id, proposalId: proposal.id, actor: "n8n", data: { channel: "email" } });
    current = await setLeadStatus(current, "sent", "n8n");
    if (sample.stage === "sent") continue;

    await repo.updateProposal(proposal.id, {
      status: "accepted",
      viewedAt: now,
      respondedAt: now,
      clientResponse: { decision: "accepted", name: lead.contact.name, note: "Looking forward to the kickoff!", at: now },
    });
    await recordEvent({ type: "proposal.accepted", leadId: lead.id, proposalId: proposal.id, actor: "client" });
    await setLeadStatus(current, "won", "client");
  }
  return created;
}
