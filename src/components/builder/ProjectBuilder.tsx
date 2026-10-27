"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, ChevronUp, RotateCcw, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CURRENCY, type Promo } from "@/config/catalog";
import { formatMoney } from "@/lib/format";
import { estimateProject } from "@/lib/pricing/estimate";
import { leadScope } from "@/lib/pricing/scope";
import type { PricingOverrides } from "@/lib/pricing/overrides";
import type { LeadSubmissionInput } from "@/lib/schemas/lead";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Blueprint, BlueprintBody } from "./Blueprint";
import { STEPS, toSubmission, useBuilderDraft, validateStep } from "./state";
import { ContactStep, PlanStep, ServicesStep, VisionStep, type PricingContext } from "./steps";
import { SuccessScreen, type SubmissionResult } from "./SuccessScreen";

export type BuilderVariant = "page" | "embed";

// This builder is Arabic/RTL: "back" points toward reading-start (right), "forward" toward reading-end (left).
const BackIcon = ArrowRight;
const ForwardIcon = ArrowLeft;

/** Pull attribution from the page URL (the embed loader forwards the host page's UTMs & URL). */
function readAttribution(variant: BuilderVariant): LeadSubmissionInput["meta"] {
  if (typeof window === "undefined") return { source: variant === "embed" ? "embed" : "builder" };
  const params = new URLSearchParams(window.location.search);
  const utm = Object.fromEntries(
    (["source", "medium", "campaign", "term", "content"] as const)
      .map((key) => [key, params.get(`utm_${key}`)?.slice(0, 200)])
      .filter(([, value]) => value),
  );
  return {
    source: variant === "embed" ? "embed" : "builder",
    utm,
    referrer: (params.get("ref") ?? document.referrer)?.slice(0, 500) || undefined,
    landingPage: (params.get("page") ?? window.location.href).slice(0, 500),
    embedOrigin: params.get("origin")?.slice(0, 200) || undefined,
    locale: navigator.language?.slice(0, 20),
  };
}

function postToHost(message: Record<string, unknown>) {
  if (typeof window === "undefined" || window.parent === window) return;
  const origin = new URLSearchParams(window.location.search).get("origin") || "*";
  window.parent.postMessage({ source: "asd-builder", ...message }, origin);
}

const money = (value: number) => formatMoney(value, CURRENCY);

