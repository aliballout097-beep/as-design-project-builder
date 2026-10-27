"use client";

import { Eye, FileDown, Plus, Send, Trash2, CopyPlus, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SERVICES } from "@/config/catalog";
import { formatDateTime, formatMoney, formatWeeks } from "@/lib/format";
import { computeTotals } from "@/lib/proposals";
import type { Proposal, ProposalLineItem, ProposalPhase } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/components/ui/cn";
import { ProposalStatusPill } from "./StatusPill";

type Editable = Pick<
  Proposal,
  "title" | "executiveSummary" | "approach" | "lineItems" | "phases" | "discount" | "taxRate" | "paymentSchedule" | "assumptions" | "nextSteps" | "notes" | "validUntil" | "currency"
>;

const pick = (p: Proposal): Editable => ({
  title: p.title,
  executiveSummary: p.executiveSummary,
  approach: p.approach,
  lineItems: p.lineItems,
  phases: p.phases,
  discount: p.discount,
  taxRate: p.taxRate,
  paymentSchedule: p.paymentSchedule,
  assumptions: p.assumptions,
  nextSteps: p.nextSteps,
  notes: p.notes,
  validUntil: p.validUntil,
  currency: p.currency,
});

const field =
  "w-full rounded-lg border border-line/10 bg-line/[0.03] px-3 py-2 text-[13.5px] text-ivory outline-none transition placeholder:text-fog focus:border-ember-400/50 focus:bg-line/[0.05] disabled:opacity-60";

const tempId = () => `new_${Math.random().toString(36).slice(2, 10)}`;

async function api(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  return body;
}

