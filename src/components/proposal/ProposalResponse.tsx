"use client";

import { motion } from "framer-motion";
import { CalendarClock, CheckCircle2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { brand } from "@/config/brand";
import { formatMoney } from "@/lib/format";
import type { ProposalPlan } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/Field";
import { PlanSwitcher, usePlanChoice } from "./PlanChoice";

type Status = "open" | "accepted" | "declined" | "expired" | "preview";

export function ProposalResponse({
  token,
  status,
  clientName,
  respondedName,
  plans,
  currency = "USD",
  chosenPlan,
}: {
  token: string;
  status: Status;
  clientName: string;
  respondedName?: string | null;
  plans?: ProposalPlan[] | null;
  currency?: string;
  /** The plan picked when the client accepted. */
  chosenPlan?: { nameAr: string; price: number } | null;
}) {
  const router = useRouter();
  const { selected } = usePlanChoice();
  const selectedPlan = plans?.find((plan) => plan.key === selected) ?? null;
  const [mode, setMode] = useState<"accept" | "decline">("accept");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === "accepted") {
    return (
      <div className="glass edge-light rounded-[28px] p-7 text-center sm:p-10">
        <CheckCircle2 className="mx-auto size-10 text-success" strokeWidth={1.5} />
        <h2 className="mt-4 font-display text-[30px] tracking-tight text-ivory">تم قبول العرض — أهلاً بك معنا.</h2>
        <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-mist">
          {respondedName ? `تمت الموافقة من قبل ${respondedName}. ` : ""}سنتواصل معك قريباً لتحديد موعد الانطلاق ومشاركة الخطة التفصيلية.
        </p>
        {chosenPlan ? (
          <p className="mx-auto mt-4 inline-flex items-center gap-2 rounded-2xl border border-line/10 bg-white px-4 py-2 text-[14.5px] text-ivory">
            الخطة المختارة: <strong>{chosenPlan.nameAr}</strong> ·{" "}
            <strong dir="ltr">{formatMoney(chosenPlan.price, currency)}</strong>
          </p>
        ) : null}
        {brand.bookingUrl ? (
          <a href={brand.bookingUrl} target="_blank" rel="noreferrer" className="mt-6 inline-block">
            <Button size="lg">
              <CalendarClock className="size-4" /> احجز مكالمة الانطلاق
            </Button>
          </a>
        ) : null}
      </div>
    );
  }
  if (status === "declined") {
    return (
      <div className="glass rounded-[28px] p-7 text-center sm:p-10">
        <XCircle className="mx-auto size-9 text-mist" strokeWidth={1.5} />
        <h2 className="mt-4 font-display text-[26px] tracking-tight text-ivory">شكراً لإعلامنا.</h2>
        <p className="mx-auto mt-2 max-w-md text-[15px] text-mist">
          إذا تغير أي شيء، يسعدنا مراجعة النطاق معك — رد على بريدنا الإلكتروني أو راسلنا على {brand.contactEmail}.
        </p>
      </div>
    );
  }
  if (status === "expired") {
    return (
      <div className="glass rounded-[28px] p-7 text-center sm:p-10">
        <h2 className="font-display text-[26px] tracking-tight text-ivory">انتهت صلاحية هذا العرض</h2>
        <p className="mx-auto mt-2 max-w-md text-[15px] text-mist">قد تكون الأسعار والتوفر قد تغيرا. تواصل معنا على {brand.contactEmail} للحصول على نسخة محدثة.</p>
      </div>
    );
  }

  const submit = async () => {
    setError(null);
    if (name.trim().length < 2) return setError("الرجاء كتابة اسمك الكامل للتأكيد.");
    if (mode === "accept" && !agree) return setError("الرجاء تأكيد موافقتك على النطاق والشروط.");
    if (status === "preview") return toast.info("وضع المعاينة — سيقوم العميل بالرد من رابطه الخاص.");
    setSubmitting(true);
    try {
      const response = await fetch(`/api/v1/portal/${token}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: mode === "accept" ? "accepted" : "declined", name, note: note || null, agree, plan: selected }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body?.error?.message ?? "حدث خطأ ما — الرجاء المحاولة مجدداً.");
        return;
      }
      toast.success(mode === "accept" ? "تم قبول العرض. شكراً لك!" : "تم إرسال الرد. شكراً لك.");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.section
      id="respond"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="glass edge-light scroll-mt-8 rounded-[28px] p-6 sm:p-10"
    >
      <p className="text-[13px] font-bold text-ember-300">قرارك</p>
      <h2 className="mt-2 font-display text-[26px] font-bold leading-tight text-ivory sm:text-[34px]">هل أنت جاهز للمتابعة، {clientName}؟</h2>
      {plans?.length && mode === "accept" ? (
        <>
          <p className="mt-2 text-[14.5px] text-mist">الخطة التي تريد أن نبدأ بها:</p>
          <PlanSwitcher plans={plans} currency={currency} />
        </>
      ) : null}
      <div className="mt-6 inline-flex rounded-xl border border-line/10 bg-line/[0.03] p-1 text-[14px]">
        {(["accept", "decline"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`rounded-lg px-4 py-2 transition ${mode === value ? "bg-white font-semibold text-ivory shadow-sm" : "text-mist hover:text-ivory"}`}
          >
            {value === "accept" ? "قبول العرض" : "رفض العرض"}
          </button>
        ))}
      </div>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="respond-name">اكتب اسمك الكامل للتوقيع</Label>
          <Input id="respond-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </div>
        <div>
          <Label htmlFor="respond-note" optional="اختياري">
            {mode === "accept" ? "هل هناك ما يجب أن نعرفه قبل الانطلاق؟" : "ما الذي يمكننا فعله بشكل مختلف؟"}
          </Label>
          <Textarea id="respond-note" className="min-h-12" rows={1} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      {mode === "accept" ? (
        <label className="mt-5 flex cursor-pointer items-start gap-3 text-[14px] leading-relaxed text-mist">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 size-4 accent-[var(--color-ember-500)]" />
          {selectedPlan ? (
            <>
              أوافق على <strong className="text-ivory">{selectedPlan.nameAr}</strong> بقيمة{" "}
              <strong className="text-ivory" dir="ltr">
                {formatMoney(selectedPlan.price, currency)}
              </strong>{" "}
              كما هي موضّحة في هذا العرض، وأخوّل {brand.name} بالبدء بتحضير الانطلاق.
            </>
          ) : (
            <>أؤكد النطاق والجدول الزمني والاستثمار الموضّح في هذا العرض، وأخوّل {brand.name} بالبدء بتحضير الانطلاق.</>
          )}
        </label>
      ) : null}
      <FieldError message={error} />
      <div className="mt-7 flex flex-wrap items-center gap-3">
        <Button size="lg" variant={mode === "accept" ? "primary" : "outline"} loading={submitting} onClick={submit}>
          {mode === "accept" ? (selectedPlan ? `الموافقة على ${selectedPlan.nameAr}` : "الموافقة والتوقيع") : "إرسال الرد"}
        </Button>
        <p className="text-[12.5px] text-fog">رَدُّك يُسجَّل بالوقت ويُشارَك مع فريق {brand.shortName}.</p>
      </div>
    </motion.section>
  );
}
