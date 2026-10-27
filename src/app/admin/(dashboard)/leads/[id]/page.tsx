import { AlertTriangle, ArrowLeft, ExternalLink, Mail, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ASSETS,
  BUDGET_MAP,
  CONTACT_METHODS,
  CURRENCY,
  FEATURE_MAP,
  GOALS,
  ITEM_MAP,
  LANGUAGES,
  labelFor,
  PROJECT_TYPES,
  SCALE_MAP,
  SERVICE_MAP,
  timelineLabel,
  type ItemKey,
} from "@/config/catalog";
import { PLAN_NAMES } from "@/config/plans";
import { leadScope } from "@/lib/pricing/scope";
import { getRepository } from "@/lib/db";
import { getConfig } from "@/lib/env";
import { formatDate, formatDateTime, formatRange } from "@/lib/format";
import { ActivityFeed } from "@/components/admin/ActivityFeed";
import { AnalysisPanel } from "@/components/admin/AnalysisPanel";
import { LeadActions, NotesEditor } from "@/components/admin/LeadActions";
import { PageHeader, Panel } from "@/components/admin/PageHeader";
import { ProposalEditor } from "@/components/admin/ProposalEditor";
import { LeadStatusPill, ProposalStatusPill } from "@/components/admin/StatusPill";

export async function generateMetadata({ params }: PageProps<"/admin/leads/[id]">) {
  const { id } = await params;
  const lead = await getRepository().getLead(id);
  return { title: lead ? `${lead.contact.company ?? lead.contact.name} · ${lead.reference}` : "Lead" };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-2 text-[13.5px]">
      <dt className="text-fog">{label}</dt>
      <dd className="min-w-0 text-ivory/90">{children}</dd>
    </div>
  );
}