export function ProposalEditor({
  proposal,
  clientEmail,
  dispatchConfigured,
  emailByApp = false,
}: {
  proposal: Proposal;
  clientEmail: string;
  dispatchConfigured: boolean;
  emailByApp?: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Editable>(() => pick(proposal));
  const [baseline, setBaseline] = useState(() => JSON.stringify(pick(proposal)));
  const [busy, setBusy] = useState<null | "save" | "approve" | "sent" | "revise">(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Re-sync when the server sends a newer version of the same proposal (live updates).
  const serverSnapshot = JSON.stringify(pick(proposal));
  const [seenSnapshot, setSeenSnapshot] = useState(serverSnapshot);
  if (serverSnapshot !== seenSnapshot) {
    setSeenSnapshot(serverSnapshot);
    if (JSON.stringify(draft) === baseline) {
      setDraft(pick(proposal));
      setBaseline(serverSnapshot);
    }
  }

  const editable = proposal.status === "draft" || proposal.status === "approved";
  const dirty = JSON.stringify(draft) !== baseline;
  const totals = useMemo(() => computeTotals({ ...draft }), [draft]);
  const money = (value: number) => formatMoney(value, draft.currency);
  const scheduleTotal = draft.paymentSchedule.reduce((s, m) => s + m.percent, 0);
  const set = (patch: Partial<Editable>) => setDraft((d) => ({ ...d, ...patch }));
  const setItem = (id: string, patch: Partial<ProposalLineItem>) =>
    set({ lineItems: draft.lineItems.map((item) => (item.id === id ? { ...item, ...patch } : item)) });
  const setPhase = (id: string, patch: Partial<ProposalPhase>) => {
    const previous = draft.phases.find((p) => p.id === id);
    const phases = draft.phases.map((p) => (p.id === id ? { ...p, ...patch } : p));
    // Renaming a phase carries its line items along.
    const lineItems =
      patch.name && previous && previous.name !== patch.name
        ? draft.lineItems.map((item) => (item.phase === previous.name ? { ...item, phase: patch.name! } : item))
        : draft.lineItems;
    set({ phases, lineItems });
  };

  const save = async (silent = false) => {
    setBusy("save");
    try {
      const payload = {
        ...draft,
        lineItems: draft.lineItems.map((item) => ({ ...item, id: item.id.startsWith("new_") ? undefined : item.id })),
        phases: draft.phases.map((phase) => ({ ...phase, id: phase.id.startsWith("new_") ? undefined : phase.id })),
      };
      await api(`/api/v1/proposals/${proposal.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      setBaseline(JSON.stringify(draft));
      if (!silent) toast.success("Proposal saved");
      router.refresh();
      return true;
    } catch (error) {
      toast.error((error as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const approve = async () => {
    if (dirty && !(await save(true))) return;
    setBusy("approve");
    try {
      const result = await api(`/api/v1/proposals/${proposal.id}/approve`, { method: "POST", body: "{}" });
      if (result.email?.queued) toast.success(`Approved — emailing the PDF to ${clientEmail} now. It shows as "sent" once delivered.`);
      else if (result.dispatch?.delivered) toast.success(`Approved — n8n is emailing the proposal to ${clientEmail}`);
      else if (result.dispatch?.configured) toast.warning(`Approved, but the n8n dispatch failed: ${result.dispatch.error ?? "unknown error"}`);
      else toast.success("Approved. n8n dispatch isn't configured — share the link or PDF manually, then mark as sent.");
      setConfirmOpen(false);
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const action = async (kind: "sent" | "revise") => {
    setBusy(kind);
    try {
      if (kind === "sent") {
        await api(`/api/v1/proposals/${proposal.id}/mark-sent`, { method: "POST", body: "{}" });
        toast.success("Marked as sent");
      } else {
        await api(`/api/v1/proposals/${proposal.id}/revise`, { method: "POST", body: "{}" });
        toast.success("New draft version created");
      }
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="glass edge-light rounded-3xl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line/[0.07] px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-[22px] tracking-tight text-ivory">Proposal v{proposal.version}</h2>
          <ProposalStatusPill status={proposal.status} />
          {dirty ? <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-warning">Unsaved</span> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/p/${proposal.shareToken}`} target="_blank" rel="noreferrer">
            <Button size="sm" variant="ghost">
              <Eye className="size-3.5" /> Client view
            </Button>
          </a>
          <a href={`/api/v1/proposals/${proposal.id}/pdf`} target="_blank" rel="noreferrer">
            <Button size="sm" variant="ghost">
              <FileDown className="size-3.5" /> PDF
            </Button>
          </a>
          {editable ? (
            <Button size="sm" variant="secondary" disabled={!dirty} loading={busy === "save"} onClick={() => save()}>
              Save
            </Button>
          ) : null}
          {proposal.status === "draft" ? (
            <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={scheduleTotal !== 100}>
              <Send className="size-3.5" /> Approve & send
            </Button>
          ) : null}
          {proposal.status === "approved" ? (
            <>
              <Button size="sm" variant="outline" loading={busy === "approve"} onClick={approve}>
                <Send className="size-3.5" /> Re-send
              </Button>
              <Button size="sm" variant="outline" loading={busy === "sent"} onClick={() => action("sent")}>
                <CheckCheck className="size-3.5" /> Mark as sent
              </Button>
            </>
          ) : null}
          {["sent", "accepted", "declined"].includes(proposal.status) ? (
            <Button size="sm" variant="outline" loading={busy === "revise"} onClick={() => action("revise")}>
              <CopyPlus className="size-3.5" /> Revise as new version
            </Button>
          ) : null}
        </div>
      </header>

      <div className="space-y-6 p-5 sm:p-6">
        {proposal.clientResponse ? (
          <div className={cn("rounded-2xl border px-4 py-3 text-[13.5px]", proposal.clientResponse.decision === "accepted" ? "border-success/25 bg-success/[0.07] text-success" : "border-danger/25 bg-danger/[0.07] text-danger")}>
            {proposal.clientResponse.decision === "accepted" ? "Accepted" : "Declined"} by {proposal.clientResponse.name} · {formatDateTime(proposal.clientResponse.at)}
            {proposal.clientResponse.note ? <p className="mt-1 text-ivory/80">“{proposal.clientResponse.note}”</p> : null}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_200px]">
          <label className="block">
            <span className="mb-1.5 block text-[12px] text-fog">Title</span>
            <input className={cn(field, "font-display text-[17px]")} disabled={!editable} value={draft.title} onChange={(e) => set({ title: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] text-fog">Valid until</span>
            <input type="date" className={field} disabled={!editable} value={draft.validUntil} onChange={(e) => set({ validUntil: e.target.value })} />
          </label>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12px] text-fog">Executive summary (client-facing)</span>
            <textarea rows={7} className={cn(field, "leading-relaxed")} disabled={!editable} value={draft.executiveSummary} onChange={(e) => set({ executiveSummary: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] text-fog">Approach</span>
            <textarea rows={7} className={cn(field, "leading-relaxed")} disabled={!editable} value={draft.approach} onChange={(e) => set({ approach: e.target.value })} />
          </label>
        </div>

        {/* Phases */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[12px] font-medium uppercase tracking-[0.14em] text-mist">Timeline · {formatWeeks(totals.totalWeeks)}</h3>
            {editable ? (
              <button className="inline-flex items-center gap-1 text-[12.5px] text-ember-300 hover:text-ember-200" onClick={() => set({ phases: [...draft.phases, { id: tempId(), name: `Phase ${draft.phases.length + 1}`, weeks: 1, summary: "", milestones: [] }] })}>
                <Plus className="size-3.5" /> Phase
              </button>
            ) : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {draft.phases.map((phase) => (
              <div key={phase.id} className="flex gap-2 rounded-xl border border-line/[0.07] bg-line/[0.015] p-2">
                <input className={field} aria-label="Phase name" disabled={!editable} value={phase.name} onChange={(e) => setPhase(phase.id, { name: e.target.value })} />
                <input className={cn(field, "w-20 text-right")} aria-label="Weeks" type="number" min={0.5} step={0.5} disabled={!editable} value={phase.weeks} onChange={(e) => setPhase(phase.id, { weeks: Number(e.target.value) || 0.5 })} />
                {editable && draft.phases.length > 1 ? (
                  <button aria-label="Remove phase" className="px-1.5 text-fog hover:text-danger" onClick={() => set({ phases: draft.phases.filter((p) => p.id !== phase.id) })}>
                    <Trash2 className="size-3.5" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {/* Line items */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[12px] font-medium uppercase tracking-[0.14em] text-mist">Deliverables & pricing</h3>
            {editable ? (
              <button
                className="inline-flex items-center gap-1 text-[12.5px] text-ember-300 hover:text-ember-200"
                onClick={() =>
                  set({
                    lineItems: [
                      ...draft.lineItems,
                      { id: tempId(), title: "New deliverable", description: "", serviceKey: "other", phase: draft.phases[0]?.name ?? "", price: 0, billing: "one_time", optional: false, included: true },
                    ],
                  })
                }
              >
                <Plus className="size-3.5" /> Line item
              </button>
            ) : null}
          </div>
          <div className="overflow-x-auto rounded-2xl border border-line/[0.07]">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead>
                <tr className="border-b border-line/[0.07] text-left font-mono text-[10px] uppercase tracking-[0.14em] text-fog">
                  <th className="w-10 px-3 py-2.5 font-normal" title="Included in total">Incl.</th>
                  <th className="px-2 py-2.5 font-normal">Deliverable</th>
                  <th className="w-40 px-2 py-2.5 font-normal">Phase</th>
                  <th className="w-28 px-2 py-2.5 font-normal">Billing</th>
                  <th className="w-32 px-2 py-2.5 text-right font-normal">Price</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/[0.05]">
                {draft.lineItems.map((item) => (
                  <tr key={item.id} className={cn("align-top", !item.included && "opacity-60")}>
                    <td className="px-3 py-2.5">
                      <input type="checkbox" aria-label="Included" className="mt-2 size-4 accent-[var(--color-ember-500)]" disabled={!editable} checked={item.included} onChange={(e) => setItem(item.id, { included: e.target.checked })} />
                    </td>
                    <td className="px-2 py-2">
                      <input className={field} aria-label="Title" disabled={!editable} value={item.title} onChange={(e) => setItem(item.id, { title: e.target.value })} />
                      <textarea rows={1} className={cn(field, "mt-1.5 text-[12.5px] text-mist")} aria-label="Description" disabled={!editable} value={item.description} onChange={(e) => setItem(item.id, { description: e.target.value })} />
                      <select className={cn(field, "mt-1.5 py-1 text-[12px] text-fog")} aria-label="Service" disabled={!editable} value={item.serviceKey} onChange={(e) => setItem(item.id, { serviceKey: e.target.value })}>
                        {SERVICES.map((s) => (
                          <option key={s.key} value={s.key} className="bg-ink-900">
                            {s.name}
                          </option>
                        ))}
                        <option value="other" className="bg-ink-900">
                          Other
                        </option>
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <select className={field} aria-label="Phase" disabled={!editable} value={item.phase} onChange={(e) => setItem(item.id, { phase: e.target.value })}>
                        {draft.phases.map((p) => (
                          <option key={p.id} value={p.name} className="bg-ink-900">
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <select className={field} aria-label="Billing" disabled={!editable} value={item.billing} onChange={(e) => setItem(item.id, { billing: e.target.value as ProposalLineItem["billing"] })}>
                        <option value="one_time" className="bg-ink-900">
                          One-time
                        </option>
                        <option value="monthly" className="bg-ink-900">
                          Monthly
                        </option>
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input className={cn(field, "text-right font-mono")} aria-label="Price" type="number" min={0} step={50} disabled={!editable} value={item.price} onChange={(e) => setItem(item.id, { price: Math.max(0, Number(e.target.value) || 0) })} />
                      {item.optional ? <p className="mt-1 text-right font-mono text-[10px] uppercase tracking-wider text-glacier-300">Upsell</p> : null}
                    </td>
                    <td className="py-2 pr-2">
                      {editable ? (
                        <button aria-label="Remove line item" className="mt-2 text-fog hover:text-danger" onClick={() => set({ lineItems: draft.lineItems.filter((i) => i.id !== item.id) })}>
                          <Trash2 className="size-3.5" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Commercials */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-line/[0.07] p-4">
              <h3 className="mb-3 text-[12px] font-medium uppercase tracking-[0.14em] text-mist">Discount & tax</h3>
              <div className="flex gap-2">
                <select
                  className={cn(field, "w-28")}
                  aria-label="Discount type"
                  disabled={!editable}
                  value={draft.discount?.type ?? "none"}
                  onChange={(e) => set({ discount: e.target.value === "none" ? null : { type: e.target.value as "percent" | "amount", value: draft.discount?.value ?? 0, label: draft.discount?.label ?? null } })}
                >
                  <option value="none" className="bg-ink-900">No discount</option>
                  <option value="percent" className="bg-ink-900">Percent</option>
                  <option value="amount" className="bg-ink-900">Amount</option>
                </select>
                {draft.discount ? (
                  <input className={cn(field, "text-right font-mono")} type="number" min={0} aria-label="Discount value" disabled={!editable} value={draft.discount.value} onChange={(e) => set({ discount: { ...draft.discount!, value: Math.max(0, Number(e.target.value) || 0) } })} />
                ) : null}
              </div>
              {draft.discount ? (
                <input className={cn(field, "mt-2")} placeholder="Label, e.g. Launch partner discount" disabled={!editable} value={draft.discount.label ?? ""} onChange={(e) => set({ discount: { ...draft.discount!, label: e.target.value || null } })} />
              ) : null}
              <label className="mt-3 flex items-center justify-between gap-3 text-[13px] text-mist">
                Tax / VAT %
                <input className={cn(field, "w-24 text-right font-mono")} type="number" min={0} max={50} step={0.5} disabled={!editable} value={draft.taxRate} onChange={(e) => set({ taxRate: Math.max(0, Number(e.target.value) || 0) })} />
              </label>
            </div>
            <div className="rounded-2xl border border-line/[0.07] p-4">
              <h3 className="mb-3 flex justify-between text-[12px] font-medium uppercase tracking-[0.14em] text-mist">
                Payment schedule <span className={cn("font-mono", scheduleTotal === 100 ? "text-fog" : "text-danger")}>{scheduleTotal}%</span>
              </h3>
              <div className="space-y-2">
                {draft.paymentSchedule.map((milestone, index) => (
                  <div key={index} className="flex gap-2">
                    <input className={field} aria-label="Milestone" disabled={!editable} value={milestone.label} onChange={(e) => set({ paymentSchedule: draft.paymentSchedule.map((m, i) => (i === index ? { ...m, label: e.target.value } : m)) })} />
                    <input className={cn(field, "w-20 text-right font-mono")} type="number" min={0} max={100} aria-label="Percent" disabled={!editable} value={milestone.percent} onChange={(e) => set({ paymentSchedule: draft.paymentSchedule.map((m, i) => (i === index ? { ...m, percent: Number(e.target.value) || 0 } : m)) })} />
                  </div>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-[12px] text-fog">Assumptions (one per line)</span>
              <textarea rows={5} className={field} disabled={!editable} value={draft.assumptions.join("\n")} onChange={(e) => set({ assumptions: e.target.value.split("\n") })} onBlur={() => set({ assumptions: draft.assumptions.map((a) => a.trim()).filter(Boolean) })} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] text-fog">Next steps (one per line)</span>
              <textarea rows={5} className={field} disabled={!editable} value={draft.nextSteps.join("\n")} onChange={(e) => set({ nextSteps: e.target.value.split("\n") })} onBlur={() => set({ nextSteps: draft.nextSteps.map((a) => a.trim()).filter(Boolean) })} />
            </label>
          </div>

          <div className="rounded-2xl border border-line/[0.08] bg-gradient-to-br from-ember-500/[0.1] to-transparent p-5">
            <h3 className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-fog">Totals</h3>
            <dl className="mt-4 space-y-2 text-[13.5px]">
              <div className="flex justify-between"><dt className="text-mist">Subtotal</dt><dd className="font-mono text-ivory">{money(totals.oneTimeSubtotal)}</dd></div>
              {totals.discountAmount ? <div className="flex justify-between"><dt className="text-mist">Discount</dt><dd className="font-mono text-glacier-300">− {money(totals.discountAmount)}</dd></div> : null}
              {totals.taxAmount ? <div className="flex justify-between"><dt className="text-mist">Tax</dt><dd className="font-mono text-ivory">{money(totals.taxAmount)}</dd></div> : null}
              <div className="flex justify-between border-t border-line/10 pt-3"><dt className="text-ivory">Total</dt><dd className="font-display text-[26px] leading-none text-ivory">{money(totals.total)}</dd></div>
              {totals.monthlyTotal ? <div className="flex justify-between"><dt className="text-mist">Monthly</dt><dd className="font-mono text-ivory">{money(totals.monthlyTotal)}/mo</dd></div> : null}
              {totals.optionalTotal ? <div className="flex justify-between"><dt className="text-fog">Optional add-ons</dt><dd className="font-mono text-fog">{money(totals.optionalTotal)}</dd></div> : null}
              <div className="flex justify-between"><dt className="text-mist">Timeline</dt><dd className="text-ivory">{formatWeeks(totals.totalWeeks)}</dd></div>
            </dl>
            <p className="mt-4 text-[12px] leading-relaxed text-fog">
              {proposal.approvedAt ? `Approved ${formatDateTime(proposal.approvedAt)} by ${proposal.approvedBy?.replace("admin:", "")}. ` : ""}
              {proposal.sentAt ? `Sent ${formatDateTime(proposal.sentAt)}. ` : ""}
              {proposal.viewedAt ? `Last viewed ${formatDateTime(proposal.viewedAt)}.` : ""}
            </p>
          </div>
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Approve & send this proposal?"
        description={
          emailByApp ? (
            <>
              The PDF and a private link will be emailed to <span className="text-ivory">{clientEmail}</span> from the studio inbox, with a copy to the team.
            </>
          ) : dispatchConfigured ? (
            <>
              The n8n dispatch workflow will email the PDF and a private link to <span className="text-ivory">{clientEmail}</span>, alert the team and sync the CRM.
            </>
          ) : (
            <>n8n dispatch isn&apos;t configured, so nothing will be emailed automatically. The client link and PDF become available to share manually.</>
          )
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button loading={busy === "approve" || busy === "save"} onClick={approve}>
              <Send className="size-4" /> Approve {money(totals.total)}
            </Button>
          </>
        }
      />
    </section>
  );
}
