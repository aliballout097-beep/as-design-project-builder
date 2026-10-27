import "server-only";
import { getRepository } from "@/lib/db";
import { appSendsEmail } from "@/lib/email";
import { getConfig } from "@/lib/env";
import { emailFailureRounds, MAX_EMAIL_ROUNDS, runAnalysisFallback, sendProposalEmail } from "./index";

/**
 * Background safety net, started once per server process (src/instrumentation.ts).
 *
 * The per-request timers in the pipeline cover the normal case; this sweeper
 * covers what they can't — a server restart in the middle of an analysis, an
 * SMTP outage that outlasted the retries — so that every lead still ends up
 * with a proposal in the client's inbox, without anyone clicking anything.
 */

const INTERVAL_MS = 2 * 60_000;
/** Approved-but-unsent proposals older than this are retried. */
const EMAIL_RETRY_AFTER_MS = 3 * 60_000;

let running = false;

export async function sweep(): Promise<{ analyses: number; emails: number }> {
  if (running) return { analyses: 0, emails: 0 };
  running = true;
  const done = { analyses: 0, emails: 0 };
  try {
    const repo = getRepository();
    const config = getConfig();
    const now = Date.now();

    // 1. Leads stuck in "analyzing" (n8n never answered, or the server restarted mid-analysis).
    const stuck = await repo.listLeads({ status: ["analyzing"], limit: 20 });
    for (const lead of stuck.items) {
      const since = new Date(lead.updatedAt).getTime();
      if (now - since < config.analysisFallbackMs + 60_000) continue;
      if (await runAnalysisFallback(lead.id, since)) done.analyses++;
    }

    // 2. Approved proposals that never reached the client's inbox.
    if (appSendsEmail()) {
      const approved = await repo.listProposals({ status: ["approved"], limit: 20 });
      for (const proposal of approved.items) {
        if (proposal.sentAt) continue;
        const approvedAt = new Date(proposal.approvedAt ?? proposal.updatedAt).getTime();
        if (now - approvedAt < EMAIL_RETRY_AFTER_MS) continue;
        // Give up after a few rounds (e.g. the address bounces) — the team was already alerted.
        if (emailFailureRounds(proposal.id) >= MAX_EMAIL_ROUNDS) continue;
        if (await sendProposalEmail(proposal.id)) done.emails++;
      }
    }
  } catch (error) {
    console.error("[sweeper] run failed", error);
  } finally {
    running = false;
  }
  if (done.analyses || done.emails) console.log(`[sweeper] recovered ${done.analyses} analyses, ${done.emails} proposal emails`);
  return done;
}

const globalState = globalThis as unknown as { __asdSweeper?: ReturnType<typeof setInterval> };

export function startSweeper() {
  if (globalState.__asdSweeper) return;
  globalState.__asdSweeper = setInterval(() => void sweep(), INTERVAL_MS);
  globalState.__asdSweeper.unref?.();
  // First pass shortly after boot, once the server is serving requests.
  setTimeout(() => void sweep(), 45_000).unref?.();
  console.log("[sweeper] started — checking every 2 minutes for stuck analyses and unsent proposals");
}
