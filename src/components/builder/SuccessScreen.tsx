"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, CalendarClock, FileText, Images, Mail, ScanSearch } from "lucide-react";
import { brand } from "@/config/brand";
import { CURRENCY } from "@/config/catalog";
import { formatRange } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import type { BuilderVariant } from "./ProjectBuilder";

export interface SubmissionResult {
  reference: string;
  name: string;
  email?: string;
  estimate?: { min: number; max: number; weeksMin: number; weeksMax: number };
}

const NEXT_STEPS = [
  { icon: ScanSearch, title: "نجهّز عرضك الآن", body: "نطابق طلبك مع باقاتنا وأسعارنا: التسليمات، المراحل، المدة والتكلفة." },
  { icon: Mail, title: "يصلك على بريدك", body: "خلال دقائق يصلك العرض بصيغة PDF مع رابط خاص لمراجعته." },
  { icon: FileText, title: "وافق وانطلق", body: "وافق على العرض بنقرة واحدة ونتواصل معك لتحديد موعد البدء." },
];

export function SuccessScreen({ result, variant, onRestart }: { result: SubmissionResult; variant: BuilderVariant; onRestart: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="glass edge-light relative mx-auto max-w-3xl overflow-hidden rounded-[28px] p-6 text-center sm:rounded-[32px] sm:p-12"
      role="status"
      aria-live="polite"
    >
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-64 w-[140%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-300/50 blur-[90px]" />

      <svg viewBox="0 0 72 72" className="relative mx-auto size-[72px]" aria-hidden>
        <motion.circle
          cx="36"
          cy="36"
          r="33"
          fill="none"
          stroke="url(#check-gradient)"
          strokeWidth="2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: "easeInOut" }}
        />
        <motion.path
          d="M23 37.5 32 46 50 27"
          fill="none"
          stroke="#0a1669"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, delay: 0.7, ease: "easeOut" }}
        />
        <defs>
          <linearGradient id="check-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#d2660a" />
            <stop offset="1" stopColor="#3464ff" />
          </linearGradient>
        </defs>
      </svg>

      <p className="relative mt-5 text-[13px] font-bold text-ember-300">تم استلام طلبك</p>
      <h2 className="relative mt-2 font-display text-[27px] font-bold leading-snug text-ivory sm:text-[38px]">
        شكراً لك{result.name ? ` ${result.name}` : ""}! <span className="text-ember-gradient">عرضك في الطريق.</span>
      </h2>
      <p className="relative mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-mist">
        سيصلك العرض بصيغة PDF على{" "}
        {result.email ? (
          <strong className="text-ivory" dir="ltr">
            {result.email}
          </strong>
        ) : (
          "بريدك الإلكتروني"
        )}{" "}
        خلال دقائق. إن لم تجده في البريد الوارد، ألقِ نظرة على مجلد الرسائل غير المرغوب فيها وانقله إلى الوارد.
      </p>

      <div className="relative mt-7 inline-flex flex-wrap items-center justify-center gap-3">
        <span dir="ltr" className="rounded-2xl border border-line/10 bg-white px-5 py-3 font-mono text-[15px] font-semibold tracking-[0.14em] text-ivory">{result.reference}</span>
        {result.estimate && result.estimate.max > 0 ? (
          <span className="rounded-2xl border border-line/10 bg-white px-5 py-3 text-[14px] text-mist">
            تقديرياً <span dir="ltr">{formatRange(result.estimate.min, result.estimate.max, CURRENCY)}</span> · {result.estimate.weeksMin}–{result.estimate.weeksMax} أسابيع
          </span>
        ) : null}
      </div>

      <ol className="relative mt-8 grid gap-3 text-start sm:grid-cols-3">
        {NEXT_STEPS.map((item, index) => (
          <motion.li
            key={item.title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 + index * 0.12, duration: 0.5 }}
            className="rounded-2xl border border-line/[0.08] bg-white/80 p-4"
          >
            <span className="flex items-center gap-2 text-[12px] font-semibold text-fog">
              <item.icon className="size-4 text-ember-300" /> {index + 1}
            </span>
            <p className="mt-1.5 text-[16px] font-bold text-ivory">{item.title}</p>
            <p className="mt-1 text-[13px] leading-snug text-mist">{item.body}</p>
          </motion.li>
        ))}
      </ol>

      <div className="relative mt-9 flex flex-wrap justify-center gap-3">
        {brand.bookingUrl ? (
          <a href={brand.bookingUrl} target="_blank" rel="noreferrer">
            <Button size="lg">
              <CalendarClock className="size-4" /> احجز مكالمة تعريفية
            </Button>
          </a>
        ) : null}
        <a href={brand.portfolioUrl} target="_blank" rel="noopener">
          <Button size="lg" variant={brand.bookingUrl ? "secondary" : "primary"}>
            <Images className="size-4" /> شاهد أعمالنا بينما نجهّز عرضك
          </Button>
        </a>
        {variant === "page" ? (
          <a href={brand.siteUrl}>
            <Button size="lg" variant="secondary">
              <ArrowUpRight className="size-4" /> العودة إلى {brand.shortName}
            </Button>
          </a>
        ) : null}
        <Button size="lg" variant="ghost" onClick={onRestart}>
          طلب مشروع آخر
        </Button>
      </div>
    </motion.div>
  );
}
