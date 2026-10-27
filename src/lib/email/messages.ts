import { brand } from "@/config/brand";
import { BUDGET_MAP, CONTACT_METHODS, CURRENCY, ITEM_MAP, labelFor, PROJECT_TYPE_MAP, SERVICE_MAP, timelineLabel, type ItemKey } from "@/config/catalog";
import { SERVICE_NAMES_AR } from "@/config/catalog.ar";
import { formatDate, formatMoney, formatRange, formatWeeks } from "@/lib/format";
import { formatDateAr, formatWeeksAr } from "@/lib/format.ar";
import { leadScope } from "@/lib/pricing/scope";
import type { Lead, Proposal } from "@/lib/types";
import { callout, emailLayout, esc, factsTable, toPlainText } from "./layout";

/**
 * Every email the platform sends, as pure functions (easy to preview & test).
 * Client emails are Arabic (the Project Builder is Arabic); team alerts are
 * English, like the dashboard. Subjects are plain and specific — no ALL CAPS,
 * no emoji and no "free/offer!!!" wording in client mail — which keeps spam
 * scores low.
 */

export interface ComposedEmail {
  subject: string;
  html: string;
  text: string;
  /** Short machine name, logged with the email.sent event. */
  kind: string;
}

export interface EmailLinks {
  appUrl: string;
  admin: string;
  proposal?: string;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

function compose(kind: string, subject: string, html: string): ComposedEmail {
  return { kind, subject, html, text: toPlainText(html) };
}

function whatsappLink(phone: string | undefined, text: string): string | null {
  const digits = String(phone ?? "").replace(/[^0-9]/g, "");
  if (digits.length < 7) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/* ----------------------------------------------------------------------------
 * Team alerts (to ADMIN_NOTIFY_EMAILS, e.g. info@asdesignlb.com)
 * ------------------------------------------------------------------------- */

export function adminNewLeadEmail(lead: Lead, links: EmailLinks): ComposedEmail {
  const { contact, project, plan, estimate } = lead;
  const services = project.services.map((key) => SERVICE_MAP[key]?.name ?? key).join(", ");
  const estimateText = estimate.max > 0 ? formatRange(estimate.min, estimate.max, CURRENCY) : "—";
  const items = (Object.entries(project.items ?? {}) as [ItemKey, number][])
    .filter(([, qty]) => qty > 0)
    .map(([key, qty]) => `${ITEM_MAP[key]?.name ?? key}${qty > 1 ? ` × ${qty}` : ""}`)
    .join(", ");
  // Work the client described but didn't select — it's added to the priced scope.
  const { added } = leadScope(lead);
  const found = [...added.services.map((key) => SERVICE_MAP[key]?.name ?? key), ...added.items.map((key) => ITEM_MAP[key]?.name ?? key)];
  const foundText = found.length
    ? `${[...new Set(found)].join(", ")} — added to the proposal (from: “${added.evidence.join("”, “")}”)${added.replaced.length ? `; replaces ${added.replaced.map((key) => SERVICE_MAP[key]?.name ?? key).join(", ")}` : ""}`
    : null;
  const description = project.description.length > 900 ? `${project.description.slice(0, 900)}…` : project.description;
  const wa = contact.phone ? whatsappLink(contact.phone, `Hi ${firstName(contact.name)}, this is ${brand.owner} from ${brand.name} about your project (${lead.reference}).`) : null;

  const html = emailLayout({
    appUrl: links.appUrl,
    lang: "en",
    preheader: `${contact.name} · ${services} · ${estimateText}`,
    title: `New lead · ${contact.name}`,
    bodyHtml:
      `<p style="margin:0 0 14px">A new project brief just came in through the Project Builder. The proposal is being prepared automatically.</p>` +
      factsTable(
        [
          ["Reference", lead.reference],
          ["Name", contact.name],
          ["Email", contact.email],
          ["Phone", contact.phone ? `${contact.phone}${contact.whatsapp ? " (WhatsApp)" : ""}` : null],
          ["Company", contact.company],
          ["Country", contact.country],
          ["Services", services],
          ["Items", items || null],
          ["Found in brief", foundText],
          ["Type", project.type && project.type !== "new" ? PROJECT_TYPE_MAP[project.type]?.label ?? project.type : null],
          ["Budget", BUDGET_MAP[plan.budget]?.label ?? plan.budget],
          ["Timeline", timelineLabel(plan)],
          ["Estimate shown", estimateText],
          ["Prefers", labelFor(CONTACT_METHODS, contact.preferredContact)],
          ["Source", lead.source],
        ],
        "en",
      ) +
      `<p style="margin:0 0 6px;font-weight:bold;color:${brand.colors.navy}">Brief</p>` +
      `<p style="margin:0 0 16px;white-space:pre-line">${esc(description)}</p>`,
    buttons: [
      { label: "Open in dashboard", url: links.admin },
      { label: "Reply by email", url: `mailto:${contact.email}?subject=${encodeURIComponent(`Your project with ${brand.shortName} · ${lead.reference}`)}`, secondary: true },
      ...(wa ? [{ label: "WhatsApp", url: wa, secondary: true }] : []),
    ],
  });
  return compose("admin_new_lead", `New lead ${lead.reference}: ${contact.name} — ${services} (${estimateText})`, html);
}

/** How each channel went, for the team's "proposal sent" copy. */
export interface DeliveryReport {
  email: { ok: boolean; error?: string };
  whatsapp: { ok: boolean; to: string | null; error?: string } | null;
}

export function adminProposalSentEmail(lead: Lead, proposal: Proposal, links: EmailLinks, report?: DeliveryReport): ComposedEmail {
  const total = formatMoney(proposal.totals.total, proposal.currency);
  const channelRows: [string, string | null][] = report
    ? [
        ["Email", report.email.ok ? `Sent to ${lead.contact.email}` : `Failed — ${report.email.error ?? "unknown error"}`],
        ["WhatsApp", report.whatsapp ? (report.whatsapp.ok ? `Sent to +${report.whatsapp.to}` : `Failed — ${report.whatsapp.error ?? "unknown error"}`) : null],
      ]
    : [];
  const intro = report && !report.email.ok
    ? `The proposal reached <strong>${esc(lead.contact.name)}</strong> on WhatsApp, but the email to ${esc(lead.contact.email)} failed. The PDF is attached here.`
    : `The proposal was emailed to <strong>${esc(lead.contact.email)}</strong> with the PDF attached${report?.whatsapp?.ok ? " and sent on WhatsApp" : ""}. A copy is attached here too.`;
  const html = emailLayout({
    appUrl: links.appUrl,
    lang: "en",
    preheader: `${lead.contact.name} received ${total} — PDF copy attached`,
    title: `Proposal sent · ${lead.contact.name}`,
    bodyHtml:
      `<p style="margin:0 0 14px">${intro}</p>` +
      factsTable(
        [
          ...channelRows,
          ["Reference", lead.reference],
          ["Proposal", `${proposal.title} (v${proposal.version})`],
          ["Subtotal", formatMoney(proposal.totals.oneTimeSubtotal, proposal.currency)],
          ["Discount", proposal.totals.discountAmount > 0 ? `− ${formatMoney(proposal.totals.discountAmount, proposal.currency)} (${proposal.discount?.label ?? "discount"})` : null],
          ["Total", total],
          ["Monthly", proposal.totals.monthlyTotal > 0 ? `${formatMoney(proposal.totals.monthlyTotal, proposal.currency)}/month` : null],
          ["Timeline", formatWeeks(proposal.totals.totalWeeks)],
          ["Valid until", formatDate(proposal.validUntil)],
        ],
        "en",
      ),
    buttons: [
      { label: "Open lead", url: links.admin },
      ...(links.proposal ? [{ label: "Client view", url: links.proposal, secondary: true }] : []),
    ],
  });
  return compose("admin_proposal_sent", `Proposal sent to ${lead.contact.name} · ${total} · ${lead.reference}`, html);
}

export function adminResponseEmail(lead: Lead, proposal: Proposal, links: EmailLinks): ComposedEmail {
  const accepted = proposal.status === "accepted";
  const chosen = proposal.clientResponse?.plan ?? null;
  const total = formatMoney(chosen?.price ?? proposal.totals.total, proposal.currency);
  const note = proposal.clientResponse?.note;
  const html = emailLayout({
    appUrl: links.appUrl,
    lang: "en",
    preheader: accepted ? `${lead.contact.name} accepted ${total}` : `${lead.contact.name} declined the proposal`,
    title: accepted ? `Proposal accepted · ${lead.contact.name}` : `Proposal declined · ${lead.contact.name}`,
    bodyHtml:
      (accepted
        ? callout(`<strong>${esc(lead.contact.name)}</strong> accepted${chosen ? ` the <strong>${esc(chosen.name)}</strong> plan` : ""} — <strong>${esc(total)}</strong>. Time to plan the kickoff.`, "en")
        : `<p style="margin:0 0 14px">${esc(lead.contact.name)} declined the proposal.</p>`) +
      (note ? `<p style="margin:0 0 14px"><em>“${esc(note)}”</em></p>` : "") +
      factsTable(
        [
          ["Reference", lead.reference],
          ["Plan", chosen ? `${chosen.name} (${chosen.nameAr})` : null],
          ["Signed by", proposal.clientResponse?.name],
          ["Email", lead.contact.email],
          ["Phone", lead.contact.phone],
        ],
        "en",
      ),
    buttons: [
      { label: "Open lead", url: links.admin },
      { label: "Email the client", url: `mailto:${lead.contact.email}`, secondary: true },
    ],
  });
  return compose(accepted ? "admin_accepted" : "admin_declined", `${accepted ? "Accepted" : "Declined"}: ${lead.contact.name}${chosen ? ` · ${chosen.name} plan` : ""} · ${total} · ${lead.reference}`, html);
}

export function adminDeliveryFailedEmail(lead: Lead, proposal: Proposal | null, error: string, links: EmailLinks): ComposedEmail {
  const html = emailLayout({
    appUrl: links.appUrl,
    lang: "en",
    preheader: `Action needed for ${lead.reference}`,
    title: "Proposal could not be emailed",
    bodyHtml:
      `<p style="margin:0 0 14px">The proposal for <strong>${esc(lead.contact.name)}</strong> (${esc(lead.contact.email)}) could not be delivered after several attempts. The system will keep retrying; you can also send it from the dashboard.</p>` +
      callout(`<span style="font-family:monospace;font-size:13px">${esc(error.slice(0, 400))}</span>`, "en") +
      factsTable([["Reference", lead.reference], ["Proposal", proposal ? `${proposal.title} (v${proposal.version})` : null]], "en"),
    buttons: [{ label: "Open lead", url: links.admin }],
  });
  return compose("admin_delivery_failed", `Action needed: proposal for ${lead.contact.name} was not delivered (${lead.reference})`, html);
}

/* ----------------------------------------------------------------------------
 * Client emails (Arabic)
 * ------------------------------------------------------------------------- */

export function clientAcknowledgementEmail(lead: Lead, links: EmailLinks): ComposedEmail {
  const first = firstName(lead.contact.name);
  const services = lead.project.services.map((key) => SERVICE_NAMES_AR[key] ?? key).join("، ");
  const html = emailLayout({
    appUrl: links.appUrl,
    lang: "ar",
    preheader: `استلمنا تفاصيل مشروعك — الرقم المرجعي ${lead.reference}`,
    title: `شكراً ${first}، وصلتنا تفاصيل مشروعك`,
    bodyHtml:
      `<p style="margin:0 0 14px">نعمل الآن على تجهيز عرض مفصّل لمشروعك، وسيصلك على هذا البريد بصيغة PDF.</p>` +
      factsTable(
        [
          ["الرقم المرجعي", lead.reference],
          ["الخدمات", services],
          ["التقدير المبدئي", lead.estimate.max > 0 ? formatRange(lead.estimate.min, lead.estimate.max, CURRENCY) : null],
        ],
        "ar",
      ) +
      `<p style="margin:0 0 14px">إذا كانت لديك أي إضافة أو سؤال، يكفي أن تردّ على هذا البريد.</p>`,
  });
  return compose("client_acknowledgement", `وصلتنا تفاصيل مشروعك · ${lead.reference}`, html);
}

function plansTable(proposal: Proposal): string {
  const plans = proposal.plans ?? [];
  if (!plans.length) return "";
  const C = brand.colors;
  const rows = plans
    .map((plan) => {
      const weeks = plan.weeksMin === plan.weeksMax ? `${plan.weeksMin}` : `${plan.weeksMin}–${plan.weeksMax}`;
      const was = plan.listPrice > plan.price ? `<br><span style="font-size:12px;color:${C.mist};text-decoration:line-through">${esc(formatMoney(plan.listPrice, proposal.currency))}</span>` : "";
      const badge = plan.recommended ? ` <span style="display:inline-block;background:${C.ember};color:#ffffff;font-size:11px;line-height:16px;padding:1px 8px;border-radius:8px">الأنسب لك</span>` : "";
      const bg = plan.recommended ? "#fff7ef" : "#ffffff";
      return `<tr><td style="padding:12px 14px;border-bottom:1px solid ${C.line};background:${bg};text-align:right"><strong style="color:${C.navy};font-size:15px">${esc(plan.nameAr)}</strong>${badge}<br><span style="font-size:12.5px;color:${C.mist}">${esc(plan.summaryAr)} · ${esc(weeks)} أسابيع</span></td><td dir="ltr" style="padding:12px 14px;border-bottom:1px solid ${C.line};background:${bg};text-align:left;white-space:nowrap"><strong style="color:${C.navy};font-size:17px">${esc(formatMoney(plan.price, proposal.currency))}</strong>${was}</td></tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px;border:1px solid ${C.line};border-radius:12px;border-collapse:separate;overflow:hidden">${rows}</table>`;
}

export function clientProposalEmail(lead: Lead, proposal: Proposal, links: EmailLinks & { proposal: string }): ComposedEmail {
  const first = firstName(lead.contact.name);
  const total = formatMoney(proposal.totals.total, proposal.currency);
  const plans = proposal.plans ?? [];
  if (plans.length > 1) {
    const from = formatMoney(Math.min(...plans.map((plan) => plan.price)), proposal.currency);
    const count = plans.length === 2 ? "خطتين" : `${plans.length} خطط`;
    const html = emailLayout({
      appUrl: links.appUrl,
      lang: "ar",
      preheader: `${count} لمشروعك تبدأ من ${from} — اختر الأنسب لك`,
      title: `أهلاً ${first}، خطط مشروعك جاهزة`,
      bodyHtml:
        `<p style="margin:0 0 14px">شكراً لثقتك بنا. درسنا طلبك وجهّزنا لك <strong>${count}</strong> بأسعار واضحة، وكل خطة موضّح فيها بالتفصيل ما تشمله. <strong>العرض الكامل (PDF) مرفق بهذا البريد.</strong></p>` +
        plansTable(proposal) +
        `<p style="margin:0 0 6px">اختر الخطة التي تريد أن نبدأ بها ووافق عليها أونلاين بخطوة واحدة:</p>`,
      buttons: [
        { label: "اختر خطتك", url: `${links.proposal}#plans` },
        { label: "شاهد أعمالنا", url: brand.portfolioUrl, secondary: true },
      ],
      footnoteHtml:
        `العرض صالح حتى ${esc(formatDateAr(proposal.validUntil))} · الرقم المرجعي ${esc(lead.reference)}<br>` +
        `لديك سؤال أو تودّ تعديل شيء؟ ردّ على هذا البريد مباشرة${brand.whatsappNumber ? ` أو راسلنا على واتساب <a href="https://wa.me/${esc(brand.whatsappNumber.replace(/[^0-9]/g, ""))}" style="color:${brand.colors.ember}">${esc(brand.phoneDisplay ?? brand.whatsappNumber)}</a>` : ""}.<br>` +
        `<span dir="ltr" style="color:${brand.colors.mist}">Your proposal (${esc(lead.reference)}) with ${plans.length} plans is attached as a PDF.</span>`,
    });
    return compose("client_proposal", `خطط مشروعك جاهزة · ${lead.reference}`, html);
  }
  const saving =
    proposal.totals.discountAmount > 0
      ? `<br><span style="font-size:13px;color:${brand.colors.mist}">شامل خصم ${esc(formatMoney(proposal.totals.discountAmount, proposal.currency))} (السعر قبل الخصم ${esc(formatMoney(proposal.totals.oneTimeSubtotal, proposal.currency))})</span>`
      : "";
  const monthly =
    proposal.totals.monthlyTotal > 0
      ? `<br><span style="font-size:13px;color:${brand.colors.mist}">+ ${esc(formatMoney(proposal.totals.monthlyTotal, proposal.currency))} شهرياً للخدمات المستمرة</span>`
      : "";
  const html = emailLayout({
    appUrl: links.appUrl,
    lang: "ar",
    preheader: `عرضك جاهز: ${total} · مدة التنفيذ ${formatWeeksAr(proposal.totals.totalWeeks)}`,
    title: `أهلاً ${first}، عرضك جاهز`,
    bodyHtml:
      `<p style="margin:0 0 14px">شكراً لثقتك بنا. جهّزنا لك عرضاً مفصّلاً لمشروعك يشمل نطاق العمل والمراحل والجدول الزمني والتكلفة. <strong>ملف العرض (PDF) مرفق بهذا البريد.</strong></p>` +
      callout(`الاستثمار الإجمالي: <strong style="font-size:20px">${esc(total)}</strong>${saving}${monthly}`, "ar") +
      factsTable(
        [
          ["المشروع", proposal.translations?.ar?.title || proposal.title],
          ["مدة التنفيذ", formatWeeksAr(proposal.totals.totalWeeks)],
          ["صالح حتى", formatDateAr(proposal.validUntil)],
          ["الرقم المرجعي", lead.reference],
        ],
        "ar",
      ) +
      `<p style="margin:0 0 6px">يمكنك مراجعة العرض أونلاين والموافقة عليه بنقرة واحدة من الرابط الخاص بك:</p>`,
    buttons: [
      { label: "راجع العرض ووافق عليه", url: links.proposal },
      { label: "شاهد أعمالنا", url: brand.portfolioUrl, secondary: true },
    ],
    footnoteHtml:
      `لديك سؤال أو تودّ تعديل شيء؟ ردّ على هذا البريد مباشرة${brand.whatsappNumber ? ` أو راسلنا على واتساب <a href="https://wa.me/${esc(brand.whatsappNumber.replace(/[^0-9]/g, ""))}" style="color:${brand.colors.ember}">${esc(brand.phoneDisplay ?? brand.whatsappNumber)}</a>` : ""}.<br>` +
      `<span dir="ltr" style="color:${brand.colors.mist}">Your proposal (${esc(lead.reference)}) is attached as a PDF.</span>`,
  });
  return compose("client_proposal", `عرض السعر لمشروعك جاهز · ${lead.reference}`, html);
}

export function clientWelcomeEmail(lead: Lead, proposal: Proposal, links: EmailLinks & { proposal: string }): ComposedEmail {
  const first = firstName(lead.contact.name);
  const firstPayment = proposal.paymentSchedule[0];
  const html = emailLayout({
    appUrl: links.appUrl,
    lang: "ar",
    preheader: "شكراً لموافقتك — هذه الخطوات التالية",
    title: `أهلاً بك معنا يا ${first}`,
    bodyHtml:
      `<p style="margin:0 0 14px">سعداء جداً بالعمل معك على <strong>${esc(proposal.translations?.ar?.title || proposal.title)}</strong>. تم تسجيل موافقتك على العرض.</p>` +
      (proposal.clientResponse?.plan
        ? callout(`الخطة المختارة: <strong>${esc(proposal.clientResponse.plan.nameAr)}</strong> · <strong dir="ltr">${esc(formatMoney(proposal.clientResponse.plan.price, proposal.currency))}</strong>`, "ar")
        : "") +
      `<p style="margin:0 0 8px;font-weight:bold;color:${brand.colors.navy}">الخطوات التالية:</p>` +
      `<ol style="margin:0 0 16px;padding-right:20px;padding-left:0">` +
      `<li style="margin:0 0 6px">سنتواصل معك خلال يوم عمل لتحديد موعد جلسة الانطلاق.</li>` +
      `<li style="margin:0 0 6px">نرسل لك فاتورة الدفعة الأولى${firstPayment ? ` (${esc(firstPayment.percent)}%)` : ""}.</li>` +
      `<li style="margin:0 0 6px">جهّز الشعار والمحتوى والصور المتوفرة لديك لنبدأ مباشرة.</li>` +
      `</ol>`,
    buttons: [
      ...(brand.bookingUrl ? [{ label: "احجز موعد الانطلاق", url: brand.bookingUrl }] : []),
      { label: "عرض العرض الموقّع", url: links.proposal, secondary: Boolean(brand.bookingUrl) },
    ],
  });
  return compose("client_welcome", `أهلاً بك معنا · ${lead.reference}`, html);
}

