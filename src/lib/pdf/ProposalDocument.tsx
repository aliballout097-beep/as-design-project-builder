import { readFileSync } from "node:fs";
import path from "node:path";
import {
  Defs,
  Document,
  Image,
  LinearGradient,
  Link,
  Page,
  RadialGradient,
  Rect,
  Stop,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import { brand } from "@/config/brand";
import { formatDate, formatMoney, formatWeeks } from "@/lib/format";
import { paymentBreakdown, phaseOffsets } from "@/lib/proposals";
import type { Lead, Proposal, ProposalArabicText } from "@/lib/types";
import type { PdfFonts } from "./render";

const publicFile = (webPath: string) => path.join(process.cwd(), "public", webPath.replace(/^\//, ""));
/** The AM logo: the full lockup (AM + ALI MAWLA) on the cover, the AM mark on every page header. */
// Passed as bytes (not paths): react-pdf mis-reads Windows drive paths as URLs.
const readImage = (webPath: string) => {
  try {
    return { data: readFileSync(publicFile(webPath)), format: "png" as const };
  } catch {
    return null;
  }
};
const LOCKUP = readImage(brand.logoFullPath);
const MARK = readImage(brand.logoPath);

/**
 * The client-facing proposal PDF (A4). Rendered on the server with
 * @react-pdf/renderer — see `render.tsx` for font registration.
 *
 * Bilingual: when `arabic` + `fonts.arabic` are both available, each section
 * shows its Arabic translation first, then the original English underneath.
 * Otherwise the PDF renders English-only (no error — see `translate.ts`).
 */

export interface ProposalDocumentProps {
  proposal: Proposal;
  lead: Lead;
  shareUrl: string;
  fonts: PdfFonts;
  arabic?: ProposalArabicText | null;
}

/** A4 in PDF points — the cover art must not exceed the page or it spills onto its own page. */
const A4 = { width: 595.28, height: 841.89 };

/** The AM logo palette: navy (A), orange (M) and the sky gradient of AM.jpeg. */
const C = {
  ink: brand.colors.navy,
  body: "#26336e",
  paper: brand.colors.paper,
  line: brand.colors.line,
  muted: brand.colors.mist,
  tint: "#f2f8ff",
  ivory: "#ffffff",
  mist: "#c9d6f5",
  ember: brand.colors.ember,
  emberDeep: brand.colors.emberDeep,
  navy: brand.colors.navy,
  skyTop: brand.colors.skyTop,
  skyMid: brand.colors.skyMid,
  skyBottom: brand.colors.skyBottom,
};

function createStyles(fonts: ProposalDocumentProps["fonts"]) {
  return StyleSheet.create({
    cover: { backgroundColor: C.skyTop, color: C.navy, fontFamily: fonts.sans, padding: 0 },
    coverInner: { flex: 1, paddingHorizontal: 56, paddingTop: 70, paddingBottom: 52, justifyContent: "space-between" },
    coverLogo: { width: 190, alignSelf: "center" },
    brandName: { fontSize: 8.5, letterSpacing: 2.4, color: C.navy, textTransform: "uppercase", textAlign: "center", marginTop: 10 },
    eyebrow: { fontSize: 8.5, letterSpacing: 2.2, color: C.emberDeep, textTransform: "uppercase", marginBottom: 12, fontWeight: 700 },
    coverTitle: { fontFamily: fonts.display, fontSize: 32, lineHeight: 1.15, color: C.navy, maxWidth: 460 },
    coverFor: { marginTop: 14, fontSize: 11, color: C.body },
    metaGrid: { flexDirection: "row", flexWrap: "wrap", backgroundColor: "#ffffff", borderRadius: 12, paddingVertical: 16, paddingHorizontal: 18 },
    metaCell: { width: "20%", paddingRight: 8 },
    metaLabel: { fontSize: 6.5, letterSpacing: 1.4, color: C.muted, textTransform: "uppercase", marginBottom: 5 },
    metaValue: { fontSize: 10.5, color: C.navy, fontWeight: 600 },

    page: { backgroundColor: C.paper, color: C.ink, fontFamily: fonts.sans, fontSize: 9.5, paddingTop: 62, paddingBottom: 64, paddingHorizontal: 56, lineHeight: 1.5 },
    header: { position: "absolute", top: 20, left: 56, right: 56, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 2, borderBottomColor: C.ember, paddingBottom: 6 },
    headerBrand: { flexDirection: "row", alignItems: "center", gap: 7 },
    headerMark: { width: 30, height: 16.6 },
    headerText: { fontSize: 7, letterSpacing: 1.6, color: C.muted, textTransform: "uppercase" },
    footer: { position: "absolute", top: A4.height - 46, left: 56, right: 56, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 },
    footerText: { fontSize: 7, color: C.muted },

    section: { marginBottom: 26 },
    sectionLabel: { fontSize: 7.5, letterSpacing: 1.8, color: C.ember, textTransform: "uppercase", marginBottom: 6 },
    sectionTitle: { fontFamily: fonts.display, fontSize: 19, marginBottom: 10, color: C.ink },
    paragraph: { fontSize: 10, color: C.body, marginBottom: 8, lineHeight: 1.6 },

    // Arabic (bilingual sections) — right-aligned, Cairo, shown above the English text.
    sectionTitleAr: { fontFamily: fonts.arabic ?? fonts.display, fontSize: 15, marginBottom: 8, color: C.ink, textAlign: "right" },
    paragraphAr: { fontFamily: fonts.arabic ?? fonts.sans, fontSize: 10, color: C.body, marginBottom: 8, lineHeight: 1.9, textAlign: "right" },
    rowTitleAr: { fontFamily: fonts.arabic ?? fonts.sans, fontSize: 10, fontWeight: 600, color: C.ink, textAlign: "right", marginBottom: 1 },
    rowDescriptionAr: { fontFamily: fonts.arabic ?? fonts.sans, fontSize: 8.5, color: C.muted, textAlign: "right", marginBottom: 3 },
    phaseNameAr: { fontFamily: fonts.arabic ?? fonts.display, fontSize: 12, textAlign: "right" },
    bulletTextAr: { fontFamily: fonts.arabic ?? fonts.sans, flex: 1, fontSize: 9.5, color: C.body, textAlign: "right" },
    arDivider: { borderTopWidth: 1, borderTopColor: C.line, borderStyle: "dashed", marginVertical: 6 },

    phaseBlock: { marginBottom: 14 },
    phaseHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", borderBottomWidth: 1, borderBottomColor: C.ink, paddingBottom: 4, marginBottom: 2 },
    phaseName: { fontFamily: fonts.display, fontSize: 12 },
    phaseWeeks: { fontSize: 8, color: C.muted, letterSpacing: 1, textTransform: "uppercase" },
    row: { flexDirection: "row", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.line },
    rowMain: { flex: 1, paddingRight: 16 },
    rowTitle: { fontSize: 10, fontWeight: 600, color: C.ink },
    rowDescription: { fontSize: 8.5, color: C.muted, marginTop: 2 },
    rowPrice: { width: 90, textAlign: "right", fontSize: 10 },
    tag: { fontSize: 6.5, letterSpacing: 1, textTransform: "uppercase", color: C.ember, marginTop: 3 },

    ganttRow: { flexDirection: "row", alignItems: "center", marginBottom: 7 },
    ganttLabel: { width: 130, fontSize: 8.5, color: C.body },
    ganttTrack: { flex: 1, height: 12, backgroundColor: "#e6f1ff", borderRadius: 6, position: "relative" },
    ganttBar: { position: "absolute", top: 0, height: 12, borderRadius: 6, backgroundColor: C.ember },
    ganttWeeks: { width: 58, textAlign: "right", fontSize: 8, color: C.muted },

    totalsCard: { backgroundColor: C.navy, color: C.ivory, borderRadius: 12, padding: 20, marginTop: 4, borderLeftWidth: 5, borderLeftColor: C.ember },
    totalsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
    totalsLabel: { fontSize: 9, color: C.mist },
    totalsValue: { fontSize: 9.5, color: C.ivory },
    totalsBig: { fontFamily: fonts.display, fontSize: 28, color: C.ivory, marginTop: 6 },
    scheduleRow: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line },

    bullet: { flexDirection: "row", marginBottom: 5 },
    bulletMark: { width: 14, color: C.ember },
    bulletText: { flex: 1, fontSize: 9.5, color: C.body },
    acceptBox: { borderWidth: 1, borderColor: C.line, backgroundColor: C.tint, borderRadius: 12, padding: 18, marginTop: 8, borderLeftWidth: 5, borderLeftColor: C.ember },
    acceptLink: { color: C.ember, textDecoration: "none", fontSize: 10 },

    // Plans (side-by-side cards)
    plansRow: { flexDirection: "row", gap: 8, marginTop: 4 },
    planCard: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 11, backgroundColor: "#ffffff" },
    planCardRecommended: { borderColor: C.ember, borderWidth: 2, backgroundColor: C.tint },
    planTagBox: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.ember, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginBottom: 8 },
    planTag: { color: "#ffffff", fontSize: 6.5, letterSpacing: 1, textTransform: "uppercase", lineHeight: 1.2 },
    planTagAr: { fontFamily: fonts.arabic ?? fonts.sans, color: "#ffffff", fontSize: 7.5, fontWeight: 700, lineHeight: 1.2 },
    planNameAr: { fontFamily: fonts.arabic ?? fonts.sans, fontSize: 11, fontWeight: 700, color: C.navy, textAlign: "right", lineHeight: 1.5 },
    planName: { fontSize: 8, letterSpacing: 1.2, textTransform: "uppercase", color: C.muted, marginTop: 3, lineHeight: 1.2 },
    planPrice: { fontFamily: fonts.display, fontSize: 22, lineHeight: 1.15, color: C.navy, marginTop: 8 },
    planList: { fontSize: 8, lineHeight: 1.3, color: C.muted, textDecoration: "line-through", marginTop: 3 },
    planSave: { fontSize: 7.5, color: "#15803d", marginTop: 2, fontWeight: 600 },
    planWeeks: { fontSize: 7.5, color: C.muted, marginTop: 4, marginBottom: 6 },
    planDivider: { borderTopWidth: 1, borderTopColor: C.line, marginBottom: 5 },
    planBulletAr: { fontFamily: fonts.arabic ?? fonts.sans, fontSize: 7.6, color: C.body, textAlign: "right", marginBottom: 2.5, lineHeight: 1.5 },
    planBullet: { fontSize: 7.4, color: C.body, marginBottom: 2.5, lineHeight: 1.4 },
    planHeadingAr: { fontFamily: fonts.arabic ?? fonts.sans, fontSize: 7.8, fontWeight: 700, color: C.navy, textAlign: "right", marginTop: 3, marginBottom: 2 },
    chooseBox: { marginTop: 12, backgroundColor: C.navy, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    chooseTitleAr: { fontFamily: fonts.arabic ?? fonts.sans, fontSize: 11, fontWeight: 700, color: "#ffffff", textAlign: "right" },
    chooseTitle: { fontSize: 8.5, color: C.mist, marginTop: 2 },
    chooseLink: { backgroundColor: C.ember, color: "#ffffff", fontFamily: fonts.arabic ?? fonts.sans, fontSize: 10, fontWeight: 700, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7, textDecoration: "none" },
  });
}

type Styles = ReturnType<typeof createStyles>;

function Section({ index, label, title, styles, children }: { index: number; label: string; title: string; styles: Styles; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View wrap={false}>
        <Text style={styles.sectionLabel}>{`${String(index).padStart(2, "0")} — ${label}`}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Paragraphs({ text, styles }: { text: string; styles: Styles }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((paragraph, i) => (
          <Text key={i} style={styles.paragraph}>
            {paragraph}
          </Text>
        ))}
    </>
  );
}

function ArabicParagraphs({ text, styles }: { text: string; styles: Styles }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((paragraph, i) => (
          <Text key={i} style={styles.paragraphAr}>
            {paragraph}
          </Text>
        ))}
    </>
  );
}

