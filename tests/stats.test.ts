import { describe, expect, it } from "vitest";
import { computeStats } from "@/lib/stats";
import type { LeadSummary } from "@/lib/types";

describe("computeStats", () => {
  it("aggregates pipeline metrics", () => {
    const now = Date.parse("2026-09-25T12:00:00Z");
    const day = 86_400_000;
    const leads: LeadSummary[] = [
      { id: "1", status: "review", estimatedValue: 10000, fitScore: 80, createdAt: new Date(now - day).toISOString() },
      { id: "2", status: "won", estimatedValue: 20000, fitScore: 60, createdAt: new Date(now - 2 * day).toISOString() },
      { id: "3", status: "lost", estimatedValue: 5000, fitScore: null, createdAt: new Date(now - 10 * day).toISOString() },
      { id: "4", status: "sent", estimatedValue: 7000, fitScore: 70, createdAt: new Date(now - 40 * day).toISOString() },
    ];
    const s = computeStats(leads, now);
    expect(s.newLast7Days).toBe(2);
    expect(s.newPrev7Days).toBe(1);
    expect(s.pipelineValue).toBe(17000);
    expect(s.wonValue).toBe(20000);
    expect(s.winRate).toBe(0.5);
    expect(s.avgFitScore).toBe(70);
    expect(s.daily).toHaveLength(14);
    expect(s.daily.reduce((sum, d) => sum + d.count, 0)).toBe(3);
  });
});
