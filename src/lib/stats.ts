import { LEAD_STATUSES, OPEN_LEAD_STATUSES, type DashboardStats, type LeadStatus, type LeadSummary } from "@/lib/types";

const DAY = 86_400_000;

/** Aggregate dashboard metrics from lightweight lead summaries (pure; unit-tested). */
export function computeStats(leads: LeadSummary[], now = Date.now(), days = 14): DashboardStats {
  const totals = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<LeadStatus, number>;
  let newLast7Days = 0;
  let newPrev7Days = 0;
  let pipelineValue = 0;
  let wonValue = 0;
  let fitSum = 0;
  let fitCount = 0;
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  const firstDay = startOfToday.getTime() - (days - 1) * DAY;
  const daily = Array.from({ length: days }, (_, i) => ({ date: new Date(firstDay + i * DAY).toISOString().slice(0, 10), count: 0 }));

  for (const lead of leads) {
    totals[lead.status] += 1;
    const created = new Date(lead.createdAt).getTime();
    const age = now - created;
    if (age <= 7 * DAY) newLast7Days++;
    else if (age <= 14 * DAY) newPrev7Days++;
    if (OPEN_LEAD_STATUSES.includes(lead.status)) pipelineValue += lead.estimatedValue ?? 0;
    if (lead.status === "won") wonValue += lead.estimatedValue ?? 0;
    if (lead.fitScore !== null) {
      fitSum += lead.fitScore;
      fitCount++;
    }
    const index = Math.floor((created - firstDay) / DAY);
    if (index >= 0 && index < days) daily[index].count++;
  }
  const decided = totals.won + totals.lost;
  return {
    totals,
    newLast7Days,
    newPrev7Days,
    awaitingReview: totals.review,
    pipelineValue,
    wonValue,
    winRate: decided ? totals.won / decided : null,
    avgFitScore: fitCount ? Math.round(fitSum / fitCount) : null,
    daily,
  };
}

/** Leads stuck in "analyzing" longer than `thresholdMs` (e.g. an inactive n8n workflow). */
export function staleAnalyses<T extends { status: string; updatedAt: string }>(leads: T[], thresholdMs = 15 * 60 * 1000, now = Date.now()): T[] {
  return leads.filter((lead) => lead.status === "analyzing" && now - new Date(lead.updatedAt).getTime() > thresholdMs);
}