export function ProposalDocument({ proposal, lead, shareUrl, fonts, arabic }: ProposalDocumentProps) {
  const styles = createStyles(fonts);
  const plans = proposal.plans ?? [];
  const recommendedPlan = plans.find((plan) => plan.recommended) ?? null;
  const money = (value: number) => formatMoney(value, proposal.currency);
  const client = lead.contact.company ?? lead.contact.name;
  const included = proposal.lineItems.filter((item) => item.included);
  const optional = proposal.lineItems.filter((item) => !item.included);
  // Only render Arabic when both the translation and a shaping-capable font are available.
  const ar = fonts.arabic ? arabic : null;
  const arLineItem = (item: (typeof proposal.lineItems)[number]) =>
    ar ? ar.lineItems[proposal.lineItems.indexOf(item)] : null;
  const arPhase = (phase: (typeof proposal.phases)[number]) => (ar ? ar.phases[proposal.phases.indexOf(phase)] : null);
  const totalWeeks = Math.max(proposal.totals.totalWeeks, 0.5);
  const schedule = paymentBreakdown(proposal.totals.total, proposal.paymentSchedule);
  const gantt = phaseOffsets(proposal.phases);
  const sections = { next: 0 };
  const nextSection = () => ++sections.next;

  const chrome = (
    <>
      <View style={styles.header} fixed>
        <View style={styles.headerBrand}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image is a PDF primitive, not an HTML <img>; it has no alt prop */}
          {MARK ? <Image style={styles.headerMark} src={MARK} /> : null}
          <Text style={styles.headerText}>{`${brand.wordmark} · ${brand.name}`}</Text>
        </View>
        <Text style={styles.headerText}>{`Proposal · ${lead.reference}`}</Text>
      </View>
      <View style={styles.footer} fixed>
        <Text style={styles.footerText}>{`${proposal.title} · v${proposal.version}`}</Text>
        <Text style={styles.footerText}>{[brand.contactEmail, brand.phoneDisplay].filter(Boolean).join("  ·  ")}</Text>
        <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </View>
    </>
  );

  return (
    <Document title={`${proposal.title} — ${brand.name}`} author={brand.name} subject={`Proposal ${lead.reference}`} creator={brand.name}>
      {/* Cover */}
      <Page size="A4" style={styles.cover}>
        <Svg style={{ position: "absolute", top: 0, left: 0 }} width={A4.width} height={A4.height} fixed>
          <Defs>
            <LinearGradient id="sky" x1="0" y1="0" x2="0.25" y2="1">
              <Stop offset="0" stopColor={C.skyTop} />
              <Stop offset="0.55" stopColor={C.skyMid} />
              <Stop offset="1" stopColor={C.skyBottom} />
            </LinearGradient>
            <RadialGradient id="glow" cx="0.5" cy="0.18" r="0.5">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={0.55} />
              <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={A4.width} height={A4.height} fill="url(#sky)" />
          <Rect x={0} y={0} width={A4.width} height={A4.height} fill="url(#glow)" />
        </Svg>
        <View style={styles.coverInner}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image is a PDF primitive, not an HTML <img>; it has no alt prop */}
            {LOCKUP ? <Image style={styles.coverLogo} src={LOCKUP} /> : null}
            <Text style={styles.brandName}>{brand.name}</Text>
          </View>
          <View>
            <Text style={styles.eyebrow}>Project proposal</Text>
            <Text style={styles.coverTitle}>{proposal.title}</Text>
            <Text style={styles.coverFor}>{`Prepared for ${lead.contact.name}${lead.contact.company ? ` · ${lead.contact.company}` : ""}`}</Text>
          </View>
          <View style={styles.metaGrid}>
            {[
              ["Reference", lead.reference],
              ["Issued", formatDate(proposal.approvedAt ?? proposal.createdAt)],
              ["Valid until", formatDate(proposal.validUntil)],
              plans.length > 1
                ? ["Plans from", money(Math.min(...plans.map((plan) => plan.price)))]
                : ["Investment", money(plans[0]?.price ?? proposal.totals.total)],
              ["Timeline", formatWeeks(proposal.totals.totalWeeks)],
            ].map(([label, value]) => (
              <View key={label} style={styles.metaCell}>
                <Text style={styles.metaLabel}>{label}</Text>
                <Text style={styles.metaValue}>{value}</Text>
              </View>
            ))}
          </View>
        </View>
      </Page>

      {/* Body */}
      <Page size="A4" style={styles.page} wrap>
        {chrome}

        <Section index={nextSection()} label="Executive summary" title={`Hello ${client},`} styles={styles}>
          {ar ? (
            <>
              <Text style={styles.sectionTitleAr}>{`مرحباً ${client}،`}</Text>
              <ArabicParagraphs text={ar.executiveSummary} styles={styles} />
              <View style={styles.arDivider} />
            </>
          ) : null}
          <Paragraphs text={proposal.executiveSummary} styles={styles} />
        </Section>

        {plans.length ? (
          <Section
            index={nextSection()}
            label={plans.length > 1 ? "Your plans" : "Your quote"}
            title={plans.length > 1 ? "Choose the plan that fits you" : "One clear, final price"}
            styles={styles}
          >
            {fonts.arabic ? (
              <Text style={styles.sectionTitleAr}>{plans.length > 1 ? "اختر الخطة المناسبة لك — كل خطة بسعرها النهائي" : "عرض السعر — سعر نهائي واضح لكل ما طلبته"}</Text>
            ) : null}
            <View style={styles.plansRow} wrap={false}>
              {plans.map((plan) => (
                <View key={plan.key} style={plan.recommended ? [styles.planCard, styles.planCardRecommended] : styles.planCard}>
                  {plan.recommended && plans.length > 1 ? (
                    <View style={styles.planTagBox}>
                      <Text style={styles.planTag}>Recommended</Text>
                      {fonts.arabic ? <Text style={styles.planTagAr}>الأنسب لك</Text> : null}
                    </View>
                  ) : null}
                  {fonts.arabic ? <Text style={styles.planNameAr}>{plan.nameAr}</Text> : null}
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planPrice}>{money(plan.price)}</Text>
                  {plan.listPrice > plan.price ? (
                    <>
                      <Text style={styles.planList}>{money(plan.listPrice)}</Text>
                      <Text style={styles.planSave}>{`You save ${money(plan.listPrice - plan.price)}`}</Text>
                    </>
                  ) : null}
                  <Text style={styles.planWeeks}>{`${plan.weeksMin === plan.weeksMax ? plan.weeksMin : `${plan.weeksMin}–${plan.weeksMax}`} weeks`}</Text>
                  <View style={styles.planDivider} />
                  {plan.includes.map((row, index) =>
                    fonts.arabic ? (
                      <Text key={index} style={row.heading ? styles.planHeadingAr : styles.planBulletAr}>
                        {row.heading ? row.ar : `• ${row.ar}`}
                      </Text>
                    ) : (
                      <Text key={index} style={row.heading ? [styles.planBullet, { fontWeight: 700 }] : styles.planBullet}>
                        {row.heading ? row.en : `• ${row.en}`}
                      </Text>
                    ),
                  )}
                </View>
              ))}
            </View>
            <View style={styles.chooseBox} wrap={false}>
              <View style={{ flex: 1 }}>
                {fonts.arabic ? (
                  <Text style={styles.chooseTitleAr}>{plans.length > 1 ? "اختر خطتك ووافق عليها أونلاين بخطوة واحدة" : "وافق على العرض أونلاين بخطوة واحدة"}</Text>
                ) : null}
                <Text style={styles.chooseTitle}>{plans.length > 1 ? "Pick your plan and approve it online in one step." : "Approve your quote online in one step."}</Text>
              </View>
              <Link src={`${shareUrl}#plans`} style={styles.chooseLink}>
                {fonts.arabic ? (plans.length > 1 ? "اختر خطتك" : "وافق على العرض") : plans.length > 1 ? "Choose your plan" : "Approve online"}
              </Link>
            </View>
            <Link src={brand.portfolioUrl} style={[styles.paragraph, { marginTop: 8, fontSize: 9, color: C.ember, textDecoration: "none" }]}>
              {`See our work → ${brand.portfolioUrl.replace(/^https?:\/\//, "")}`}
            </Link>
            {recommendedPlan && plans.length > 1 ? (
              <Text style={[styles.paragraph, { marginTop: 10, fontSize: 8.5, color: C.muted }]}>
                {`The scope, timeline and payment schedule below describe the recommended plan (${recommendedPlan.name}).`}
              </Text>
            ) : null}
          </Section>
        ) : null}

        {proposal.approach ? (
          <Section index={nextSection()} label="Our approach" title="How we'll work together" styles={styles}>
            {ar ? (
              <>
                <Text style={styles.sectionTitleAr}>كيف سنعمل معاً</Text>
                <ArabicParagraphs text={ar.approach} styles={styles} />
                <View style={styles.arDivider} />
              </>
            ) : null}
            <Paragraphs text={proposal.approach} styles={styles} />
          </Section>
        ) : null}

        <Section index={nextSection()} label="Scope" title="Deliverables" styles={styles}>
          {proposal.phases.map((phase) => {
            const items = included.filter((item) => item.phase === phase.name);
            if (!items.length) return null;
            const phaseAr = arPhase(phase);
            return (
              <View key={phase.id} style={styles.phaseBlock}>
                <View style={styles.phaseHeader} wrap={false}>
                  {phaseAr ? <Text style={styles.phaseNameAr}>{phaseAr.name}</Text> : <Text style={styles.phaseName}>{phase.name}</Text>}
                  <Text style={styles.phaseWeeks}>{formatWeeks(phase.weeks)}</Text>
                </View>
                {phaseAr ? <Text style={[styles.phaseName, { marginTop: 2 }]}>{phase.name}</Text> : null}
                {items.map((item) => {
                  const itemAr = arLineItem(item);
                  return (
                    <View key={item.id} style={styles.row} wrap={false}>
                      <View style={styles.rowMain}>
                        {itemAr ? (
                          <>
                            <Text style={styles.rowTitleAr}>{itemAr.title}</Text>
                            {itemAr.description ? <Text style={styles.rowDescriptionAr}>{itemAr.description}</Text> : null}
                          </>
                        ) : null}
                        <Text style={styles.rowTitle}>{item.title}</Text>
                        {item.description ? <Text style={styles.rowDescription}>{item.description}</Text> : null}
                      </View>
                      <Text style={styles.rowPrice}>{item.billing === "monthly" ? `${money(item.price)}/mo` : money(item.price)}</Text>
                    </View>
                  );
                })}
              </View>
            );
          })}
          {included.filter((item) => !proposal.phases.some((p) => p.name === item.phase)).map((item) => {
            const itemAr = arLineItem(item);
            return (
              <View key={item.id} style={styles.row} wrap={false}>
                <View style={styles.rowMain}>
                  {itemAr ? (
                    <>
                      <Text style={styles.rowTitleAr}>{itemAr.title}</Text>
                      {itemAr.description ? <Text style={styles.rowDescriptionAr}>{itemAr.description}</Text> : null}
                    </>
                  ) : null}
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  {item.description ? <Text style={styles.rowDescription}>{item.description}</Text> : null}
                </View>
                <Text style={styles.rowPrice}>{item.billing === "monthly" ? `${money(item.price)}/mo` : money(item.price)}</Text>
              </View>
            );
          })}
          {optional.length ? (
            <View style={{ marginTop: 10 }}>
              <View style={styles.phaseHeader} wrap={false}>
                <Text style={styles.phaseName}>Optional add-ons</Text>
                <Text style={styles.phaseWeeks}>Not included in total</Text>
              </View>
              {optional.map((item) => {
                const itemAr = arLineItem(item);
                return (
                  <View key={item.id} style={styles.row} wrap={false}>
                    <View style={styles.rowMain}>
                      {itemAr ? (
                        <>
                          <Text style={styles.rowTitleAr}>{itemAr.title}</Text>
                          {itemAr.description ? <Text style={styles.rowDescriptionAr}>{itemAr.description}</Text> : null}
                        </>
                      ) : null}
                      <Text style={styles.rowTitle}>{item.title}</Text>
                      {item.description ? <Text style={styles.rowDescription}>{item.description}</Text> : null}
                      <Text style={styles.tag}>Optional</Text>
                    </View>
                    <Text style={styles.rowPrice}>{item.billing === "monthly" ? `${money(item.price)}/mo` : money(item.price)}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </Section>

        <Section index={nextSection()} label="Timeline" title={`${formatWeeks(proposal.totals.totalWeeks)} from kickoff to launch`} styles={styles}>
          <View wrap={false}>
            {gantt.map((phase) => (
              <View key={phase.id} style={styles.ganttRow}>
                <Text style={styles.ganttLabel}>{phase.name}</Text>
                <View style={styles.ganttTrack}>
                  <View
                    style={[
                      styles.ganttBar,
                      { left: `${(phase.start / totalWeeks) * 100}%`, width: `${Math.max((phase.weeks / totalWeeks) * 100, 3)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.ganttWeeks}>{formatWeeks(phase.weeks)}</Text>
              </View>
            ))}
          </View>
          {proposal.phases.map((phase) => {
            if (!phase.summary) return null;
            const phaseAr = arPhase(phase);
            return (
              <View key={phase.id} wrap={false}>
                {phaseAr ? (
                  <View style={styles.bullet}>
                    <Text style={styles.bulletMark}>—</Text>
                    <Text style={styles.bulletTextAr}>
                      <Text style={{ fontWeight: 600 }}>{`${phaseAr.name}. `}</Text>
                      {phaseAr.summary}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.bullet}>
                  <Text style={styles.bulletMark}>—</Text>
                  <Text style={styles.bulletText}>
                    <Text style={{ fontWeight: 600 }}>{`${phase.name}. `}</Text>
                    {phase.summary}
                    {phase.milestones.length ? ` Milestones: ${phase.milestones.join(", ")}.` : ""}
                  </Text>
                </View>
              </View>
            );
          })}
        </Section>

        <Section
          index={nextSection()}
          label="Investment"
          title={recommendedPlan ? `Your investment · ${recommendedPlan.name} plan` : "Your investment"}
          styles={styles}
        >
          <View style={styles.totalsCard} wrap={false}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Project subtotal</Text>
              <Text style={styles.totalsValue}>{money(proposal.totals.oneTimeSubtotal)}</Text>
            </View>
            {proposal.totals.discountAmount > 0 ? (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>{proposal.discount?.label ?? "Discount"}</Text>
                <Text style={styles.totalsValue}>{`− ${money(proposal.totals.discountAmount)}`}</Text>
              </View>
            ) : null}
            {proposal.totals.taxAmount > 0 ? (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>{`Tax (${proposal.taxRate}%)`}</Text>
                <Text style={styles.totalsValue}>{money(proposal.totals.taxAmount)}</Text>
              </View>
            ) : null}
            <Text style={[styles.totalsLabel, { marginTop: 8 }]}>Total project investment</Text>
            <Text style={styles.totalsBig}>{money(proposal.totals.total)}</Text>
            {proposal.totals.monthlyTotal > 0 ? (
              <Text style={[styles.totalsLabel, { marginTop: 6 }]}>{`Plus ${money(proposal.totals.monthlyTotal)} per month in ongoing services`}</Text>
            ) : null}
          </View>
          <View style={{ marginTop: 14 }} wrap={false}>
            <Text style={[styles.sectionLabel, { marginBottom: 4 }]}>Payment schedule</Text>
            {schedule.map((milestone) => (
              <View key={milestone.label} style={styles.scheduleRow}>
                <Text style={{ flex: 1 }}>{milestone.label}</Text>
                <Text style={{ width: 50, textAlign: "right", color: C.muted }}>{`${milestone.percent}%`}</Text>
                <Text style={{ width: 90, textAlign: "right" }}>{money(milestone.amount)}</Text>
              </View>
            ))}
          </View>
        </Section>

        {proposal.assumptions.length ? (
          <Section index={nextSection()} label="Assumptions" title="What this proposal assumes" styles={styles}>
            {proposal.assumptions.map((assumption, i) => (
              <View key={i} style={styles.bullet} wrap={false}>
                <Text style={styles.bulletMark}>—</Text>
                <Text style={styles.bulletText}>{assumption}</Text>
              </View>
            ))}
          </Section>
        ) : null}

        <Section index={nextSection()} label="Next steps" title="Let's get started" styles={styles}>
          {ar ? (
            <>
              <Text style={styles.sectionTitleAr}>لنبدأ</Text>
              {ar.nextSteps.map((step, i) => (
                <View key={i} style={styles.bullet} wrap={false}>
                  <Text style={styles.bulletMark}>{`${i + 1}.`}</Text>
                  <Text style={styles.bulletTextAr}>{step}</Text>
                </View>
              ))}
              {ar.notes ? <ArabicParagraphs text={ar.notes} styles={styles} /> : null}
              <View style={styles.arDivider} />
            </>
          ) : null}
          {proposal.nextSteps.map((step, i) => (
            <View key={i} style={styles.bullet} wrap={false}>
              <Text style={styles.bulletMark}>{`${i + 1}.`}</Text>
              <Text style={styles.bulletText}>{step}</Text>
            </View>
          ))}
          {proposal.notes ? <Paragraphs text={proposal.notes} styles={styles} /> : null}
          <View style={styles.acceptBox} wrap={false}>
            <Text style={{ fontFamily: fonts.display, fontSize: 13, marginBottom: 6 }}>Ready to go?</Text>
            <Text style={styles.paragraph}>
              {`Review and accept this proposal online before ${formatDate(proposal.validUntil)}. Questions? Write to ${brand.contactEmail}.`}
            </Text>
            <Link src={shareUrl} style={styles.acceptLink}>
              {shareUrl}
            </Link>
          </View>
        </Section>
      </Page>
    </Document>
  );
}
