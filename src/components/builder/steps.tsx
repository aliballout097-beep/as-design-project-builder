"use client";

import { motion } from "framer-motion";
import { Check, ChevronDown, Minus, Pencil, Plus, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  ASSETS,
  BUDGETS,
  CONTACT_METHODS,
  CURRENCY,
  GOALS,
  ITEMS,
  LANGUAGES,
  PROJECT_TYPES,
  SCALE_KEYS,
  SERVICES,
  TIMELINES,
  effectiveTier,
  type FeatureKey,
  type ItemKey,
  type Promo,
  type ScaleKey,
  type ServiceKey,
} from "@/config/catalog";
import {
  ASSET_LABELS_AR,
  BUDGET_LABELS_AR,
  CONTACT_METHOD_LABELS_AR,
  FEATURE_DESCRIPTIONS_AR,
  FEATURE_NAMES_AR,
  GOAL_LABELS_AR,
  INDUSTRIES_AR,
  ITEM_NAMES_AR,
  ITEM_UNITS_AR,
  LANGUAGE_LABELS_AR,
  PROJECT_TYPE_DESCRIPTIONS_AR,
  PROJECT_TYPE_LABELS_AR,
  SERVICE_NAMES_AR,
  SERVICE_TAGLINES_AR,
  TIMELINE_DESCRIPTIONS_AR,
  TIMELINE_LABELS_AR,
} from "@/config/catalog.ar";
import { brand } from "@/config/brand";
import { PLAN_NAMES } from "@/config/plans";
import { formatMoney, formatRange } from "@/lib/format";
import { detectRequests, mergeDetection } from "@/lib/pricing/detect";
import { priceScope, type Estimate } from "@/lib/pricing/estimate";
import type { PricingOverrides } from "@/lib/pricing/overrides";
import { resolveFeatureMap, resolveIncludes, resolveItemMap, resolveServiceMap, resolveTypeFactor } from "@/lib/pricing/overrides";
import { distinctTiers, includesFor } from "@/lib/pricing/plans";
import { leadScope, type LeadScope } from "@/lib/pricing/scope";
import { Chip } from "@/components/ui/Chip";
import { cn } from "@/components/ui/cn";
import { FieldError, Hint, Input, Label, Select, Textarea } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import { Switch } from "@/components/ui/Switch";
import { SERVICE_ICONS } from "./icons";
import { setItemQuantity, toggle, toggleService, type BuilderDraft } from "./state";
import { PhoneField } from "./PhoneField";
import { VoiceRecorder } from "./VoiceRecorder";

export interface StepProps {
  draft: BuilderDraft;
  update: <K extends keyof BuilderDraft>(section: K, patch: Partial<BuilderDraft[K]>) => void;
  errors: Record<string, string>;
}

export interface PricingContext {
  overrides: PricingOverrides | null;
  promo: Promo | null;
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.03 } },
};
const rise = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const } },
};

function SectionLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h3 className="text-[14px] font-bold text-ivory">{children}</h3>
      {hint ? <span className="text-[12px] text-fog">{hint}</span> : null}
    </div>
  );
}

/** A native <details> fold for optional questions — keeps each step short on phones. */
function Optional({ title, hint, children, defaultOpen = false }: { title: string; hint?: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="group rounded-2xl border border-line/10 bg-white/60 open:bg-white/80" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-[14px] font-semibold text-ivory [&::-webkit-details-marker]:hidden">
        <span>
          {title}
          {hint ? <span className="ms-2 text-[12px] font-normal text-fog">{hint}</span> : null}
        </span>
        <ChevronDown className="size-4 shrink-0 text-fog transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-6 border-t border-line/[0.07] px-4 pb-5 pt-4">{children}</div>
    </details>
  );
}

