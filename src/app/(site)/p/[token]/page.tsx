import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { CalendarDays, Eye, Hash, Images } from "lucide-react";
import { brand } from "@/config/brand";
import { getAdminSession } from "@/lib/auth/guard";
import { getRepository } from "@/lib/db";
import { formatDateAr as formatDate } from "@/lib/format.ar";
import { recordProposalView } from "@/lib/pipeline";
import { isProposalExpired, isShareable } from "@/lib/proposals";
import { ProposalResponse } from "@/components/proposal/ProposalResponse";
import { PlanCards, PlanChoiceProvider } from "@/components/proposal/PlanChoice";
import { withPlans } from "@/lib/pricing/resolve-plans";
import { arabicText, ProposalSummaryCard, ProposalView } from "@/components/proposal/ProposalView";
import { Logo } from "@/components/ui/Logo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "عرضك المقدَّم",
  robots: { index: false, follow: false },
};

async function load(token: string) {
  const repo = getRepository();
  const proposal = await repo.getProposalByToken(token);
  if (!proposal) return null;
  const lead = await repo.getLead(proposal.leadId);
  return lead ? { proposal: await withPlans(proposal, lead), lead } : null;
}

export default async function ProposalPortalPage({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  const data = await load(token);
  if (!data) notFound();
  const { proposal, lead } = data;
  const admin = await getAdminSession();

  if (proposal.status === "superseded") {
    return (
      <main dir="rtl" lang="ar" className="mx-auto grid min-h-screen max-w-xl place-items-center px-6 text-center">
        <div className="glass rounded-3xl p-10">
          <Logo className="justify-center" />
          <h1 className="mt-8 font-display text-3xl text-ivory">تم تحديث هذا العرض</h1>
          <p className="mt-3 text-mist">تم إصدار نسخة أحدث. الرجاء استخدام آخر رابط أرسلناه لك، أو التواصل معنا عبر {brand.contactEmail}.</p>
        </div>
      </main>
    );
  }

  const preview = !isShareable(proposal);
  if (preview && !admin) notFound();
  if (!preview && !admin) after(() => recordProposalView(proposal).catch((error) => console.error("[portal] view tracking failed", error)));

  const status = preview
    ? "preview"
    : proposal.status === "accepted"
      ? "accepted"
      : proposal.status === "declined"
        ? "declined"
        : isProposalExpired(proposal)
          ? "expired"
          : "open";

  const hasPlans = Boolean(proposal.plans?.length);
  return (
    <PlanChoiceProvider plans={proposal.plans} initial={proposal.clientResponse?.plan?.key ?? null}>
    <main dir="rtl" lang="ar" className="relative mx-auto max-w-6xl px-4 pb-24 sm:px-8">
      <header className="flex items-center justify-between py-6">
        <Logo href={brand.siteUrl} />
        <span className="flex items-center gap-2">
          <a
            href={brand.portfolioUrl}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 rounded-full border border-ember-400/40 bg-ember-400/[0.07] px-3.5 py-1.5 text-[13px] font-semibold text-ember-300 transition hover:border-ember-400/70"
          >
            <Images className="size-3.5" /> أعمالنا
          </a>
          <span className="hidden rounded-full border border-line/10 bg-line/[0.03] px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.22em] text-mist sm:inline">
            عرض خاص
          </span>
        </span>
      </header>

      {preview ? (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-iris-400/25 bg-iris-400/[0.08] px-5 py-3 text-[14px] text-iris-300">
          <Eye className="size-4 shrink-0" />
          معاينة إدارية — هذا العرض ({proposal.status}) غير مرئي للعميل حتى تتم الموافقة عليه.
        </div>
      ) : null}

      <section className="pb-10 pt-8 sm:pt-14">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-ember-300">عرض مُعد لـ {lead.contact.company ?? lead.contact.name}</p>
        <h1 className="mt-4 max-w-4xl font-display text-[30px] font-bold leading-[1.25] text-ivory sm:text-[52px]">
          <bdi>{arabicText(proposal).title}</bdi>
        </h1>
        <div className="mt-7 flex flex-wrap gap-2.5 text-[13px] text-mist">
          <span className="inline-flex items-center gap-2 rounded-full border border-line/10 bg-line/[0.03] px-3.5 py-1.5">
            <Hash className="size-3.5 text-fog" /> {lead.reference} · v{proposal.version}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-line/10 bg-line/[0.03] px-3.5 py-1.5">
            <CalendarDays className="size-3.5 text-fog" /> صدر بتاريخ {formatDate(proposal.approvedAt ?? proposal.createdAt)} · صالح حتى {formatDate(proposal.validUntil)}
          </span>
        </div>
      </section>

      {hasPlans ? (
        <div className="mb-10">
          <PlanCards plans={proposal.plans!} currency={proposal.currency} locked={status === "accepted" || status === "declined" || status === "expired"} />
        </div>
      ) : null}

      {hasPlans ? (
        <p className="mb-4 text-center text-[13.5px] text-mist">
          {proposal.plans!.length > 1 ? "التفاصيل أدناه — المراحل، التسليمات، الجدول الزمني وطريقة الدفع — للخطة الموصى بها." : "التفاصيل أدناه — المراحل، التسليمات، الجدول الزمني وطريقة الدفع."}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <ProposalView proposal={proposal} lead={lead} />
          <ProposalResponse
            token={token}
            status={status}
            clientName={lead.contact.name.split(" ")[0] ?? lead.contact.name}
            respondedName={proposal.clientResponse?.name}
            plans={proposal.plans}
            currency={proposal.currency}
            chosenPlan={proposal.clientResponse?.plan ?? null}
          />
        </div>
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <ProposalSummaryCard proposal={proposal} pdfHref={preview ? `/api/v1/proposals/${proposal.id}/pdf` : `/p/${token}/pdf`} />
          {status === "open" ? (
            <a href={hasPlans ? "#plans" : "#respond"} className="mt-3 block rounded-xl bg-gradient-to-b from-ember-400 to-ember-600 px-4 py-3 text-center text-[14px] font-semibold text-white shadow-[0_10px_40px_-12px_rgb(210_102_10/0.4)]">
              {hasPlans && proposal.plans!.length > 1 ? "اختر خطتك ووافق عليها" : "مراجعة العرض والموافقة"}
            </a>
          ) : null}
          <a
            href={brand.portfolioUrl}
            target="_blank"
            rel="noopener"
            className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-line/12 bg-white/80 px-4 py-3 text-[14px] font-semibold text-ivory transition hover:border-ember-400/50"
          >
            <Images className="size-4 text-ember-300" /> شاهد أعمالنا السابقة
          </a>
          <p className="mt-4 px-1 text-[12.5px] leading-relaxed text-fog">
            لديك سؤال حول هذا العرض؟ رد على بريدنا الإلكتروني أو راسلنا على <a className="text-mist hover:text-ivory" href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a>.
          </p>
        </aside>
      </div>
    </main>
    </PlanChoiceProvider>
  );
}
