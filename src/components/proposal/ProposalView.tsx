import { CalendarRange, Clock3, Download, Layers3, Wallet } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { formatDateAr as formatDate, formatWeeksAr as formatWeeks } from "@/lib/format.ar";
import { paymentBreakdown, phaseOffsets } from "@/lib/proposals";
import type { Lead, Proposal } from "@/lib/types";
import { cn } from "@/components/ui/cn";

/**
 * Presentational proposal document for the web (client portal & admin preview).
 * Mirrors the PDF structure so the client sees the same thing everywhere.
 */

const PHASE_COLORS = ["from-ember-400 to-ember-500", "from-[#e8862e] to-ember-400", "from-navy-300 to-navy-400", "from-sky-400 to-navy-300"];

/**
 * The client sees the Arabic translation (cached on the proposal when the PDF is
 * generated — see src/lib/ai/translate.ts) wherever one exists; English AI text
 * is rendered with dir="auto" so it reads left-to-right inside the RTL page.
 */
export function arabicText(proposal: Proposal) {
  const ar = proposal.translations?.ar ?? null;
  const pick = (value: string | null | undefined, fallback: string) => (value && value.trim() ? value : fallback);
  return {
    title: pick(ar?.title, proposal.title),
    executiveSummary: pick(ar?.executiveSummary, proposal.executiveSummary),
    approach: pick(ar?.approach, proposal.approach),
    phase: (index: number) => ({
      name: pick(ar?.phases[index]?.name, proposal.phases[index]?.name ?? ""),
      summary: pick(ar?.phases[index]?.summary, proposal.phases[index]?.summary ?? ""),
    }),
    item: (id: string) => {
      const index = proposal.lineItems.findIndex((item) => item.id === id);
      const item = proposal.lineItems[index];
      return { title: pick(ar?.lineItems[index]?.title, item?.title ?? ""), description: pick(ar?.lineItems[index]?.description, item?.description ?? "") };
    },
    nextSteps: proposal.nextSteps.map((step, index) => pick(ar?.nextSteps[index], step)),
    notes: proposal.notes ? pick(ar?.notes, proposal.notes) : null,
  };
}

function Paragraphs({ text }: { text: string }) {
  return (
    <div className="space-y-4">
      {text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((paragraph, index) => (
          <p key={index} dir="auto" className="text-start text-[16px] leading-[1.75] text-ivory/85">
            {paragraph}
          </p>
        ))}
    </div>
  );
}

function SectionHeading({ index, label, title }: { index: number; label: string; title: string }) {
  return (
    <header className="mb-6">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.28em] text-ember-300">
        {String(index).padStart(2, "0")} — {label}
      </p>
      <h2 className="mt-2 font-display text-[28px] leading-tight tracking-tight text-ivory sm:text-[34px]">{title}</h2>
    </header>
  );
}

export function ProposalSummaryCard({ proposal, pdfHref }: { proposal: Proposal; pdfHref: string }) {
  const money = (value: number) => formatMoney(value, proposal.currency);
  return (
    <div className="glass edge-light rounded-3xl p-6">
      <p className="text-[12.5px] font-semibold text-fog">
        {proposal.plans?.length ? `الخطة الموصى بها · ${proposal.plans.find((p) => p.recommended)?.nameAr ?? ""}` : "إجمالي الاستثمار"}
      </p>
      <p className="mt-2 font-display text-[40px] font-bold leading-none text-ivory" dir="ltr">{money(proposal.totals.total)}</p>
      {proposal.totals.monthlyTotal > 0 ? (
        <p className="mt-2 text-[13.5px] text-mist">+ {money(proposal.totals.monthlyTotal)}/شهرياً بشكل مستمر</p>
      ) : null}
      <dl className="mt-6 space-y-3 border-t border-line/[0.07] pt-5 text-[14px]">
        <div className="flex items-center justify-between gap-4">
          <dt className="flex items-center gap-2 text-fog">
            <Clock3 className="size-4" /> الجدول الزمني
          </dt>
          <dd className="text-ivory">{formatWeeks(proposal.totals.totalWeeks)}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="flex items-center gap-2 text-fog">
            <Layers3 className="size-4" /> المراحل
          </dt>
          <dd className="text-ivory">{proposal.phases.length}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="flex items-center gap-2 text-fog">
            <CalendarRange className="size-4" /> صالح حتى
          </dt>
          <dd className="text-ivory">{formatDate(proposal.validUntil)}</dd>
        </div>
      </dl>
      <a
        href={pdfHref}
        className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-line/12 bg-white px-4 py-3 text-[14px] font-semibold text-ivory transition hover:border-line/25"
      >
        <Download className="size-4" /> تحميل PDF
      </a>
    </div>
  );
}

