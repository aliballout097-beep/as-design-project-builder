"use client";

import { Check, Clock3, Sparkles } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";
import { formatMoney } from "@/lib/format";
import type { ProposalPlan } from "@/lib/types";
import { cn } from "@/components/ui/cn";

/**
 * Plan selection on the proposal page: the cards at the top and the accept form
 * at the bottom share the chosen plan through this context.
 */

const PlanChoiceContext = createContext<{ selected: string | null; select: (key: string) => void }>({ selected: null, select: () => {} });

export function PlanChoiceProvider({ plans, initial, children }: { plans: ProposalPlan[] | null; initial?: string | null; children: ReactNode }) {
  const [selected, setSelected] = useState<string | null>(initial ?? plans?.find((p) => p.recommended)?.key ?? plans?.[0]?.key ?? null);
  return <PlanChoiceContext.Provider value={{ selected, select: setSelected }}>{children}</PlanChoiceContext.Provider>;
}

export function usePlanChoice() {
  return useContext(PlanChoiceContext);
}

const weeksLabel = (min: number, max: number) =>
  min === max ? (min === 1 ? "أسبوع واحد" : min === 2 ? "أسبوعين" : `${min} أسابيع`) : min === 1 && max === 2 ? "أسبوع إلى أسبوعين" : `${min}–${max} أسابيع`;

/** The heading follows the number of plans actually offered. */
function plansHeading(count: number) {
  if (count === 1) return { eyebrow: "عرضك جاهز", title: "عرض سعر مصمّم على طلبك", body: "كل ما طلبته بسعر نهائي واضح وما يشمله بالتفصيل. وافق عليه أونلاين بخطوة واحدة." };
  const title = count === 2 ? "خطتان مصمّمتان على طلبك" : "ثلاث خطط مصمّمة على طلبك";
  return { eyebrow: "اختر خطتك", title, body: "كل خطة بسعرها النهائي وما تشمله بالتفصيل. اختر الأنسب لك ووافق عليها أونلاين بخطوة واحدة." };
}

export function PlanCards({ plans, currency, locked }: { plans: ProposalPlan[]; currency: string; /** Accepted/declined: show the choice, no buttons. */ locked?: boolean }) {
  const { selected, select } = usePlanChoice();
  const money = (value: number) => formatMoney(value, currency);
  const heading = plansHeading(plans.length);
  const single = plans.length === 1;

  const choose = (key: string) => {
    select(key);
    document.getElementById("respond")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section id="plans" className="scroll-mt-6">
      <div className="mb-5 text-center sm:mb-7">
        <p className="text-[13px] font-bold text-ember-300">{heading.eyebrow}</p>
        <h2 className="mt-1.5 font-display text-[26px] font-bold leading-snug text-ivory sm:text-[34px]">{heading.title}</h2>
        <p className="mx-auto mt-2 max-w-xl text-[14.5px] leading-relaxed text-mist">{heading.body}</p>
      </div>
      <div className={cn("grid gap-4", plans.length === 1 ? "mx-auto max-w-md" : plans.length === 2 ? "mx-auto max-w-3xl sm:grid-cols-2" : "lg:grid-cols-3")}>
        {plans.map((plan) => {
          const active = selected === plan.key;
          const saving = plan.listPrice - plan.price;
          return (
            <article
              key={plan.key}
              className={cn(
                "relative flex flex-col rounded-[24px] border bg-white/90 p-5 shadow-[0_24px_60px_-40px_rgb(10_22_105/0.6)] transition-all duration-200 sm:p-6",
                active ? "border-ember-400 ring-2 ring-ember-400/40" : "border-white/80",
                plan.recommended && "lg:-translate-y-2",
              )}
            >
              {plan.recommended && !single ? (
                <span className="absolute -top-3 start-5 inline-flex items-center gap-1 rounded-full bg-gradient-to-l from-ember-400 to-[#e8862e] px-3 py-1 text-[12px] font-bold text-white shadow-md">
                  <Sparkles className="size-3.5" /> الأنسب لمشروعك
                </span>
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[19px] font-bold text-ivory">{plan.nameAr}</h3>
                  <p className="mt-0.5 text-[13px] text-fog">{plan.summaryAr}</p>
                </div>
                {active ? (
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ember-400 text-white">
                    <Check className="size-4" strokeWidth={3} />
                  </span>
                ) : null}
              </div>

              <div className="mt-4 flex items-end gap-2" dir="ltr">
                <span className="text-[34px] font-bold leading-none text-ivory">{money(plan.price)}</span>
                {saving > 0 ? <span className="pb-1 text-[15px] text-fog line-through">{money(plan.listPrice)}</span> : null}
              </div>
              {saving > 0 ? (
                <p className="mt-1.5 text-[12.5px] font-semibold text-success">
                  توفّر <span dir="ltr">{money(saving)}</span> مع العرض الحالي
                </p>
              ) : (
                <p className="mt-1.5 text-[12.5px] text-fog">دفعة لمرة واحدة</p>
              )}
              <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-mist">
                <Clock3 className="size-3.5" /> التسليم خلال {weeksLabel(plan.weeksMin, plan.weeksMax)}
              </p>

              <ul className="mt-4 flex-1 space-y-2 border-t border-line/[0.07] pt-4">
                {plan.includes.map((row, index) =>
                  row.heading ? (
                    <li key={index} className="pt-1 text-[13px] font-bold text-ivory">
                      {row.ar}
                    </li>
                  ) : (
                    <li key={index} className="flex gap-2 text-[13.5px] leading-snug text-mist">
                      <Check className="mt-0.5 size-4 shrink-0 text-ember-400" strokeWidth={2.5} />
                      <span>{row.ar}</span>
                    </li>
                  ),
                )}
              </ul>

              {locked ? null : (
                <button
                  type="button"
                  onClick={() => choose(plan.key)}
                  className={cn(
                    "mt-5 w-full rounded-2xl px-4 py-3 text-[15px] font-bold transition-all active:scale-[0.98]",
                    active
                      ? "bg-gradient-to-b from-[#e0761c] to-[#b9570a] text-white shadow-[0_12px_32px_-14px_rgb(210_102_10/0.75)]"
                      : "border border-line/15 bg-white text-ivory hover:border-ember-400/60",
                  )}
                >
                  {single ? "تابع للموافقة" : active ? "الخطة المختارة — تابع للموافقة" : "اختر هذه الخطة"}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** Compact plan switcher inside the accept form. */
export function PlanSwitcher({ plans, currency }: { plans: ProposalPlan[]; currency: string }) {
  const { selected, select } = usePlanChoice();
  if (plans.length < 2) return null;
  return (
    <div className={cn("mt-6 grid gap-2", plans.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3")} role="radiogroup" aria-label="الخطة">
      {plans.map((plan) => {
        const active = selected === plan.key;
        return (
          <button
            key={plan.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => select(plan.key)}
            className={cn(
              "rounded-2xl border px-4 py-3 text-start transition-all",
              active ? "border-ember-400 bg-ember-400/[0.07] ring-1 ring-inset ring-ember-400/40" : "border-line/12 bg-white hover:border-line/25",
            )}
          >
            <span className="block text-[14px] font-bold text-ivory">{plan.nameAr}</span>
            <span className="mt-0.5 block text-[15px] font-bold text-ember-300" dir="ltr">
              {formatMoney(plan.price, currency)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
