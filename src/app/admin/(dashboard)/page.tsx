import { AlertTriangle, ArrowUpRight, Clock, Sparkles } from "lucide-react";
import Link from "next/link";
import { CURRENCY, SERVICE_MAP } from "@/config/catalog";
import { getRepository } from "@/lib/db";
import { formatMoney, formatRelative } from "@/lib/format";
import { computeStats, staleAnalyses } from "@/lib/stats";
import { ActivityFeed } from "@/components/admin/ActivityFeed";
import { DailyLeadsChart, StageBars } from "@/components/admin/Charts";
import { PageHeader, Panel } from "@/components/admin/PageHeader";
import { LEAD_STATUS_LABELS, LeadStatusPill } from "@/components/admin/StatusPill";

export const metadata = { title: "Overview" };

function Kpi({ label, value, hint, accent = false }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="glass edge-light rounded-3xl p-5">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-fog">{label}</p>
      <p className={`mt-3 font-display text-[36px] leading-none tracking-tight ${accent ? "text-ember-gradient" : "text-ivory"}`}>{value}</p>
      {hint ? <p className="mt-2 text-[12.5px] text-mist">{hint}</p> : null}
    </div>
  );
}

export default async function OverviewPage() {
  const repo = getRepository();
  const [summaries, attention, analyzing, recent, events] = await Promise.all([
    repo.listLeadSummaries(),
    repo.listLeads({ status: ["review"], limit: 6 }),
    repo.listLeads({ status: ["analyzing", "new"], limit: 20 }),
    repo.listLeads({ limit: 6 }),
    repo.listEvents({ limit: 14 }),
  ]);
  const stats = computeStats(summaries);
  const failed = analyzing.items.filter((lead) => lead.analysisError);
  const stale = staleAnalyses(analyzing.items);
  const leadNames = Object.fromEntries(recent.items.concat(attention.items, analyzing.items).map((l) => [l.id, l.contact.company ?? l.contact.name]));
  const delta = stats.newLast7Days - stats.newPrev7Days;

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Studio pipeline"
        description="Incoming briefs, AI scope analyses and proposals — updating live."
        actions={
          <a href="/" target="_blank" className="inline-flex items-center gap-1.5 rounded-xl border border-line/10 px-3.5 py-2 text-[13px] text-mist transition hover:text-ivory">
            Open Project Builder <ArrowUpRight className="size-3.5" />
          </a>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="New leads · 7 days" value={String(stats.newLast7Days)} hint={`${delta >= 0 ? "+" : ""}${delta} vs previous 7 days`} />
        <Kpi label="Awaiting review" value={String(stats.awaitingReview)} hint="Proposal drafts ready to approve" accent={stats.awaitingReview > 0} />
        <Kpi label="Open pipeline" value={formatMoney(stats.pipelineValue, CURRENCY, { compact: true })} hint={`Won ${formatMoney(stats.wonValue, CURRENCY, { compact: true })}`} />
        <Kpi
          label="Win rate"
          value={stats.winRate === null ? "—" : `${Math.round(stats.winRate * 100)}%`}
          hint={stats.avgFitScore === null ? "No decided proposals yet" : `Avg. fit score ${stats.avgFitScore}`}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Needs your attention" action={<Link className="text-[12.5px] text-ember-300 hover:text-ember-200" href="/admin/leads?status=review">View all</Link>}>
          {attention.items.length === 0 && failed.length === 0 && stale.length === 0 ? (
            <p className="py-8 text-center text-[14px] text-fog">You&apos;re all caught up. New drafts will appear here as soon as the analysis finishes.</p>
          ) : (
            <ul className="divide-y divide-line/[0.06]">
              {failed.map((lead) => (
                <li key={lead.id}>
                  <Link href={`/admin/leads/${lead.id}`} className="flex items-center gap-4 py-3.5">
                    <AlertTriangle className="size-4 shrink-0 text-danger" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] text-ivory">{lead.contact.company ?? lead.contact.name}</p>
                      <p className="truncate text-[12.5px] text-danger/90">Analysis failed — {lead.analysisError}</p>
                    </div>
                    <span className="text-[12.5px] text-ember-300">Retry</span>
                  </Link>
                </li>
              ))}
              {stale.map((lead) => (
                <li key={lead.id}>
                  <Link href={`/admin/leads/${lead.id}`} className="flex items-center gap-4 py-3.5">
                    <Clock className="size-4 shrink-0 text-warning" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] text-ivory">{lead.contact.company ?? lead.contact.name}</p>
                      <p className="text-[12.5px] text-warning/90">Analysing since {formatRelative(lead.updatedAt)} — check the n8n workflow</p>
                    </div>
                  </Link>
                </li>
              ))}
              {attention.items.map((lead) => (
                <li key={lead.id}>
                  <Link href={`/admin/leads/${lead.id}`} className="group flex items-center gap-4 py-3.5">
                    <Sparkles className="size-4 shrink-0 text-ember-300" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] text-ivory">
                        {lead.contact.company ?? lead.contact.name} <span className="text-fog">· {lead.reference}</span>
                      </p>
                      <p className="truncate text-[12.5px] text-mist">{lead.project.services.map((s) => SERVICE_MAP[s]?.name ?? s).join(" · ")}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-[14px] text-ivory">{formatMoney(lead.estimatedValue, CURRENCY)}</p>
                      <p className="text-[11.5px] text-fog">fit {lead.fitScore ?? "—"}</p>
                    </div>
                    <ArrowUpRight className="size-4 text-fog transition group-hover:text-ivory" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Live activity">
          <div className="max-h-[420px] overflow-y-auto pr-1">
            <ActivityFeed events={events} leadNames={leadNames} />
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Leads per day · last 14 days">
          <DailyLeadsChart data={stats.daily} />
        </Panel>
        <Panel title="Pipeline by stage">
          <StageBars
            rows={(["new", "analyzing", "review", "approved", "sent", "won", "lost"] as const).map((status) => ({
              label: LEAD_STATUS_LABELS[status],
              value: stats.totals[status],
              href: `/admin/leads?status=${status}`,
            }))}
          />
        </Panel>
      </div>

      <Panel title="Latest briefs" className="mt-4" action={<Link className="text-[12.5px] text-ember-300 hover:text-ember-200" href="/admin/leads">All leads</Link>}>
        {recent.items.length ? (
          <ul className="divide-y divide-line/[0.06]">
            {recent.items.map((lead) => (
              <li key={lead.id}>
                <Link href={`/admin/leads/${lead.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                  <span className="w-36 font-mono text-[12px] text-fog">{lead.reference}</span>
                  <span className="min-w-0 flex-1 truncate text-[14px] text-ivory">{lead.contact.company ?? lead.contact.name}</span>
                  <LeadStatusPill status={lead.status} />
                  <span className="w-24 text-right text-[12.5px] text-fog">{formatRelative(lead.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-[14px] text-fog">
            No leads yet. Share the Project Builder, or load demo data from <Link className="text-ember-300" href="/admin/settings">Settings</Link>.
          </p>
        )}
      </Panel>
    </>
  );
}