export function ProposalView({ proposal, lead }: { proposal: Proposal; lead: Lead }) {
  const money = (value: number) => formatMoney(value, proposal.currency);
  const t = arabicText(proposal);
  const included = proposal.lineItems.filter((item) => item.included);
  const optional = proposal.lineItems.filter((item) => !item.included);
  const totalWeeks = Math.max(proposal.totals.totalWeeks, 0.5);
  const schedule = paymentBreakdown(proposal.totals.total, proposal.paymentSchedule);
  const gantt = phaseOffsets(proposal.phases);
  const sections = { next: 0 };
  const nextSection = () => ++sections.next;

  return (
    <div className="space-y-6">
      <section className="glass edge-light rounded-[28px] p-6 sm:p-10">
        <SectionHeading index={nextSection()} label="الملخص التنفيذي" title={`مرحباً ${lead.contact.company ?? lead.contact.name.split(" ")[0]}،`} />
        <Paragraphs text={t.executiveSummary} />
        {proposal.approach ? (
          <div className="mt-8 rounded-2xl border border-line/[0.07] bg-line/[0.02] p-5 sm:p-6">
            <p className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.24em] text-fog">منهجيتنا</p>
            <Paragraphs text={t.approach} />
          </div>
        ) : null}
      </section>

      <section className="glass edge-light rounded-[28px] p-6 sm:p-10">
        <SectionHeading index={nextSection()} label="النطاق" title="ما الذي سنقدّمه" />
        <div className="space-y-8">
          {proposal.phases.map((phase, index) => {
            const items = included.filter((item) => item.phase === phase.name);
            if (!items.length) return null;
            return (
              <div key={phase.id}>
                <div className="flex items-baseline justify-between gap-4 border-b border-line/15 pb-3">
                  <h3 className="flex items-center gap-3 font-display text-[20px] font-bold text-ivory">
                    <span className={cn("size-2.5 shrink-0 rounded-full bg-gradient-to-br", PHASE_COLORS[index % PHASE_COLORS.length])} />
                    <bdi>{t.phase(index).name}</bdi>
                  </h3>
                  <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-fog">{formatWeeks(phase.weeks)}</span>
                </div>
                <ul className="divide-y divide-line/[0.06]">
                  {items.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-6 py-4">
                      <div className="min-w-0">
                        <p dir="auto" className="text-start text-[15.5px] font-semibold text-ivory">{t.item(item.id).title}</p>
                        {item.description ? <p dir="auto" className="mt-1 text-start text-[14px] leading-relaxed text-mist">{t.item(item.id).description}</p> : null}
                      </div>
                      <p className="shrink-0 font-mono text-[14px] font-semibold text-ivory" dir="ltr">
                        {money(item.price)}
                        {item.billing === "monthly" ? <span className="text-fog">/شهرياً</span> : null}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {optional.length ? (
            <div className="rounded-2xl border border-dashed border-line/15 p-5">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.24em] text-glacier-300">إضافات اختيارية · غير مشمولة في الإجمالي</p>
              <ul className="mt-3 divide-y divide-line/[0.06]">
                {optional.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-6 py-3.5">
                    <div className="min-w-0">
                      <p dir="auto" className="text-start text-[15px] text-ivory">{t.item(item.id).title}</p>
                      {item.description ? <p dir="auto" className="mt-1 text-start text-[13.5px] leading-relaxed text-mist">{t.item(item.id).description}</p> : null}
                    </div>
                    <p className="shrink-0 font-mono text-[13.5px] text-mist" dir="ltr">
                      {money(item.price)}
                      {item.billing === "monthly" ? "/شهرياً" : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      <section className="glass edge-light rounded-[28px] p-6 sm:p-10">
        <SectionHeading index={nextSection()} label="الجدول الزمني" title={`${formatWeeks(proposal.totals.totalWeeks)} من الانطلاق إلى الإطلاق`} />
        <div className="space-y-4">
          {gantt.map((phase, index) => (
            <div key={phase.id} className="grid items-center gap-2 sm:grid-cols-[180px_1fr_80px] sm:gap-4">
              <p className="text-[14px] text-ivory"><bdi>{t.phase(index).name}</bdi></p>
              <div className="relative h-3 rounded-full bg-sky-100">
                <div
                  className={cn("absolute inset-y-0 rounded-full bg-gradient-to-r shadow-[0_0_20px_-4px_rgb(210_102_10/0.35)]", PHASE_COLORS[index % PHASE_COLORS.length])}
                  style={{ insetInlineStart: `${(phase.start / totalWeeks) * 100}%`, width: `${Math.max((phase.weeks / totalWeeks) * 100, 3)}%` }}
                />
              </div>
              <p className="font-mono text-[12px] text-fog sm:text-right">{formatWeeks(phase.weeks)}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {proposal.phases.map((phase, index) => (
            <div key={phase.id} className="rounded-2xl border border-line/[0.07] bg-white/70 p-5">
              <p className="font-display text-[17px] font-bold text-ivory"><bdi>{t.phase(index).name}</bdi></p>
              {phase.summary ? <p dir="auto" className="mt-1.5 text-start text-[14px] leading-relaxed text-mist">{t.phase(index).summary}</p> : null}
              {phase.milestones.length ? (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {phase.milestones.map((milestone) => (
                    <li key={milestone} dir="auto" className="rounded-full border border-line/10 bg-white px-2.5 py-1 text-[12px] text-ivory/80">
                      {milestone}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="glass edge-light rounded-[28px] p-6 sm:p-10">
        <SectionHeading index={nextSection()} label="الاستثمار" title="استثمارك" />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-line/[0.08] bg-gradient-to-br from-sky-100 via-white to-ember-400/[0.06] p-6">
            <dl className="space-y-2.5 text-[14.5px]">
              <div className="flex justify-between">
                <dt className="text-mist">إجمالي المشروع الفرعي</dt>
                <dd className="font-mono text-ivory">{money(proposal.totals.oneTimeSubtotal)}</dd>
              </div>
              {proposal.totals.discountAmount > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-mist">{proposal.discount?.value && proposal.discount.type === "percent" ? `خصم ${proposal.discount.value}%` : "خصم"}</dt>
                  <dd className="font-mono font-semibold text-success" dir="ltr">− {money(proposal.totals.discountAmount)}</dd>
                </div>
              ) : null}
              {proposal.totals.taxAmount > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-mist">الضريبة ({proposal.taxRate}%)</dt>
                  <dd className="font-mono text-ivory">{money(proposal.totals.taxAmount)}</dd>
                </div>
              ) : null}
            </dl>
            <div className="mt-5 border-t border-line/10 pt-5">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.24em] text-fog">إجمالي استثمار المشروع</p>
              <p className="mt-2 font-display text-[44px] leading-none tracking-tight text-ivory">
                <Wallet className="me-3 inline size-7 -translate-y-1 text-ember-300" strokeWidth={1.5} />
                {money(proposal.totals.total)}
              </p>
              {proposal.totals.monthlyTotal > 0 ? (
                <p className="mt-3 text-[14px] text-mist">بالإضافة إلى {money(proposal.totals.monthlyTotal)} شهرياً للخدمات المستمرة.</p>
              ) : null}
            </div>
          </div>
          <div>
            <p className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.24em] text-fog">جدول الدفعات</p>
            <ol className="divide-y divide-line/[0.06] overflow-hidden rounded-2xl border border-line/[0.08]">
              {schedule.map((milestone, index) => (
                <li key={milestone.label} className="flex items-center gap-4 bg-line/[0.015] px-5 py-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line/10 font-mono text-[12px] text-mist">{index + 1}</span>
                  <span dir="auto" className="flex-1 text-start text-[14.5px] text-ivory">{milestone.label}</span>
                  <span className="font-mono text-[12.5px] text-fog">{milestone.percent}%</span>
                  <span className="w-24 text-right font-mono text-[14px] text-ivory">{money(milestone.amount)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {proposal.assumptions.length || proposal.nextSteps.length ? (
        <section className="glass edge-light grid gap-8 rounded-[28px] p-6 sm:p-10 lg:grid-cols-2">
          {proposal.assumptions.length ? (
            <div>
              <SectionHeading index={nextSection()} label="الافتراضات" title="ما يفترضه هذا العرض" />
              <ul className="space-y-3">
                {proposal.assumptions.map((assumption) => (
                  <li key={assumption} className="flex gap-3 text-[14.5px] leading-relaxed text-mist">
                    <span className="mt-2.5 h-px w-4 shrink-0 bg-ember-400" />
                    <span dir="auto" className="flex-1 text-start">{assumption}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {proposal.nextSteps.length ? (
            <div>
              <SectionHeading index={nextSection()} label="الخطوات التالية" title="لنبدأ العمل" />
              <ol className="space-y-3">
                {t.nextSteps.map((step, index) => (
                  <li key={step} className="flex gap-3 text-[14.5px] leading-relaxed text-ivory/85">
                    <span className="font-mono text-[12px] text-ember-300">0{index + 1}</span>
                    <span dir="auto" className="flex-1 text-start">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {proposal.notes ? (
            <div className="lg:col-span-2">
              <Paragraphs text={t.notes ?? proposal.notes} />
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
