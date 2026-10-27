"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CURRENCY, SERVICE_MAP, type ItemKey } from "@/config/catalog";
import { DELIVERY_PHASE_NAMES_AR, ITEM_NAMES_AR, SERVICE_NAMES_AR } from "@/config/catalog.ar";
import type { Estimate } from "@/lib/pricing/estimate";
import type { LeadScope } from "@/lib/pricing/scope";
import { formatMoney } from "@/lib/format";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { cn } from "@/components/ui/cn";
import type { BuilderDraft } from "./state";

const PHASE_COLORS = ["bg-ember-400", "bg-[#e8862e]", "bg-navy-400", "bg-sky-400"];

const money = (value: number) => formatMoney(value, CURRENCY);

function PhaseBar({ estimate }: { estimate: Estimate }) {
  const total = estimate.phases.reduce((s, p) => s + p.weeks, 0) || 1;
  return (
    <div>
      <div className="flex h-2 gap-1 overflow-hidden rounded-full">
        {estimate.phases.map((phase, index) => (
          <motion.span
            key={phase.key}
            layout
            className={cn("h-full rounded-full", PHASE_COLORS[index % PHASE_COLORS.length])}
            style={{ width: `${(phase.weeks / total) * 100}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 30 }}
          />
        ))}
      </div>
      <div className="mt-2.5 grid grid-cols-4 gap-1">
        {estimate.phases.map((phase, index) => (
          <span key={phase.key} className="flex items-center gap-1.5 text-[10.5px] leading-tight text-fog">
            <span className={cn("size-1.5 shrink-0 rounded-full", PHASE_COLORS[index % PHASE_COLORS.length])} />
            <span className="truncate">{(DELIVERY_PHASE_NAMES_AR[phase.key] ?? phase.name).split(" ")[0]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function BlueprintBody({ draft, estimate, added }: { draft: BuilderDraft; estimate: Estimate; added?: LeadScope["added"] }) {
  const hasServices = draft.project.services.length > 0;
  const items = (Object.entries(draft.project.items) as [ItemKey, number][]).filter(([, qty]) => qty > 0);
  const fromBrief = added ? [...added.services.map((key) => SERVICE_NAMES_AR[key] ?? key), ...added.items.map((key) => ITEM_NAMES_AR[key] ?? key)] : [];
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[12px] font-semibold text-fog">المشروع</p>
        <p className="mt-1 truncate font-display text-[21px] font-bold leading-tight text-ivory">
          {draft.project.name || draft.contact.company || "مشروع بلا عنوان"}
        </p>
        <div className="mt-3 flex min-h-7 flex-wrap gap-1.5">
          <AnimatePresence initial={false}>
            {draft.project.services.map((key) => (
              <motion.span
                key={key}
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="rounded-full border border-line/10 bg-sky-100 px-2.5 py-1 text-[12px] font-semibold text-navy-600"
              >
                {SERVICE_NAMES_AR[key] ?? SERVICE_MAP[key]?.name ?? key}
              </motion.span>
            ))}
          </AnimatePresence>
          {!hasServices ? <span className="text-[13px] text-fog">اختر الخدمات لبدء المخطط.</span> : null}
        </div>
        {items.length ? (
          <ul className="mt-2.5 space-y-1 text-[12.5px] text-mist">
            {items.map(([key, qty]) => (
              <li key={key} className="flex justify-between gap-3">
                <span className="truncate">{ITEM_NAMES_AR[key]}</span>
                <span className="shrink-0 font-semibold text-ivory" dir="ltr">
                  × {qty}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {fromBrief.length ? (
          <p className="mt-2.5 rounded-xl bg-ember-400/[0.08] px-3 py-2 text-[12px] leading-relaxed text-ember-300">
            ✨ أضفنا من وصفك: {[...new Set(fromBrief)].join("، ")}
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-line/[0.08] bg-gradient-to-br from-sky-100 to-white p-4">
        <p className="text-[12px] font-semibold text-fog">السعر التقديري</p>
        <p className="mt-2 text-[30px] font-bold leading-none text-ivory" dir="ltr">
          {hasServices ? (
            <>
              <AnimatedNumber value={estimate.min} format={money} />
              {estimate.max > estimate.min ? (
                <>
                  <span className="mx-1.5 text-fog">–</span>
                  <AnimatedNumber value={estimate.max} format={money} />
                </>
              ) : null}
            </>
          ) : (
            <span className="text-fog">—</span>
          )}
        </p>
        {hasServices && estimate.listMin && estimate.listMin > estimate.min ? (
          <p className="mt-2 text-[12.5px] font-semibold text-success">
            🔥 وفّرت <bdi dir="ltr">{money(estimate.listMin - estimate.min)}</bdi> مع العرض الحالي{" "}
            <span className="ms-1 font-normal text-fog line-through" dir="ltr">
              {money(estimate.listMin)}
            </span>
          </p>
        ) : null}
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <p className="text-[12px] font-semibold text-fog">مدة التنفيذ</p>
          <p className="text-[16px] font-bold text-ivory">
            {hasServices ? (estimate.weeksMin === 1 && estimate.weeksMax === 2 ? "أسبوع إلى أسبوعين" : `${estimate.weeksMin}–${estimate.weeksMax} أسابيع`) : "—"}
          </p>
        </div>
        <div className="mt-3">
          <PhaseBar estimate={estimate} />
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          ["الخدمات", new Set([...draft.project.services, ...(added?.services ?? [])]).size],
          ["القدرات", draft.project.features.length],
          ["اللغات", draft.project.languages.length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-line/[0.06] bg-line/[0.02] px-2 py-2.5">
            <dd className="text-[19px] font-bold text-ivory">{value}</dd>
            <dt className="text-[11px] text-fog">{label}</dt>
          </div>
        ))}
      </dl>

      <p className="text-[11.5px] leading-relaxed text-fog">
        السعر محسوب من باقاتنا وأسعارنا المعتمدة. العرض المفصّل مع كل الخطط يصلك بصيغة PDF خلال دقائق من الإرسال.
      </p>
    </div>
  );
}

export function Blueprint({ draft, estimate, added, className }: { draft: BuilderDraft; estimate: Estimate; added?: LeadScope["added"]; className?: string }) {
  return (
    <aside className={cn("glass edge-light rounded-3xl p-6", className)} aria-label="مخطط المشروع المباشر">
      <div className="mb-6 flex items-center justify-between">
        <span className="flex items-center gap-2 text-[13px] font-bold text-ember-300">
          <span className="size-1.5 animate-pulse-soft rounded-full bg-ember-400" />
          ملخص مباشر
        </span>
        <span className="rounded-full border border-line/10 px-2 py-0.5 text-[11px] text-fog">يتحدّث تلقائياً</span>
      </div>
      <BlueprintBody draft={draft} estimate={estimate} added={added} />
    </aside>
  );
}

