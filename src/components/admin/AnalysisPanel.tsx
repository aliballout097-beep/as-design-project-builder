import { AlertTriangle, HelpCircle, ShieldAlert } from "lucide-react";
import { formatMoney, formatRelative } from "@/lib/format";
import type { AnalysisRecord } from "@/lib/types";
import { cn } from "@/components/ui/cn";

const ALIGNMENT = {
  within: { label: "Within client budget", tone: "text-success" },
  above: { label: "Above client budget", tone: "text-warning" },
  below: { label: "Below client budget", tone: "text-info" },
  unknown: { label: "Client budget unknown", tone: "text-fog" },
};

const SEVERITY = { high: "text-danger", medium: "text-warning", low: "text-fog" };

/** Budget fit: client range vs AI estimate range vs recommendation, on one shared axis. */
function BudgetScale({ analysis }: { analysis: AnalysisRecord["result"] }) {
  const { budget } = analysis;
  const values = [budget.estimateLow, budget.estimateHigh, budget.recommended, budget.clientBudgetLow ?? 0, budget.clientBudgetHigh ?? budget.estimateHigh];
  const max = Math.max(...values) * 1.1 || 1;
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const money = (v: number) => formatMoney(v, budget.currency, { compact: true });
  return (
    <div className="space-y-3">
      {budget.clientBudgetLow !== null ? (
        <div>
          <p className="mb-1 text-[11.5px] text-fog">Client budget</p>
          <div className="relative h-2.5 rounded-full bg-line/[0.05]">
            <div className="absolute inset-y-0 rounded-full border border-glacier-400/60 bg-glacier-400/25" style={{ left: pct(budget.clientBudgetLow), width: `calc(${pct(budget.clientBudgetHigh ?? max)} - ${pct(budget.clientBudgetLow)})` }} />
          </div>
        </div>
      ) : null}
      <div>
        <p className="mb-1 text-[11.5px] text-fog">Estimate range · recommended</p>
        <div className="relative h-2.5 rounded-full bg-line/[0.05]">
          <div className="absolute inset-y-0 rounded-full bg-ember-500/35" style={{ left: pct(budget.estimateLow), width: `calc(${pct(budget.estimateHigh)} - ${pct(budget.estimateLow)})` }} />
          <div className="absolute -top-1 h-[18px] w-[3px] -translate-x-1/2 rounded-full bg-ember-300 shadow-[0_0_10px_rgb(210_102_10/0.45)]" style={{ left: pct(budget.recommended) }} title={`Recommended ${money(budget.recommended)}`} />
        </div>
      </div>
      <div className="flex justify-between font-mono text-[11px] text-fog">
        <span>{money(0)}</span>
        <span className="text-ember-200">rec. {money(budget.recommended)}</span>
        <span>{money(max)}</span>
      </div>
    </div>
  );
}

export function AnalysisPanel({ analyses }: { analyses: AnalysisRecord[] }) {
  const [latest, ...older] = analyses;
  if (!latest) {
    return (
      <section className="glass edge-light rounded-3xl p-6">
        <h2 className="font-display text-[22px] text-ivory">AI scope analysis</h2>
        <p className="mt-2 text-[14px] text-fog">No analysis yet — it appears here as soon as the AI workflow finishes.</p>
      </section>
    );
  }
  const a = latest.result;
  const alignment = ALIGNMENT[a.budget.alignment];
  return (
    <section className="glass edge-light rounded-3xl p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[22px] tracking-tight text-ivory">AI scope analysis</h2>
          <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-fog">
            v{latest.version} · {latest.provider}
            {latest.model ? ` · ${latest.model}` : ""} · via {latest.runner} · {formatRelative(latest.createdAt)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-fog">Fit score</p>
          <p className={cn("font-display text-[34px] leading-none", a.fitScore >= 70 ? "text-success" : a.fitScore >= 45 ? "text-warning" : "text-danger")}>{a.fitScore}</p>
        </div>
      </header>

      {latest.fallbackReason ? (
        <div className="mt-4 flex gap-2 rounded-xl border border-warning/25 bg-warning/[0.07] px-3.5 py-2.5 text-[13px] text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Rule-based fallback — the AI provider failed: {latest.fallbackReason}
        </div>
      ) : null}
      {latest.instructions ? <p className="mt-3 text-[13px] text-iris-300">Direction: “{latest.instructions}”</p> : null}

      <p className="mt-4 text-[14.5px] leading-relaxed text-ivory/90">{a.summary}</p>
      <p className="mt-2 text-[13px] text-mist">{a.fitRationale}</p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-line/[0.07] p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-mist">Budget</p>
            <p className={cn("text-[12.5px]", alignment.tone)}>{alignment.label}</p>
          </div>
          <BudgetScale analysis={a} />
          <p className="mt-3 text-[13px] leading-relaxed text-mist">{a.budget.notes}</p>
        </div>
        <div className="rounded-2xl border border-line/[0.07] p-4">
          <p className="mb-3 text-[12px] font-medium uppercase tracking-[0.14em] text-mist">Client needs</p>
          <ul className="space-y-1.5">
            {a.clientNeeds.map((need) => (
              <li key={need} className="flex gap-2 text-[13.5px] text-ivory/85">
                <span className="mt-2 h-px w-3 shrink-0 bg-ember-400" />
                {need}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12.5px] text-fog">
            {a.projectType} · complexity <span className="text-mist">{a.complexity.replace("_", " ")}</span> · {a.timeline.totalWeeks} weeks
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-line/[0.07] p-4">
          <p className="mb-3 flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-mist">
            <ShieldAlert className="size-3.5" /> Risks
          </p>
          <ul className="space-y-3">
            {a.risks.length ? (
              a.risks.map((risk) => (
                <li key={risk.title}>
                  <p className="text-[13.5px] text-ivory">
                    <span className={cn("mr-2 font-mono text-[10.5px] uppercase", SEVERITY[risk.severity])}>{risk.severity}</span>
                    {risk.title}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-mist">{risk.mitigation}</p>
                </li>
              ))
            ) : (
              <li className="text-[13px] text-fog">No notable risks.</li>
            )}
          </ul>
        </div>
        <div className="rounded-2xl border border-line/[0.07] p-4">
          <p className="mb-3 flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-mist">
            <HelpCircle className="size-3.5" /> Discovery-call questions
          </p>
          <ol className="list-decimal space-y-1.5 pl-5 text-[13.5px] text-ivory/85 marker:text-fog">
            {a.clarifyingQuestions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
        </div>
      </div>

      {older.length ? (
        <p className="mt-4 text-[12px] text-fog">
          Previous versions: {older.map((o) => `v${o.version} (${o.provider}, ${formatMoney(o.result.budget.recommended, o.result.budget.currency, { compact: true })})`).join(" · ")}
        </p>
      ) : null}
    </section>
  );
}
