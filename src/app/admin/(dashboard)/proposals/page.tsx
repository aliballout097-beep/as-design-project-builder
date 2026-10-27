import Link from "next/link";
import { getRepository } from "@/lib/db";
import { formatDate, formatMoney, formatRelative, formatWeeks } from "@/lib/format";
import { PROPOSAL_STATUSES, type ProposalStatus } from "@/lib/types";
import { PageHeader } from "@/components/admin/PageHeader";
import { ProposalStatusPill } from "@/components/admin/StatusPill";
import { cn } from "@/components/ui/cn";

export const metadata = { title: "Proposals" };

export default async function ProposalsPage({ searchParams }: PageProps<"/admin/proposals">) {
  const params = await searchParams;
  const status = typeof params.status === "string" && (PROPOSAL_STATUSES as readonly string[]).includes(params.status) ? (params.status as ProposalStatus) : null;
  const repo = getRepository();
  const { items, total } = await repo.listProposals({ status: status ? [status] : ["draft", "approved", "sent", "accepted", "declined"], limit: 100 });
  const leads = await Promise.all([...new Set(items.map((p) => p.leadId))].map((id) => repo.getLead(id)));
  const leadById = new Map(leads.filter(Boolean).map((l) => [l!.id, l!]));

  return (
    <>
      <PageHeader eyebrow="Proposals" title="Proposal tracker" description={`${total} proposals${status ? ` · ${status}` : " (excluding superseded)"}`} />
      <nav className="mb-5 flex flex-wrap gap-1 rounded-2xl border border-line/[0.08] bg-line/[0.02] p-1 text-[13px] sm:inline-flex">
        <Link href="/admin/proposals" className={cn("rounded-xl px-3 py-1.5", !status ? "bg-line/10 text-ivory" : "text-mist hover:text-ivory")}>
          Active
        </Link>
        {PROPOSAL_STATUSES.map((s) => (
          <Link key={s} href={`/admin/proposals?status=${s}`} className={cn("rounded-xl px-3 py-1.5 capitalize", status === s ? "bg-line/10 text-ivory" : "text-mist hover:text-ivory")}>
            {s}
          </Link>
        ))}
      </nav>
      <div className="glass edge-light overflow-hidden rounded-3xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-line/[0.07] font-mono text-[10.5px] uppercase tracking-[0.16em] text-fog">
                <th className="px-5 py-3.5 font-normal">Proposal</th>
                <th className="px-3 py-3.5 font-normal">Status</th>
                <th className="px-3 py-3.5 text-right font-normal">Total</th>
                <th className="px-3 py-3.5 font-normal">Timeline</th>
                <th className="px-3 py-3.5 font-normal">Client activity</th>
                <th className="px-5 py-3.5 text-right font-normal">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/[0.05]">
              {items.map((proposal) => {
                const lead = leadById.get(proposal.leadId);
                return (
                  <tr key={proposal.id} className="relative transition-colors hover:bg-line/[0.03]">
                    <td className="px-5 py-3.5">
                      <Link href={`/admin/leads/${proposal.leadId}`} className="block after:absolute after:inset-0">
                        <span className="block max-w-md truncate font-medium text-ivory">{proposal.title}</span>
                        <span className="block text-[12px] text-fog">
                          {lead?.contact.company ?? lead?.contact.name} · <span className="font-mono">{lead?.reference}</span> · v{proposal.version}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3.5"><ProposalStatusPill status={proposal.status} /></td>
                    <td className="px-3 py-3.5 text-right font-mono text-ivory">
                      {formatMoney(proposal.totals.total, proposal.currency)}
                      {proposal.totals.monthlyTotal ? <span className="block text-[11px] text-fog">+{formatMoney(proposal.totals.monthlyTotal, proposal.currency)}/mo</span> : null}
                    </td>
                    <td className="px-3 py-3.5 text-mist">{formatWeeks(proposal.totals.totalWeeks)}</td>
                    <td className="px-3 py-3.5 text-[12.5px] text-mist">
                      {proposal.clientResponse
                        ? `${proposal.clientResponse.decision} ${formatDate(proposal.clientResponse.at)}`
                        : proposal.viewedAt
                          ? `Viewed ${formatRelative(proposal.viewedAt)}`
                          : proposal.sentAt
                            ? `Sent ${formatRelative(proposal.sentAt)}`
                            : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-right text-[12.5px] text-fog">{formatRelative(proposal.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {items.length === 0 ? <p className="px-5 py-14 text-center text-[14px] text-fog">No proposals in this view.</p> : null}
      </div>
    </>
  );
}
