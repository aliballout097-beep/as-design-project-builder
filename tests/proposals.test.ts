import { describe, expect, it } from "vitest";
import { analyzeHeuristically } from "@/lib/ai/heuristic";
import { applyProposalPatch, buildProposalDraft, computeTotals, isProposalExpired, paymentBreakdown, ProposalPatchSchema } from "@/lib/proposals";
import type { Proposal } from "@/lib/types";
import { makeLead } from "./helpers";

const draft = () => {
  const lead = makeLead();
  return { ...buildProposalDraft({ leadId: lead.id, analysisId: null, analysis: analyzeHeuristically(lead), version: 1 }), id: "p1", createdAt: "", updatedAt: "" } as Proposal;
};

describe("proposals", () => {
  it("builds a draft whose total equals the analysis recommendation", () => {
    const lead = makeLead();
    const analysis = analyzeHeuristically(lead);
    const p = buildProposalDraft({ leadId: lead.id, analysisId: null, analysis, version: 1 });
    expect(p.status).toBe("draft");
    expect(p.totals.oneTimeSubtotal).toBe(analysis.budget.recommended);
    expect(p.shareToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(p.lineItems.filter((i) => !i.included).every((i) => i.optional)).toBe(true);
  });

  it("computes discounts, tax and monthly totals", () => {
    const totals = computeTotals({
      lineItems: [
        { id: "a", title: "A", description: "", serviceKey: "x", phase: "P", price: 1000, billing: "one_time", optional: false, included: true },
        { id: "b", title: "B", description: "", serviceKey: "x", phase: "P", price: 200, billing: "monthly", optional: false, included: true },
        { id: "c", title: "C", description: "", serviceKey: "x", phase: "P", price: 500, billing: "one_time", optional: true, included: false },
      ],
      phases: [{ id: "p", name: "P", weeks: 2.5, summary: "", milestones: [] }],
      discount: { type: "percent", value: 10, label: null },
      taxRate: 11,
    });
    expect(totals).toMatchObject({ oneTimeSubtotal: 1000, discountAmount: 100, oneTimeTotal: 900, taxAmount: 99, total: 999, monthlyTotal: 200, optionalTotal: 500, totalWeeks: 2.5 });
  });

  it("caps amount discounts at the subtotal", () => {
    const totals = computeTotals({ lineItems: [{ id: "a", title: "A", description: "", serviceKey: "x", phase: "P", price: 300, billing: "one_time", optional: false, included: true }], phases: [], discount: { type: "amount", value: 999, label: null }, taxRate: 0 });
    expect(totals.total).toBe(0);
  });

  it("splits payments so milestones always sum to the total", () => {
    const parts = paymentBreakdown(1001, [{ label: "a", percent: 40 }, { label: "b", percent: 40 }, { label: "c", percent: 20 }]);
    expect(parts.reduce((s, p) => s + p.amount, 0)).toBe(1001);
  });

  it("validates patches and recomputes totals", () => {
    const p = draft();
    expect(ProposalPatchSchema.safeParse({ paymentSchedule: [{ label: "x", percent: 50 }] }).success).toBe(false);
    const patch = ProposalPatchSchema.parse({ lineItems: [{ title: "Only item", price: 2500 }], taxRate: 0 });
    const next = applyProposalPatch(p, patch);
    expect(next.lineItems[0].id).toMatch(/^li_/);
    expect(next.totals.total).toBe(2500);
  });

  it("detects expiry at the end of the validity day", () => {
    expect(isProposalExpired({ validUntil: "2026-01-01" }, new Date("2026-01-01T20:00:00Z"))).toBe(false);
    expect(isProposalExpired({ validUntil: "2026-01-01" }, new Date("2026-01-02T01:00:00Z"))).toBe(true);
  });
});