function Tile({
  active,
  onClick,
  role = "radio",
  className,
  children,
}: {
  active: boolean;
  onClick: () => void;
  role?: "radio" | "checkbox";
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "rounded-2xl border px-3.5 py-3 text-start transition-all duration-200 active:scale-[0.985]",
        active
          ? "border-ember-400 bg-ember-400/[0.07] shadow-[0_8px_22px_-14px_rgb(210_102_10/0.7)] ring-1 ring-inset ring-ember-400/40"
          : "border-line/12 bg-white hover:border-line/25",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------------------
 * 01 — Services
 * ------------------------------------------------------------------------- */

const PROJECT_TYPES_AR = PROJECT_TYPES.map((pt) => ({ key: pt.key, label: PROJECT_TYPE_LABELS_AR[pt.key], description: PROJECT_TYPE_DESCRIPTIONS_AR[pt.key] }));

/** Short names for the price on an items-service card ("اللوغو $50"). */
const ITEM_SHORT_AR: Partial<Record<ItemKey, string>> = { logo: "اللوغو", reel: "الريل", "cv-ats": "السيرة الذاتية" };

function Stepper({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  const button = "grid size-10 place-items-center rounded-xl border border-line/12 bg-white text-ivory transition active:scale-95 disabled:opacity-35";
  return (
    <div className="flex shrink-0 items-center gap-1.5" dir="ltr" role="group" aria-label={`الكمية: ${label}`}>
      <button type="button" className={button} onClick={() => onChange(value - 1)} disabled={value <= 0} aria-label={`إنقاص ${label}`}>
        <Minus className="size-4" />
      </button>
      <span className={cn("w-8 text-center text-[16px] font-bold tabular-nums", value > 0 ? "text-ivory" : "text-fog")} aria-live="polite">
        {value}
      </span>
      <button type="button" className={cn(button, "border-ember-400/40 text-ember-300")} onClick={() => onChange(value + 1)} disabled={value >= 100} aria-label={`زيادة ${label}`}>
        <Plus className="size-4" />
      </button>
    </div>
  );
}

/** Add-ons shown before "show all" — long lists tire people on phones. */
const ADD_ONS_SHOWN = 4;

export function ServicesStep({ draft, update, errors, pricing }: StepProps & { pricing: PricingContext }) {
  const selected = draft.project.services;
  const [allAddOns, setAllAddOns] = useState<ServiceKey[]>([]);
  const services = resolveServiceMap(pricing.overrides);
  const itemMap = resolveItemMap(pricing.overrides);
  const typeFactor = resolveTypeFactor(draft.project.type, pricing.overrides);
  const featureMap = resolveFeatureMap(pricing.overrides);
  // Each add-on is offered once, under the first selected service it belongs to.
  const shownFeatures = new Set<FeatureKey>();
  const addOnsFor = (key: ServiceKey) =>
    (services[key]?.relatedFeatures ?? []).filter((feature) => {
      if (shownFeatures.has(feature) || !featureMap[feature]) return false;
      shownFeatures.add(feature);
      return true;
    });
  const priceTag = (key: ServiceKey) => {
    const service = services[key];
    const first = service.kind === "items" ? ITEMS.find((item) => item.service === key)! : null;
    if (first) {
      return (
        <>
          {ITEM_SHORT_AR[first.key] ?? "ابتداءً من"} <bdi dir="ltr">{formatMoney(itemMap[first.key].price, CURRENCY)}</bdi>
        </>
      );
    }
    // The Essential plan's price as the client pays it (with any offer), the regular one struck through.
    const essential = priceScope({ services: [key] }, "starter", pricing.overrides, { promo: pricing.promo });
    return (
      <>
        من <bdi dir="ltr">{formatMoney(essential.total, CURRENCY)}</bdi>
        {essential.list > essential.total ? (
          <bdi dir="ltr" className="ms-1.5 text-[11px] font-normal text-fog line-through">
            {formatMoney(essential.list, CURRENCY)}
          </bdi>
        ) : null}
      </>
    );
  };
  return (
    <div className="space-y-6">
      <div>
        <SectionLabel hint={selected.length ? `${selected.length} مُختارة` : "اختر واحدة أو أكثر"}>الخدمات</SectionLabel>
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-3" role="group" aria-label="الخدمات">
          {SERVICES.map((service) => {
            const Icon = SERVICE_ICONS[service.icon];
            const active = selected.includes(service.key);
            const featured = service.key === "ai-website";
            return (
              <motion.button
                key={service.key}
                variants={rise}
                type="button"
                role="checkbox"
                aria-checked={active}
                onClick={() => update("project", toggleService(draft.project, service.key))}
                className={cn(
                  "group relative flex min-h-[124px] flex-col rounded-2xl border p-3 text-start transition-all duration-200 active:scale-[0.98] sm:min-h-[140px] sm:p-4",
                  featured && "col-span-2 min-h-[112px] bg-gradient-to-br from-white via-[#fff6ec] to-sky-100 xl:col-span-3",
                  active
                    ? "border-ember-400 bg-ember-400/[0.07] shadow-[0_10px_26px_-16px_rgb(210_102_10/0.8)] ring-1 ring-inset ring-ember-400/40"
                    : featured
                      ? "border-ember-400/35 hover:border-ember-400/60"
                      : "border-line/12 bg-white hover:border-line/25",
                )}
              >
                {featured ? (
                  <span className="absolute -top-2.5 start-4 rounded-full bg-gradient-to-l from-ember-400 to-[#e8862e] px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm">
                    الأقوى لنمو أعمالك
                  </span>
                ) : null}
                <span className="flex items-start justify-between">
                  <span
                    className={cn(
                      "grid size-9 place-items-center rounded-xl transition-colors sm:size-10",
                      active ? "bg-ember-400 text-white" : "bg-sky-100 text-navy-500",
                    )}
                  >
                    <Icon className="size-[18px]" strokeWidth={1.8} />
                  </span>
                  <span
                    className={cn(
                      "grid size-5 place-items-center rounded-full border transition-all duration-200",
                      active ? "border-ember-400 bg-ember-400 text-white" : "border-line/20 text-transparent",
                    )}
                  >
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                </span>
                <span className="mt-2.5 text-[14.5px] font-bold leading-snug text-ivory sm:text-[16px]">{SERVICE_NAMES_AR[service.key]}</span>
                <span className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-fog sm:text-[12.5px]">{SERVICE_TAGLINES_AR[service.key]}</span>
                <span className="mt-auto pt-2 text-[12px] font-semibold text-ember-300">{priceTag(service.key)}</span>
              </motion.button>
            );
          })}
        </motion.div>
        <FieldError message={errors.services} />
      </div>

      {selected.length ? (
        <div className="space-y-3">
          {selected.map((serviceKey) => {
            const service = services[serviceKey];
            if (!service) return null;
            if (service.kind === "tiered") {
              const addOns = addOnsFor(serviceKey);
              const included = resolveIncludes(serviceKey, effectiveTier(service, "starter") ?? "starter", pricing.overrides)?.ar.slice(0, 4) ?? [];
              if (!addOns.length && !included.length) return null;
              return (
                <motion.div
                  key={serviceKey}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-ember-400/25 bg-white/85 p-3.5 sm:p-4"
                >
                  <p className="text-[14px] font-bold text-ivory">{SERVICE_NAMES_AR[serviceKey]} — شو حابب تضيف؟</p>
                  {included.length ? (
                    <p className="mt-1 text-[12px] leading-relaxed text-mist">
                      <span className="font-semibold text-success">مشمول بالخطة الأساسية:</span> {included.join(" · ")}
                    </p>
                  ) : null}
                  {addOns.length ? (
                    <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                      {addOns
                        .filter((key, index) => index < ADD_ONS_SHOWN || allAddOns.includes(serviceKey) || draft.project.features.includes(key))
                        .map((key) => {
                        const feature = featureMap[key];
                        const active = draft.project.features.includes(key);
                        return (
                          <button
                            key={key}
                            type="button"
                            role="checkbox"
                            aria-checked={active}
                            onClick={() => update("project", { features: toggle(draft.project.features, key) })}
                            className={cn(
                              "flex items-start gap-3 rounded-xl border px-3 py-2.5 text-start transition-all duration-200",
                              active ? "border-ember-400 bg-[#fff6ec]" : "border-line/12 bg-white hover:border-line/25",
                            )}
                          >
                            <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-all", active ? "border-ember-400 bg-ember-400 text-white" : "border-line/25")}>
                              {active ? <Check className="size-3" strokeWidth={3} /> : null}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13.5px] font-semibold leading-snug text-ivory">{FEATURE_NAMES_AR[key]}</span>
                              <span className="mt-0.5 block text-[11.5px] leading-snug text-fog">{FEATURE_DESCRIPTIONS_AR[key]}</span>
                            </span>
                            <span className="shrink-0 text-[11.5px] font-semibold text-ember-300" dir="ltr">
                              {feature.price > 0 ? `+${formatMoney(feature.price, CURRENCY)}` : `${formatMoney(feature.monthly ?? 0, CURRENCY)}/mo`}
                            </span>
                          </button>
                        );
                      })}
                      {addOns.length > ADD_ONS_SHOWN && !allAddOns.includes(serviceKey) ? (
                        <button
                          type="button"
                          onClick={() => setAllAddOns((current) => [...current, serviceKey])}
                          className="rounded-xl border border-dashed border-line/20 px-3 py-2.5 text-[13px] font-semibold text-ember-300 transition hover:border-ember-400/50 sm:col-span-2"
                        >
                          + عرض كل الإضافات ({addOns.filter((key, index) => index >= ADD_ONS_SHOWN && !draft.project.features.includes(key)).length} أخرى)
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </motion.div>
              );
            }
            return (
            <motion.div
              key={serviceKey}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-ember-400/25 bg-white/85 p-3.5 sm:p-4"
            >
              <p className="text-[14px] font-bold text-ivory">{SERVICE_NAMES_AR[serviceKey]}</p>
              <p className="mb-1 text-[12px] text-fog">اختر ما تحتاجه وحدد الكمية — السعر يتحدّث مباشرة.</p>
              <ul className="divide-y divide-line/[0.07]">
                {ITEMS.filter((item) => item.service === serviceKey).map((item) => {
                  const qty = draft.project.items[item.key] ?? 0;
                  const unit = Math.round(itemMap[item.key].price * typeFactor);
                  return (
                    <li key={item.key} className="flex items-center gap-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold leading-snug text-ivory">{ITEM_NAMES_AR[item.key]}</span>
                        <span className="text-[12px] text-fog">
                          <bdi dir="ltr" className="font-semibold text-ember-300">
                            {formatMoney(unit, CURRENCY)}
                          </bdi>{" "}
                          {ITEM_UNITS_AR[item.key]}
                          {qty > 1 ? (
                            <>
                              {" · "}المجموع <bdi dir="ltr">{formatMoney(unit * qty, CURRENCY)}</bdi>
                            </>
                          ) : null}
                        </span>
                      </span>
                      <Stepper value={qty} label={ITEM_NAMES_AR[item.key]} onChange={(value) => update("project", setItemQuantity(draft.project, item.key, value))} />
                    </li>
                  );
                })}
              </ul>
            </motion.div>
            );
          })}
        </div>
      ) : null}

      <div>
        <SectionLabel>نوع المشروع</SectionLabel>
        <Segmented ariaLabel="نوع المشروع" value={draft.project.type} onChange={(type) => update("project", { type })} options={PROJECT_TYPES_AR} />
        {typeFactor < 1 ? (
          <p className="mt-2 rounded-xl bg-success/10 px-3 py-2 text-[12.5px] font-semibold text-success">
            {draft.project.type === "extend" ? "التعديلات أوفر:" : "إعادة التصميم أوفر:"} تُحسب الأسعار بـ {Math.round(typeFactor * 100)}٪ من سعر العمل الجديد.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * 02 — Vision (the brief)
 * ------------------------------------------------------------------------- */

/**
 * What the description asks for beyond the ticked services. Clear requests are
 * already in the price (the proposal prices them too); softer hints are offered
 * as one-tap suggestions.
 */
function DetectedNotice({ project, update }: { project: BuilderDraft["project"]; update: StepProps["update"] }) {
  const { merged, suggestions } = useMemo(() => {
    const merged = mergeDetection(project, detectRequests(project.description, { autoOnly: true }));
    const suggestions = mergeDetection(merged, detectRequests(project.description)).added.services;
    return { merged, suggestions };
  }, [project]);
  const added = [...merged.added.services.map((key) => SERVICE_NAMES_AR[key]), ...merged.added.items.map((key) => ITEM_NAMES_AR[key])];
  if (!added.length && !suggestions.length) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 rounded-2xl border border-ember-400/30 bg-[#fff6ec] p-3.5" aria-live="polite">
      {added.length ? (
        <div>
          <p className="text-[13.5px] leading-relaxed text-ivory">
            <span className="font-bold">✨ فهمنا من وصفك أنك تحتاج أيضاً:</span> {[...new Set(added)].join("، ")}
            {merged.added.replaced.length ? ` (بدلاً من ${merged.added.replaced.map((key) => SERVICE_NAMES_AR[key]).join("، ")})` : ""}.
          </p>
          <p className="mt-0.5 text-[12px] text-mist">أضفناها إلى السعر حتى يكون عرضك دقيقاً من البداية.</p>
          <button
            type="button"
            onClick={() => update("project", { services: merged.services, items: merged.items })}
            className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-ember-400 px-3 py-2 text-[13px] font-bold text-white transition active:scale-95"
          >
            <Check className="size-3.5" /> ثبّتها في اختياراتي
          </button>
        </div>
      ) : null}
      {suggestions.length ? (
        <div>
          <p className="mb-2 text-[12.5px] font-semibold text-mist">قد تحتاج أيضاً:</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => update("project", toggleService(project, key))}
                className="inline-flex items-center gap-1 rounded-full border border-line/15 bg-white px-3 py-1.5 text-[13px] font-semibold text-ivory transition hover:border-ember-400/50 active:scale-95"
              >
                <Plus className="size-3.5 text-ember-300" /> {SERVICE_NAMES_AR[key]}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </motion.div>
  );
}

export function VisionStep({ draft, update, errors }: StepProps & { pricing?: PricingContext }) {
  const { project } = draft;
  const length = project.description.trim().length;
  const setReference = (index: number, value: string) =>
    update("project", { references: project.references.map((r, i) => (i === index ? value : r)) });

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="description">صف مشروعك</Label>
        <Textarea
          id="description"
          rows={5}
          invalid={Boolean(errors.description)}
          aria-describedby="description-hint description-error"
          placeholder="مثال: عندي مطعم في بيروت وبدي موقع فيه المنيو والحجوزات، وصفحة على إنستغرام…"
          value={project.description}
          maxLength={5000}
          onChange={(e) => update("project", { description: e.target.value })}
        />
        <div className="flex items-start justify-between gap-4">
          <FieldError id="description-error" message={errors.description} />
          <span id="description-hint" className={cn("ms-auto mt-2 text-[12px]", length >= 20 ? "text-success" : "text-fog")}>
            {length < 20 ? `${20 - length} حرفاً إضافياً على الأقل` : "ممتاز ✓"}
          </span>
        </div>
        <VoiceRecorder
          className="mt-3"
          onTranscript={(text) =>
            update("project", { description: project.description.trim() ? `${project.description.trim()}\n\n${text}` : text })
          }
        />
      </div>

      <DetectedNotice project={project} update={update} />

      <div>
        <SectionLabel hint="اختياري">ما هدفك الأساسي؟</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {GOALS.map((goal) => (
            <Chip key={goal.key} selected={project.goals.includes(goal.key)} onToggle={() => update("project", { goals: toggle(project.goals, goal.key) })}>
              {GOAL_LABELS_AR[goal.key]}
            </Chip>
          ))}
        </div>
      </div>

      <Optional title="تفاصيل إضافية" hint="اختياري — تساعدنا على دقة العرض">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="project-name">اسم المشروع أو النشاط</Label>
            <Input id="project-name" placeholder="مثال: مطعم الشاطئ" value={project.name} maxLength={120} onChange={(e) => update("project", { name: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="industry">القطاع</Label>
            <Input id="industry" list="industries" placeholder="ابدأ الكتابة…" value={project.industry} maxLength={80} onChange={(e) => update("project", { industry: e.target.value })} />
            <datalist id="industries">
              {INDUSTRIES_AR.map((industry) => (
                <option key={industry} value={industry} />
              ))}
            </datalist>
          </div>
        </div>
        <div>
          <Label htmlFor="audience">لمن هذا المشروع؟</Label>
          <Input id="audience" placeholder="مثال: العائلات والشباب في بيروت" value={project.audience} maxLength={300} onChange={(e) => update("project", { audience: e.target.value })} />
        </div>
        <div>
          <SectionLabel>ما الذي تمتلكه حالياً؟</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {ASSETS.map((asset) => (
              <Chip key={asset.key} selected={project.assets.includes(asset.key)} onToggle={() => update("project", { assets: toggle(project.assets, asset.key) })}>
                {ASSET_LABELS_AR[asset.key]}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <SectionLabel>مواقع تعجبك</SectionLabel>
          <div className="space-y-2">
            {project.references.map((reference, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  aria-label={`رابط مرجعي ${index + 1}`}
                  placeholder="https://"
                  inputMode="url"
                  dir="ltr"
                  value={reference}
                  invalid={Boolean(errors[`references.${index}`])}
                  onChange={(e) => setReference(index, e.target.value)}
                />
                {project.references.length > 1 ? (
                  <button
                    type="button"
                    aria-label="حذف المرجع"
                    onClick={() => update("project", { references: project.references.filter((_, i) => i !== index) })}
                    className="grid size-12 shrink-0 place-items-center rounded-xl border border-line/10 bg-white text-fog transition hover:border-line/25 hover:text-ivory"
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>
            ))}
            {Object.entries(errors)
              .filter(([key]) => key.startsWith("references"))
              .slice(0, 1)
              .map(([key, message]) => (
                <FieldError key={key} message={message} />
              ))}
            {project.references.length < 5 ? (
              <button
                type="button"
                onClick={() => update("project", { references: [...project.references, ""] })}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ember-300 transition hover:text-ember-200"
              >
                <Plus className="size-3.5" /> إضافة رابط آخر
              </button>
            ) : null}
          </div>
        </div>
      </Optional>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * 03 — Size, budget & timeline (scope + plan)
 * ------------------------------------------------------------------------- */

/** "5 أيام", "يومين", "12 يوماً" — Arabic number agreement. */
const daysAr = (n: number) => (n === 1 ? "يوم واحد" : n === 2 ? "يومين" : n <= 10 ? `${n} أيام` : `${n} يوماً`);

const weeksAr = (min: number, max: number) => {
  const one = (w: number) => (w === 1 ? "أسبوع" : w === 2 ? "أسبوعين" : `${w} أسابيع`);
  return min === max ? one(min) : `${min}–${max} أسابيع`;
};

export function PlanStep({ draft, update, errors, pricing }: StepProps & { pricing: PricingContext }) {
  const { project, plan } = draft;
  // Only plans that differ in price are worth choosing between (a CV alone has one price,
  // social media two). Each shows exactly what the proposal will charge for it.
  const { scale: _scale, ...planInput } = leadScope({ project, plan: { timeline: plan.timeline || "flexible" } }).input;
  void _scale;
  const tiers = distinctTiers(planInput, pricing.overrides, pricing.promo);
  const rank = (key: ScaleKey) => SCALE_KEYS.indexOf(key);
  const activeTier = [...tiers].reverse().find((t) => rank(t.tier) <= rank(project.scale))?.tier ?? tiers[0]?.tier;
  const lowest = tiers.length ? Math.min(...tiers.map((t) => t.total)) : 0;
  const highest = tiers.length ? Math.max(...tiers.map((t) => t.total)) : 0;
  const bestOffer = Math.max(0, ...tiers.flatMap((t) => t.discount.percents));
  const days = plan.timeline === "custom" ? plan.deliveryDays : "";

  return (
    <div className="space-y-7">
      {tiers.length > 1 ? (
        <div>
          <div className="mb-3 rounded-2xl border border-ember-400/30 bg-gradient-to-l from-[#fff6ec] to-white px-4 py-3">
            <p className="text-[14px] font-bold text-ivory">
              أسعار خططك من <bdi dir="ltr">{formatMoney(lowest, CURRENCY)}</bdi> إلى <bdi dir="ltr">{formatMoney(highest, CURRENCY)}</bdi>
            </p>
            {bestOffer > 0 ? (
              <p className="mt-0.5 text-[12.5px] font-semibold text-ember-300">🔥 عرض خاص لفترة محدودة: خصم حتى {bestOffer}٪ — الأسعار المشطوبة هي الأسعار الأصلية</p>
            ) : null}
          </div>
          <SectionLabel hint="اضغط على الخطة لتشوف شو بتشمل">الخطة المناسبة لك</SectionLabel>
          <div className="grid gap-2.5" role="radiogroup" aria-label="الخطة">
            {tiers.map((priced) => {
              const active = activeTier === priced.tier;
              const includes = active ? includesFor(priced, pricing.overrides) : [];
              const off = priced.list > 0 ? Math.round(((priced.list - priced.total) / priced.list) * 100) : 0;
              return (
                <Tile key={priced.tier} active={active} onClick={() => update("project", { scale: priced.tier })}>
                  <span className="flex items-start justify-between gap-3">
                    <span>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[15.5px] font-bold text-ivory">{PLAN_NAMES[priced.tier].ar}</span>
                        {priced.tier === "starter" ? (
                          <span className="rounded-full bg-ember-400 px-2 py-0.5 text-[10.5px] font-bold text-white">اقتراحنا لك</span>
                        ) : null}
                        {off > 0 ? <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10.5px] font-bold text-success">خصم {off}٪</span> : null}
                      </span>
                      <span className="mt-0.5 block text-[12.5px] leading-snug text-fog">
                        {PLAN_NAMES[priced.tier].summaryAr} · التسليم خلال {weeksAr(priced.weeksMin, priced.weeksMax)}
                      </span>
                    </span>
                    <span className="shrink-0 text-end" dir="ltr">
                      <span className="block text-[17px] font-bold text-ember-300">{formatMoney(priced.total, CURRENCY)}</span>
                      {priced.total < priced.list ? <span className="block text-[11.5px] text-fog line-through">{formatMoney(priced.list, CURRENCY)}</span> : null}
                    </span>
                  </span>
                  {active && includes.length ? (
                    <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 space-y-1.5 border-t border-line/[0.08] pt-3">
                      {includes.map((row, index) =>
                        row.heading ? (
                          <li key={index} className="pt-1 text-[12.5px] font-bold text-ivory">
                            {row.ar}
                          </li>
                        ) : (
                          <li key={index} className="flex gap-2 text-[13px] leading-snug text-mist">
                            <Check className="mt-0.5 size-3.5 shrink-0 text-ember-400" strokeWidth={3} />
                            <span>{row.ar}</span>
                          </li>
                        ),
                      )}
                    </motion.ul>
                  ) : null}
                </Tile>
              );
            })}
          </div>
        </div>
      ) : tiers.length === 1 && tiers[0].list > 0 ? (
        <div className="rounded-2xl border border-line/10 bg-sky-100/60 px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-[14px] font-bold text-ivory">سعر واضح وثابت</span>
              <span className="text-[12.5px] text-fog">تدفع فقط ثمن ما اخترته · التسليم خلال {weeksAr(tiers[0].weeksMin, tiers[0].weeksMax)}</span>
            </span>
            <span className="text-[18px] font-bold text-ember-300" dir="ltr">
              {formatMoney(tiers[0].total, CURRENCY)}
            </span>
          </div>
          <ul className="mt-3 space-y-1.5 border-t border-line/[0.08] pt-3">
            {includesFor(tiers[0], pricing.overrides).map((row, index) => (
              <li key={index} className={cn("flex gap-2 text-[13px] leading-snug", row.heading ? "font-bold text-ivory" : "text-mist")}>
                {row.heading ? null : <Check className="mt-0.5 size-3.5 shrink-0 text-ember-400" strokeWidth={3} />}
                <span>{row.ar}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <SectionLabel>الميزانية المتوقعة</SectionLabel>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="الميزانية">
          {BUDGETS.map((budget) => (
            <Tile key={budget.key} active={plan.budget === budget.key} onClick={() => update("plan", { budget: budget.key })} className="py-3.5">
              <span className="text-[15px] font-bold text-ivory">{BUDGET_LABELS_AR[budget.key]}</span>
            </Tile>
          ))}
        </div>
        <FieldError message={errors.budget} />
      </div>

      <div>
        <SectionLabel hint="نسلّم بسرعة — أغلب المشاريع خلال أسبوع إلى أسبوعين">متى بدك التسليم؟</SectionLabel>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5" role="radiogroup" aria-label="مدة التسليم">
          {TIMELINES.filter((timeline) => !timeline.hidden).map((timeline) => (
            <Tile
              key={timeline.key}
              active={plan.timeline === timeline.key}
              onClick={() => update("plan", { timeline: timeline.key, deliveryDays: "" })}
              className={cn(timeline.key === "flexible" && "col-span-2 sm:col-span-1")}
            >
              <span className="block text-[14.5px] font-bold text-ivory">{TIMELINE_LABELS_AR[timeline.key]}</span>
              <span className="mt-0.5 block text-[11.5px] leading-snug text-fog">{TIMELINE_DESCRIPTIONS_AR[timeline.key]}</span>
            </Tile>
          ))}
        </div>
        <div className={cn("mt-2.5 flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 transition", plan.timeline === "custom" ? "border-ember-400 bg-[#fff6ec]" : "border-line/12 bg-white")}>
          <label htmlFor="delivery-days" className="min-w-0 flex-1 text-[13.5px] font-semibold text-ivory">
            أو اكتب المدة التي تريدها
            <span className="block text-[11.5px] font-normal text-fog">مثلاً: بدي التسليم بعد 5 أيام</span>
          </label>
          <span className="flex shrink-0 items-center gap-2">
            <input
              id="delivery-days"
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              placeholder="5"
              value={days}
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9]/g, "").slice(0, 3);
                update("plan", value ? { timeline: "custom", deliveryDays: value } : { timeline: "", deliveryDays: "" });
              }}
              aria-invalid={Boolean(errors.deliveryDays) || undefined}
              className="h-11 w-20 rounded-xl border border-line/15 bg-white px-3 text-center text-[16px] font-bold text-ivory outline-none focus:border-ember-400/70"
            />
            <span className="text-[13.5px] text-mist">يوم</span>
          </span>
        </div>
        <FieldError message={errors.deliveryDays ?? errors.timeline} />
      </div>

      <Optional title="اللغات والميزانية" hint="اختياري">
        <div>
          <SectionLabel>لغات الموقع أو التطبيق</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((language) => (
              <Chip key={language.key} selected={project.languages.includes(language.key)} onToggle={() => update("project", { languages: toggle(project.languages, language.key) })}>
                {LANGUAGE_LABELS_AR[language.key]}
              </Chip>
            ))}
          </div>
          <FieldError message={errors.languages} />
        </div>
        <Switch
          id="budget-flexible"
          checked={plan.budgetFlexible}
          onChange={(budgetFlexible) => update("plan", { budgetFlexible })}
          label="الميزانية مرنة للحل الأنسب"
          description="سنقترح إضافات اختيارية تتجاوز هذا المدى."
        />
      </Optional>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * 04 — Contact (+ a compact summary before sending)
 * ------------------------------------------------------------------------- */

export function ContactStep({
  draft,
  update,
  errors,
  estimate,
  added,
  onEdit,
  whatsappDelivery,
}: StepProps & {
  estimate: Estimate;
  /** What the description added to the priced scope. */
  added?: LeadScope["added"];
  onEdit: (step: number) => void;
  /** The studio can send the proposal on WhatsApp. */
  whatsappDelivery: boolean;
}) {
  const { contact, project, plan } = draft;
  const field = (key: keyof BuilderDraft["contact"]) => ({
    id: `contact-${key}`,
    invalid: Boolean(errors[key]),
    "aria-describedby": errors[key] ? `contact-${key}-error` : undefined,
  });
  const summary: { step: number; label: string; value: string }[] = [
    { step: 0, label: "الخدمات", value: project.services.map((s) => SERVICE_NAMES_AR[s] ?? s).join("، ") || "—" },
    ...(Object.values(project.items).some((qty) => (qty ?? 0) > 0)
      ? [
          {
            step: 0,
            label: "القطع",
            value: (Object.entries(project.items) as [ItemKey, number][])
              .filter(([, qty]) => qty > 0)
              .map(([key, qty]) => `${ITEM_NAMES_AR[key]}${qty > 1 ? ` × ${qty}` : ""}`)
              .join("، "),
          },
        ]
      : []),
    ...(added && (added.services.length || added.items.length)
      ? [{ step: 1, label: "من وصفك", value: [...new Set([...added.services.map((k) => SERVICE_NAMES_AR[k]), ...added.items.map((k) => ITEM_NAMES_AR[k])])].join("، ") }]
      : []),
    { step: 2, label: "الخطة", value: PLAN_NAMES[project.scale].ar },
    { step: 2, label: "الميزانية", value: (plan.budget && BUDGET_LABELS_AR[plan.budget]) || "—" },
    {
      step: 2,
      label: "التسليم",
      value: plan.timeline === "custom" && plan.deliveryDays ? `خلال ${daysAr(Number(plan.deliveryDays))}` : (plan.timeline && TIMELINE_LABELS_AR[plan.timeline]) || "—",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
        <div>
          <Label htmlFor="contact-name">الاسم الكامل</Label>
          <Input {...field("name")} autoComplete="name" enterKeyHint="next" value={contact.name} onChange={(e) => update("contact", { name: e.target.value })} />
          <FieldError id="contact-name-error" message={errors.name} />
        </div>
        <div>
          <Label htmlFor="contact-email">البريد الإلكتروني</Label>
          <Input
            {...field("email")}
            type="email"
            dir="ltr"
            autoComplete="email"
            inputMode="email"
            enterKeyHint="next"
            placeholder="name@example.com"
            value={contact.email}
            onChange={(e) => update("contact", { email: e.target.value })}
          />
          <FieldError id="contact-email-error" message={errors.email} />
          <Hint>هنا يصلك العرض بصيغة PDF — تأكد من صحته.</Hint>
        </div>
        <div>
          <Label htmlFor="contact-phone">رقم الهاتف / واتساب</Label>
          <PhoneField
            id="contact-phone"
            country={contact.phoneCountry}
            national={contact.phone}
            invalid={Boolean(errors.phone)}
            describedBy={errors.phone ? "contact-phone-error" : "contact-phone-hint"}
            onChange={({ country, national: phone }) => {
              if (!phone) update("contact", { phone, phoneCountry: country, whatsapp: false, deliveryChannel: "email" });
              // First digits typed: most clients are on WhatsApp — send it there too unless they opt out.
              else if (!contact.phone && whatsappDelivery) update("contact", { phone, phoneCountry: country, whatsapp: true, deliveryChannel: "both", preferredContact: "whatsapp" });
              else update("contact", { phone, phoneCountry: country });
            }}
          />
          <FieldError id="contact-phone-error" message={errors.phone} />
          {!errors.phone ? <Hint id="contact-phone-hint">اختر دولتك واكتب رقمك — نتواصل معك عليه إذا كان في خطأ بالإيميل.</Hint> : null}
          {contact.phone ? (
            <div className="mt-3 rounded-xl border border-line/10 bg-white/70 p-3">
              {whatsappDelivery ? (
                <Switch
                  id="contact-whatsapp"
                  checked={contact.whatsapp && contact.deliveryChannel !== "email"}
                  onChange={(on) =>
                    update("contact", on ? { whatsapp: true, deliveryChannel: "both", preferredContact: "whatsapp" } : { whatsapp: false, deliveryChannel: "email" })
                  }
                  label="أرسل لي العرض على واتساب أيضاً"
                  description="يصلك ملف الـ PDF على واتساب بالإضافة إلى البريد الإلكتروني."
                />
              ) : (
                <Switch
                  id="contact-whatsapp"
                  checked={contact.whatsapp}
                  onChange={(whatsapp) => update("contact", whatsapp ? { whatsapp, preferredContact: "whatsapp" } : { whatsapp, deliveryChannel: "email" })}
                  label="هذا الرقم على واتساب"
                />
              )}
              <FieldError message={errors.deliveryChannel} />
            </div>
          ) : null}
        </div>
        <div>
          <Label htmlFor="contact-company" optional="اختياري">
            الشركة أو النشاط
          </Label>
          <Input {...field("company")} autoComplete="organization" value={contact.company} onChange={(e) => update("contact", { company: e.target.value })} />
        </div>
      </div>

      <Optional title="معلومات إضافية" hint="اختياري">
        <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
          <div>
            <Label htmlFor="contact-role">دورك</Label>
            <Input {...field("role")} autoComplete="organization-title" value={contact.role} onChange={(e) => update("contact", { role: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="contact-website">موقعك الحالي</Label>
            <Input {...field("website")} dir="ltr" inputMode="url" placeholder="yourcompany.com" value={contact.website} onChange={(e) => update("contact", { website: e.target.value })} />
            <FieldError id="contact-website-error" message={errors.website} />
          </div>
          <div>
            <Label htmlFor="contact-country">الدولة</Label>
            <Input {...field("country")} autoComplete="country-name" value={contact.country} onChange={(e) => update("contact", { country: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="contact-preferred">أفضل طريقة للتواصل</Label>
            <Select
              id="contact-preferred"
              value={contact.preferredContact}
              onChange={(e) => update("contact", { preferredContact: e.target.value as BuilderDraft["contact"]["preferredContact"] })}
            >
              {CONTACT_METHODS.map((method) => (
                <option key={method.key} value={method.key}>
                  {CONTACT_METHOD_LABELS_AR[method.key]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-relaxed text-mist">
          <input
            type="checkbox"
            checked={contact.marketingOptIn}
            onChange={(e) => update("contact", { marketingOptIn: e.target.checked })}
            className="mt-1 size-4 shrink-0 accent-[var(--color-ember-400)]"
          />
          <span>أرغب باستلام أخبار الاستوديو وأعماله الجديدة من حين لآخر.</span>
        </label>
      </Optional>

      <div className="rounded-2xl border border-line/10 bg-sky-100/60 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[13px] font-bold text-ivory">ملخص طلبك</p>
          {estimate.max > 0 ? (
            <p className="text-[15px] font-bold text-ember-300" dir="ltr">
              {formatRange(estimate.min, estimate.max, CURRENCY)}
            </p>
          ) : null}
        </div>
        <dl className="mt-2 divide-y divide-line/[0.07]">
          {summary.map((row) => (
            <div key={row.label} className="flex items-center gap-3 py-2">
              <dt className="w-20 shrink-0 text-[12.5px] text-fog">{row.label}</dt>
              <dd className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ivory">{row.value}</dd>
              <button type="button" onClick={() => onEdit(row.step)} className="shrink-0 rounded-lg p-1.5 text-fog transition hover:bg-white hover:text-ember-300" aria-label={`تعديل ${row.label}`}>
                <Pencil className="size-3.5" />
              </button>
            </div>
          ))}
        </dl>
      </div>

      <div>
        <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-relaxed text-mist">
          <input
            type="checkbox"
            checked={contact.consent}
            onChange={(e) => update("contact", { consent: e.target.checked })}
            aria-invalid={Boolean(errors.consent) || undefined}
            className="mt-1 size-4 shrink-0 accent-[var(--color-ember-400)]"
          />
          <span>
            أوافق على أن يحفظ {brand.name} هذه التفاصيل ويتواصل معي بخصوص مشروعي. يُحلَّل وصف المشروع بالذكاء الاصطناعي لإعداد العرض، ولا تُشارك بيانات
            التواصل معه.
          </span>
        </label>
        <FieldError message={errors.consent} />
      </div>
    </div>
  );
}