export default async function LeadDetailPage({ params }: PageProps<"/admin/leads/[id]">) {
  const { id } = await params;
  const repo = getRepository();
  const lead = await repo.getLead(id);
  if (!lead) notFound();
  const [analyses, proposals, events] = await Promise.all([
    repo.listAnalyses(id),
    repo.listProposals({ leadId: id, limit: 20 }),
    repo.listEvents({ leadId: id, limit: 40 }),
  ]);
  const current = proposals.items.find((p) => p.status !== "superseded") ?? proposals.items[0] ?? null;
  const history = proposals.items.filter((p) => p.id !== current?.id);
  const config = getConfig();
  const { contact, project, plan } = lead;
  const whatsappNumber = contact.phone?.replace(/[^\d]/g, "");

  return (
    <>
      <Link href="/admin/leads" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-mist hover:text-ivory">
        <ArrowLeft className="size-3.5" /> All leads
      </Link>
      <PageHeader
        eyebrow={`${lead.reference} · received ${formatDateTime(lead.createdAt)}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {contact.company ?? contact.name}
            <LeadStatusPill status={lead.status} className="text-[13px]" />
          </span>
        }
        description={`${project.name ? `${project.name} · ` : ""}${project.services.map((s) => SERVICE_MAP[s]?.name ?? s).join(" · ")}`}
        actions={<LeadActions leadId={lead.id} status={lead.status} analyzing={lead.status === "analyzing"} />}
      />

      {lead.analysisError ? (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-danger/25 bg-danger/[0.07] px-4 py-3 text-[14px] text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            The last analysis failed: {lead.analysisError}. Use <strong>Regenerate</strong> to retry.
          </span>
        </div>
      ) : null}

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          {current ? (
            <ProposalEditor key={current.id} proposal={current} clientEmail={contact.email} dispatchConfigured={Boolean(config.n8n.urls.dispatch) || config.email.delivery === "app"} emailByApp={config.email.delivery === "app"} />
          ) : (
            <Panel>
              <p className="py-6 text-center text-[14px] text-fog">
                {lead.status === "analyzing" ? "The AI is scoping this brief — the proposal draft appears here automatically." : "No proposal yet. Run the analysis to draft one."}
              </p>
            </Panel>
          )}
          <AnalysisPanel analyses={analyses} />

          <Panel title="Client brief">
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-ivory/90">{project.description}</p>
            {(() => {
              const { added } = leadScope(lead);
              if (!added.services.length && !added.items.length) return null;
              return (
                <p className="mt-4 rounded-xl border border-ember-400/25 bg-ember-400/[0.06] px-3.5 py-2.5 text-[13px] leading-relaxed text-mist">
                  <strong className="text-ivory">Found in the description (added to the priced scope):</strong>{" "}
                  {[...added.services.map((key) => SERVICE_MAP[key]?.name ?? key), ...added.items.map((key) => ITEM_MAP[key]?.name ?? key)].join(", ")}
                  {added.replaced.length ? ` — replaces ${added.replaced.map((key) => SERVICE_MAP[key]?.name ?? key).join(", ")}` : ""} · from “{added.evidence.join("”, “")}”
                </p>
              );
            })()}
            <dl className="mt-5 grid gap-x-8 divide-y divide-line/[0.05] md:grid-cols-2 md:divide-y-0">
              <div className="divide-y divide-line/[0.05]">
                <Row label="Type">{labelFor(PROJECT_TYPES, project.type)}</Row>
                <Row label="Industry">{project.industry ?? "—"}</Row>
                <Row label="Audience">{project.audience ?? "—"}</Row>
                <Row label="Goals">{project.goals.map((g) => labelFor(GOALS, g)).join(", ") || "—"}</Row>
                <Row label="Has">{project.assets.map((a) => labelFor(ASSETS, a)).join(", ") || "—"}</Row>
              </div>
              <div className="divide-y divide-line/[0.05]">
                <Row label="Items">
                  {(Object.entries(project.items ?? {}) as [ItemKey, number][])
                    .filter(([, qty]) => qty > 0)
                    .map(([key, qty]) => `${ITEM_MAP[key]?.name ?? key}${qty > 1 ? ` × ${qty}` : ""}`)
                    .join(", ") || "—"}
                </Row>
                <Row label="Capabilities">{project.features.map((f) => FEATURE_MAP[f]?.name ?? f).join(", ") || "—"}</Row>
                <Row label="Plan picked">{PLAN_NAMES[project.scale]?.en ?? SCALE_MAP[project.scale]?.name}</Row>
                <Row label="Languages">{project.languages.map((l) => labelFor(LANGUAGES, l)).join(", ")}</Row>
                <Row label="Budget">
                  {BUDGET_MAP[plan.budget]?.label}
                  {plan.budgetFlexible ? " · flexible" : ""}
                </Row>
                <Row label="Timeline">
                  {timelineLabel(plan)}
                  {plan.deadline ? ` · deadline ${formatDate(plan.deadline)}` : ""}
                </Row>
                <Row label="Indicative">
                  {formatRange(lead.estimate.min, lead.estimate.max, CURRENCY)} · {lead.estimate.weeksMin}–{lead.estimate.weeksMax} weeks
                </Row>
              </div>
            </dl>
            {project.references.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {project.references.map((ref) => (
                  <a key={ref} href={ref} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 rounded-full border border-line/10 px-3 py-1 text-[12.5px] text-mist hover:text-ivory">
                    {new URL(ref).hostname} <ExternalLink className="size-3" />
                  </a>
                ))}
              </div>
            ) : null}
          </Panel>
        </div>

        <div className="grid content-start gap-4 md:grid-cols-2 2xl:grid-cols-1">
          <Panel title="Client">
            <p className="font-display text-[20px] text-ivory">{contact.name}</p>
            <p className="text-[13px] text-mist">{[contact.role, contact.company, contact.country].filter(Boolean).join(" · ") || "—"}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1.5 rounded-xl border border-line/10 px-3 py-2 text-[13px] text-ivory hover:bg-line/[0.05]">
                <Mail className="size-3.5" /> Email
              </a>
              {contact.phone ? (
                <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1.5 rounded-xl border border-line/10 px-3 py-2 text-[13px] text-ivory hover:bg-line/[0.05]">
                  <Phone className="size-3.5" /> Call
                </a>
              ) : null}
              {contact.whatsapp && whatsappNumber ? (
                <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-line/10 px-3 py-2 text-[13px] text-ivory hover:bg-line/[0.05]">
                  <MessageCircle className="size-3.5" /> WhatsApp
                </a>
              ) : null}
            </div>
            <dl className="mt-4 divide-y divide-line/[0.05]">
              <Row label="Email">
                <span className="break-all">{contact.email}</span>
              </Row>
              {contact.phone ? <Row label="Phone">{contact.phone}</Row> : null}
              {contact.website ? (
                <Row label="Website">
                  <a className="break-all text-ember-300 hover:text-ember-200" href={contact.website} target="_blank" rel="noreferrer noopener">
                    {contact.website.replace(/^https?:\/\//, "")}
                  </a>
                </Row>
              ) : null}
              <Row label="Prefers">{labelFor(CONTACT_METHODS, contact.preferredContact)}</Row>
              <Row label="Proposal delivery">{{ email: "Email", whatsapp: "WhatsApp", both: "Email + WhatsApp" }[contact.deliveryChannel]}</Row>
              <Row label="Source">
                {lead.source}
                {lead.meta.utm?.source ? ` · ${lead.meta.utm.source}${lead.meta.utm.medium ? `/${lead.meta.utm.medium}` : ""}` : ""}
              </Row>
              <Row label="Marketing">{lead.meta.consent?.marketing ? "Opted in" : "No"}</Row>
              {lead.crm.syncedAt ? (
                <Row label="CRM">
                  Synced {formatDateTime(lead.crm.syncedAt)}
                  {lead.crm.airtableRecordId ? " · Airtable" : ""}
                  {lead.crm.notionPageId ? " · Notion" : ""}
                </Row>
              ) : null}
            </dl>
          </Panel>

          <Panel title="Internal notes">
            <NotesEditor leadId={lead.id} initial={lead.notes} />
          </Panel>

          {history.length ? (
            <Panel title="Proposal history">
              <ul className="space-y-2">
                {history.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="text-mist">
                      v{p.version} · {formatDate(p.createdAt)}
                    </span>
                    <ProposalStatusPill status={p.status} />
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel title="Activity">
            <div className="max-h-[520px] overflow-y-auto pr-1">
              <ActivityFeed events={events} compact />
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
