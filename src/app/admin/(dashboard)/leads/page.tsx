import { Search } from "lucide-react";
import Link from "next/link";
import { BUDGET_MAP, CURRENCY, SERVICE_MAP } from "@/config/catalog";
import { getRepository } from "@/lib/db";
import { formatMoney, formatRelative } from "@/lib/format";
import { computeStats } from "@/lib/stats";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/types";
import { PageHeader } from "@/components/admin/PageHeader";
import { LEAD_STATUS_LABELS, LeadStatusPill } from "@/components/admin/StatusPill";
import { cn } from "@/components/ui/cn";

export const metadata = { title: "Leads" };

const PAGE_SIZE = 25;

function FitBar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-fog">—</span>;
  const tone = score >= 70 ? "bg-success" : score >= 45 ? "bg-warning" : "bg-danger";
  return (
    <span className="inline-flex items-center gap-2" title={`Fit score ${score}/100`}>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-line/[0.07]">
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${score}%` }} />
      </span>
      <span className="font-mono text-[12px] text-ivory">{score}</span>
    </span>
  );
}

export default async function LeadsPage({ searchParams }: PageProps<"/admin/leads">) {
  const params = await searchParams;
  const status = typeof params.status === "string" && (LEAD_STATUSES as readonly string[]).includes(params.status) ? (params.status as LeadStatus) : null;
  const search = typeof params.q === "string" ? params.q : "";
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const repo = getRepository();
  const [result, summaries] = await Promise.all([
    repo.listLeads({ status: status ? [status] : undefined, search: search || undefined, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    repo.listLeadSummaries(),
  ]);
  const totals = computeStats(summaries).totals;
  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const href = (overrides: Record<string, string | number | null>) => {
    const query = new URLSearchParams();
    const merged = { status, q: search || null, page: null as number | null, ...overrides };
    for (const [key, value] of Object.entries(merged)) if (value) query.set(key, String(value));
    const qs = query.toString();
    return `/admin/leads${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <PageHeader eyebrow="Leads" title="Client leads" description={`${summaries.length} briefs received`} />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav className="no-scrollbar flex gap-1 overflow-x-auto rounded-2xl border border-line/[0.08] bg-line/[0.02] p-1" aria-label="Filter by status">
          <Link href={href({ status: null })} className={cn("rounded-xl px-3 py-1.5 text-[13px] transition", !status ? "bg-line/10 text-ivory" : "text-mist hover:text-ivory")}>
            All <span className="ml-1 font-mono text-[11px] text-fog">{summaries.length}</span>
          </Link>
          {LEAD_STATUSES.map((s) => (
            <Link key={s} href={href({ status: s })} className={cn("whitespace-nowrap rounded-xl px-3 py-1.5 text-[13px] transition", status === s ? "bg-line/10 text-ivory" : "text-mist hover:text-ivory")}>
              {LEAD_STATUS_LABELS[s]} <span className="ml-1 font-mono text-[11px] text-fog">{totals[s]}</span>
            </Link>
          ))}
        </nav>
        <form action="/admin/leads" className="relative w-full sm:w-72">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fog" />
          <input
            name="q"
            defaultValue={search}
            placeholder="Search name, email, company, ref…"
            className="w-full rounded-xl border border-line/10 bg-line/[0.035] py-2.5 pl-10 pr-3 text-[13.5px] text-ivory outline-none placeholder:text-fog focus:border-ember-400/50"
          />
        </form>
      </div>

      <div className="glass edge-light overflow-hidden rounded-3xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-line/[0.07] font-mono text-[10.5px] uppercase tracking-[0.16em] text-fog">
                <th className="px-5 py-3.5 font-normal">Client</th>
                <th className="px-3 py-3.5 font-normal">Services</th>
                <th className="px-3 py-3.5 font-normal">Budget</th>
                <th className="px-3 py-3.5 text-right font-normal">Est. value</th>
                <th className="px-3 py-3.5 font-normal">Fit</th>
                <th className="px-3 py-3.5 font-normal">Status</th>
                <th className="px-5 py-3.5 text-right font-normal">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/[0.05]">
              {result.items.map((lead) => (
                <tr key={lead.id} className="group relative transition-colors hover:bg-line/[0.03]">
                  <td className="px-5 py-3.5">
                    <Link href={`/admin/leads/${lead.id}`} className="block after:absolute after:inset-0">
                      <span className="block font-medium text-ivory">{lead.contact.company ?? lead.contact.name}</span>
                      <span className="block text-[12px] text-fog">
                        {lead.contact.name} · <span className="font-mono">{lead.reference}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="max-w-[240px] px-3 py-3.5 text-mist">
                    <span className="line-clamp-2">{lead.project.services.map((s) => SERVICE_MAP[s]?.name ?? s).join(" · ")}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-mist">{BUDGET_MAP[lead.plan.budget]?.label ?? "—"}</td>
                  <td className="px-3 py-3.5 text-right font-mono text-ivory">{lead.estimatedValue ? formatMoney(lead.estimatedValue, CURRENCY) : "—"}</td>
                  <td className="px-3 py-3.5">
                    <FitBar score={lead.fitScore} />
                  </td>
                  <td className="px-3 py-3.5">
                    <LeadStatusPill status={lead.status} />
                    {lead.analysisError ? <span className="ml-2 text-[11px] text-danger">failed</span> : null}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-right text-[12.5px] text-fog">{formatRelative(lead.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {result.items.length === 0 ? <p className="px-5 py-14 text-center text-[14px] text-fog">No leads match this view.</p> : null}
        {pages > 1 ? (
          <div className="flex items-center justify-between border-t border-line/[0.07] px-5 py-3 text-[13px] text-mist">
            <span>
              Page {page} of {pages}
            </span>
            <span className="flex gap-2">
              {page > 1 ? <Link className="hover:text-ivory" href={href({ page: page - 1 })}>← Previous</Link> : null}
              {page < pages ? <Link className="hover:text-ivory" href={href({ page: page + 1 })}>Next →</Link> : null}
            </span>
          </div>
        ) : null}
      </div>
    </>
  );
}