export function ProjectBuilder({ variant = "page" }: { variant?: BuilderVariant }) {
  const { draft, update, reset, restored, dismissRestored } = useBuilderDraft();
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [pricing, setPricing] = useState<PricingContext>({ overrides: null, promo: null });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [whatsappDelivery, setWhatsappDelivery] = useState(false);
  const startedAt = useRef<number>(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  // Live estimate uses the admin-edited prices (Settings → Pricing) and the current
  // promotion, so it matches the proposal the client receives. Falls back to defaults.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/catalog")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { overrides?: PricingOverrides; promo?: Promo | null; channels?: { whatsapp?: boolean } } | null) => {
        if (cancelled || !body) return;
        setPricing({ overrides: body.overrides ?? null, promo: body.promo ?? null });
        setWhatsappDelivery(Boolean(body.channels?.whatsapp));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Priced exactly like the proposal: the selections plus anything the description
  // clearly asks for (see lib/pricing/detect.ts), so the client sees no surprises later.
  const scope = useMemo(
    () => leadScope({ project: draft.project, plan: { timeline: draft.plan.timeline || "flexible" } }),
    [draft.project, draft.plan.timeline],
  );
  const estimate = useMemo(() => estimateProject(scope.input, pricing.overrides, { promo: pricing.promo }), [scope, pricing]);

  // Embed: keep the host iframe sized to the content.
  useEffect(() => {
    if (variant !== "embed" || !rootRef.current) return;
    const observer = new ResizeObserver(([entry]) => postToHost({ type: "asd:resize", height: Math.ceil(entry.contentRect.height) + 32 }));
    observer.observe(rootRef.current);
    postToHost({ type: "asd:ready" });
    return () => observer.disconnect();
  }, [variant]);

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const hasServices = draft.project.services.length > 0;

  const scrollToPanel = () => {
    if (variant === "embed") postToHost({ type: "asd:scroll-top" });
    else panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const goTo = (index: number) => {
    setDirection(index > stepIndex ? 1 : -1);
    setErrors({});
    setSheetOpen(false);
    setStepIndex(index);
    scrollToPanel();
  };

  const next = () => {
    const stepErrors = validateStep(draft, step.key);
    if (Object.keys(stepErrors).length) {
      setErrors(stepErrors);
      toast.error(Object.values(stepErrors)[0]);
      return;
    }
    goTo(Math.min(stepIndex + 1, STEPS.length - 1));
  };

  const submit = async () => {
    // Validate everything once more and jump to the first incomplete step.
    for (let i = 0; i < STEPS.length; i++) {
      const stepErrors = validateStep(draft, STEPS[i].key);
      if (Object.keys(stepErrors).length) {
        if (i !== stepIndex) goTo(i);
        setErrors(stepErrors);
        toast.error(Object.values(stepErrors)[0]);
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = toSubmission(draft, { meta: readAttribution(variant), _hp: honeypot || undefined, _t: startedAt.current || undefined });
      const response = await fetch("/api/v1/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 429) toast.error("لقد أرسلت عدة طلبات بالفعل — الرجاء المحاولة بعد بضع دقائق.");
        else toast.error("تعذّر إرسال طلبك. الرجاء التحقق من البيانات والمحاولة مجدداً.");
        return;
      }
      setResult({ reference: body.reference, estimate: body.estimate, name: draft.contact.name.split(" ")[0] ?? "", email: draft.contact.email });
      postToHost({ type: "asd:submitted", reference: body.reference });
      reset();
      scrollToPanel();
    } catch {
      toast.error("خطأ في الاتصال — تحقق من الإنترنت وحاول مجدداً.");
    } finally {
      setSubmitting(false);
    }
  };

  // A render function (not a nested component) so inputs keep focus across renders.
  const renderStep = () => {
    const props = { draft, update, errors };
    switch (step.key) {
      case "services":
        return <ServicesStep {...props} pricing={pricing} />;
      case "vision":
        return <VisionStep {...props} pricing={pricing} />;
      case "plan":
        return <PlanStep {...props} pricing={pricing} />;
      default:
        return <ContactStep {...props} estimate={estimate} added={scope.added} onEdit={goTo} whatsappDelivery={whatsappDelivery} />;
    }
  };

  const primaryAction = isLast ? (
    <Button size="lg" onClick={submit} loading={submitting} className="min-w-0 flex-1 sm:flex-none">
      <Send className="size-4" /> أرسل واستلم عرضي
    </Button>
  ) : (
    <Button size="lg" onClick={next} className="min-w-0 flex-1 sm:flex-none">
      متابعة <ForwardIcon className="size-4" />
    </Button>
  );

  return (
    <MotionConfig reducedMotion="user">
      <div ref={rootRef} dir="rtl" lang="ar" className={cn("relative", variant === "embed" ? "p-3 sm:p-5" : "")}>
        <AnimatePresence mode="wait">
          {result ? (
            <SuccessScreen key="success" result={result} variant={variant} onRestart={() => { setResult(null); setStepIndex(0); }} />
          ) : (
            <motion.div key="builder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -12 }} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
              <div ref={panelRef} className="glass edge-light relative scroll-mt-4 rounded-[26px] p-4 sm:rounded-[28px] sm:p-8">
                {/* Progress */}
                <nav aria-label="تقدّم الطلب" className="mb-6 sm:mb-8">
                  <ol className="flex items-center gap-1.5">
                    {STEPS.map((item, index) => (
                      <li key={item.key} className="flex-1">
                        <button
                          type="button"
                          disabled={index > stepIndex}
                          onClick={() => goTo(index)}
                          aria-current={index === stepIndex ? "step" : undefined}
                          aria-label={`الخطوة ${index + 1}: ${item.label}`}
                          className="group block w-full text-start disabled:cursor-not-allowed"
                        >
                          <span className="relative block h-1.5 overflow-hidden rounded-full bg-line/[0.08]">
                            <motion.span
                              className="absolute inset-y-0 start-0 rounded-full bg-gradient-to-l from-ember-400 to-[#e8862e]"
                              initial={false}
                              animate={{ width: index < stepIndex ? "100%" : index === stepIndex ? "50%" : "0%" }}
                              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                            />
                          </span>
                          <span
                            className={cn(
                              "mt-2 hidden text-[12px] font-semibold transition-colors sm:block",
                              index === stepIndex ? "text-ivory" : index < stepIndex ? "text-mist group-hover:text-ivory" : "text-fog/70",
                            )}
                          >
                            {item.label}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </nav>

                {restored && stepIndex === 0 ? (
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-400/40 bg-sky-100 px-4 py-3 text-[13.5px] text-navy-600">
                    <span>أهلاً بعودتك — استعدنا تفاصيل طلبك السابقة.</span>
                    <span className="flex gap-3">
                      <button type="button" onClick={dismissRestored} className="font-semibold text-navy-500 hover:text-navy-700">
                        متابعة
                      </button>
                      <button type="button" onClick={reset} className="inline-flex items-center gap-1 text-mist hover:text-ivory">
                        <RotateCcw className="size-3" /> البدء من جديد
                      </button>
                    </span>
                  </div>
                ) : null}

                <AnimatePresence mode="wait" custom={direction} initial={false}>
                  <motion.section
                    key={step.key}
                    custom={direction}
                    initial={{ opacity: 0, x: direction * -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: direction * 20 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    aria-labelledby={`step-${step.key}-title`}
                  >
                    <header className="mb-5 sm:mb-7">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[12.5px] font-semibold text-ember-300">
                          الخطوة {stepIndex + 1} من {STEPS.length}
                        </p>
                        {stepIndex > 0 ? (
                          <button type="button" onClick={() => goTo(stepIndex - 1)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] text-mist transition hover:bg-white hover:text-ivory lg:hidden">
                            <BackIcon className="size-3.5" /> رجوع
                          </button>
                        ) : null}
                      </div>
                      <h2 id={`step-${step.key}-title`} className="mt-1.5 font-display text-[25px] font-bold leading-[1.3] text-ivory sm:text-[34px]">
                        {step.title}
                      </h2>
                      <p className="mt-1 max-w-xl text-[14.5px] leading-relaxed text-mist sm:text-[15px]">{step.subtitle}</p>
                    </header>
                    {renderStep()}
                  </motion.section>
                </AnimatePresence>

                {/* Honeypot — hidden from people and assistive tech. Clipped in place (never offset
                    off-screen: in RTL a large negative "start" offset widens the page on phones). */}
                <div aria-hidden="true" className="pointer-events-none absolute left-0 top-0 h-px w-px overflow-hidden opacity-0 [clip-path:inset(50%)]">
                  <label>
                    Company website
                    <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} name="company_website" />
                  </label>
                </div>

                {/* Desktop / tablet footer — phones use the fixed bar below. */}
                <footer className="mt-8 hidden items-center justify-between gap-3 border-t border-line/[0.07] pt-6 lg:flex">
                  <Button variant="ghost" onClick={() => goTo(stepIndex - 1)} disabled={stepIndex === 0} className={cn(stepIndex === 0 && "invisible")}>
                    <BackIcon className="size-4" /> رجوع
                  </Button>
                  {primaryAction}
                </footer>
              </div>

              <div className="hidden lg:block">
                <div className="sticky top-6">
                  <Blueprint draft={draft} estimate={estimate} added={scope.added} />
                </div>
              </div>

              {/* Phones & tablets: one fixed bar with the live price and the next action, always under the thumb. */}
              <div className={cn("fixed inset-x-0 bottom-0 z-40 lg:hidden", variant === "embed" && "sticky")}>
                <AnimatePresence>
                  {sheetOpen ? (
                    <motion.div
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 16 }}
                      className="glass-strong mx-2 mb-2 max-h-[60vh] overflow-y-auto rounded-3xl p-5"
                    >
                      <BlueprintBody draft={draft} estimate={estimate} added={scope.added} />
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                <div className="glass-strong pb-safe flex items-center gap-2.5 rounded-t-3xl px-3 pt-3">
                  {stepIndex > 0 ? (
                    <button
                      type="button"
                      onClick={() => goTo(stepIndex - 1)}
                      aria-label="رجوع للخطوة السابقة"
                      className="grid size-12 shrink-0 place-items-center rounded-2xl border border-line/12 bg-white text-ivory transition active:scale-95"
                    >
                      <BackIcon className="size-5" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setSheetOpen((open) => !open)}
                    aria-expanded={sheetOpen}
                    className="flex min-w-0 shrink-0 flex-col items-start rounded-xl px-2 py-1 text-start"
                  >
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-fog">
                      السعر التقديري <ChevronUp className={cn("size-3.5 transition-transform", sheetOpen && "rotate-180")} />
                    </span>
                    <span className="text-[16px] font-bold text-ivory" dir="ltr">
                      {hasServices ? (estimate.min === estimate.max ? money(estimate.min) : `${money(estimate.min)}+`) : "—"}
                    </span>
                  </button>
                  {primaryAction}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
