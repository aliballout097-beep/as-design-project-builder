import { describe, expect, it } from "vitest";
import { analyzeHeuristically } from "@/lib/ai/heuristic";
import { SCOPE_ANALYSIS_JSON_SCHEMA } from "@/lib/ai/json-schema";
import { computeAlignment, normalizeAnalysis, parseAnalysis, ScopeAnalysisSchema } from "@/lib/schemas/analysis";
import { LeadSubmissionSchema } from "@/lib/schemas/lead";
import { sampleInput } from "./fixtures";
import { makeLead } from "./helpers";

describe("lead submission schema", () => {
  it("normalises emails, URLs and defaults", () => {
    const s = LeadSubmissionSchema.parse(sampleInput);
    expect(s.contact.email).toBe("rana@example.com");
    expect(s.project.references).toEqual(["https://dribbble.com/shots/1"]);
    expect(s.meta.source).toBe("builder");
  });

  it("rejects missing consent, short descriptions and unknown services", () => {
    const bad = (patch: (i: typeof sampleInput) => void) => {
      const input = structuredClone(sampleInput);
      patch(input);
      return LeadSubmissionSchema.safeParse(input).success;
    };
    expect(bad((i) => { i.contact.consent = false as never; })).toBe(false);
    expect(bad((i) => { i.project.description = "too short"; })).toBe(false);
    expect(bad((i) => { i.project.services = ["space-rockets" as never]; })).toBe(false);
    expect(bad((i) => { i.contact.email = "not-an-email"; })).toBe(false);
  });
});

describe("scope analysis", () => {
  it("heuristic output satisfies the structured-output schema", () => {
    const analysis = analyzeHeuristically(makeLead());
    expect(ScopeAnalysisSchema.safeParse(analysis).success).toBe(true);
    expect(analysis.deliverables.length).toBeGreaterThan(4);
    expect(analysis.fitScore).toBeGreaterThanOrEqual(0);
    expect(analysis.fitScore).toBeLessThanOrEqual(100);
  });

  it("normalisation reconciles totals, clamps and repairs phases", () => {
    const raw = structuredClone(analyzeHeuristically(makeLead()));
    raw.fitScore = 140;
    raw.budget.recommended = 1;
    raw.deliverables[0].phase = "discovery & strategy"; // case mismatch
    raw.deliverables[1].phase = "Nonexistent phase";
    raw.deliverables[2].price = -50;
    const n = normalizeAnalysis(raw);
    expect(n.fitScore).toBe(100);
    const phases = new Set(n.timeline.phases.map((p) => p.name));
    expect(n.deliverables.every((d) => phases.has(d.phase))).toBe(true);
    expect(n.deliverables[2].price).toBe(0);
    expect(n.budget.recommended).toBe(n.deliverables.filter((d) => !d.optional && d.billing === "one_time").reduce((s, d) => s + d.price, 0));
    expect(normalizeAnalysis(n)).toEqual(n); // idempotent
  });

  it("computes budget alignment", () => {
    expect(computeAlignment(10000, null, null)).toBe("unknown");
    expect(computeAlignment(20000, 7000, 15000)).toBe("above");
    expect(computeAlignment(5000, 7000, 15000)).toBe("below");
    expect(computeAlignment(12000, 7000, 15000)).toBe("within");
  });

  it("rejects malformed model output", () => {
    expect(() => parseAnalysis({ summary: "x" })).toThrow();
  });

  it("JSON schema meets structured-output constraints", () => {
    const walk = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (n.type === "object") {
        expect(n.additionalProperties).toBe(false);
        expect(new Set(n.required as string[])).toEqual(new Set(Object.keys(n.properties as object)));
      }
      for (const key of ["minimum", "maximum", "minLength", "maxLength"]) expect(n[key]).toBeUndefined();
      Object.values(n).forEach(walk);
    };
    walk(SCOPE_ANALYSIS_JSON_SCHEMA);
  });
});
