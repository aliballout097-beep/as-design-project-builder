import { CheckCircle2, CircleDashed, TriangleAlert } from "lucide-react";
import { getConfig } from "@/lib/env";
import { AutoSendSettings } from "@/components/admin/AutoSendSettings";
import { PageHeader, Panel } from "@/components/admin/PageHeader";
import { PricingSettings } from "@/components/admin/PricingSettings";
import { CopyBlock, SeedDemoButton, TestEmailButton, TestWebhookButton, TestWhatsAppButton } from "@/components/admin/SettingsClient";

export const metadata = { title: "Settings" };

function State({ ok, label, detail }: { ok: boolean | "warn"; label: string; detail: React.ReactNode }) {
  const Icon = ok === true ? CheckCircle2 : ok === "warn" ? TriangleAlert : CircleDashed;
  const tone = ok === true ? "text-success" : ok === "warn" ? "text-warning" : "text-fog";
  return (
    <div className="flex items-start gap-3 py-3">
      <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} />
      <div className="min-w-0">
        <p className="text-[14px] text-ivory">{label}</p>
        <div className="mt-0.5 break-words text-[12.5px] text-mist">{detail}</div>
      </div>
    </div>
  );
}

const WORKFLOWS = [
  { target: "leadIntake", name: "01 · Lead Intake & Alerts", event: "lead.created" },
  { target: "analysis", name: "02 · AI Scope & Budget Analysis", event: "analysis.requested" },
  { target: "dispatch", name: "04 · Client Dispatch & Alerts", event: "proposal.approved / accepted / declined / created" },
  { target: "crmSync", name: "05 · CRM Sync", event: "crm.sync" },
] as const;

export default function SettingsPage() {
  const config = getConfig();
  const model = config.ai.provider === "anthropic" ? config.ai.anthropic?.model : config.ai.provider === "openai" ? config.ai.openai?.model : null;
  const inlineSnippet = `<div id="asd-project-builder"></div>\n<script src="${config.appUrl}/widget.js" data-target="#asd-project-builder" async></script>`;
  const popupSnippet = `<script src="${config.appUrl}/widget.js" data-mode="popup" data-label="Start a project" async></script>\n<!-- or trigger from any element: -->\n<a href="#" data-asd-open>Get a proposal</a>`;

  return (
    <>
      <PageHeader eyebrow="Settings" title="Integrations & setup" description="Configuration is read from environment variables — see README → Environment variables." />

      {config.warnings.length ? (
        <div className="mb-4 space-y-2">
          {config.warnings.map((warning) => (
            <p key={warning} className="flex gap-2 rounded-xl border border-warning/25 bg-warning/[0.06] px-4 py-2.5 text-[13px] text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {warning}
            </p>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Platform">
          <div className="divide-y divide-line/[0.05]">
            <State ok={config.dataStore === "supabase" ? true : "warn"} label={`Data store · ${config.dataStore}`} detail={config.dataStore === "supabase" ? config.supabase?.url : `Local JSON file in ${config.localDataDir}/ — fine for development and single-server installs.`} />
            <State
              ok={config.ai.provider === "heuristic" ? "warn" : true}
              label={`AI provider · ${config.ai.provider}`}
              detail={config.ai.provider === "heuristic" ? "No API key — proposals come from the rule-based estimator. Set ANTHROPIC_API_KEY." : `${model} · effort ${config.ai.effort} · fallback to rules ${config.ai.fallbackToHeuristic ? "on" : "off"}`}
            />
            <State ok label={`Analysis runner · ${config.analysisRunner}`} detail={config.analysisRunner === "n8n" ? "AI analysis runs inside n8n workflow 02 and posts back to /api/v1/proposals." : "AI analysis runs inside this app (n8n still receives notifications if configured)."} />
            <State ok={config.admins.length > 0 ? true : "warn"} label={`Admin users · ${config.admins.length}`} detail={config.admins.map((a) => a.email).join(", ") || "Development demo login only."} />
            <State ok={config.upstash ? true : "warn"} label="Rate limiting" detail={config.upstash ? "Upstash Redis (shared across instances)" : "In-memory (per instance). Add Upstash for serverless."} />
          </div>
        </Panel>

        <Panel title="Email delivery">
          <div className="divide-y divide-line/[0.05]">
            <State
              ok={config.email.delivery === "app" ? true : config.email.delivery === "n8n" ? "warn" : false}
              label={`Sent by · ${config.email.delivery === "app" ? "this app (SMTP)" : config.email.delivery === "n8n" ? "n8n workflows" : "nobody — emails are off"}`}
              detail={
                config.email.delivery === "app"
                  ? "Client proposal (PDF attached), new-lead alerts, acceptance alerts and welcome emails are sent directly, with retries."
                  : "Set SMTP_USER and SMTP_PASS (the info@asdesignlb.com mailbox) so the app sends every email itself."
              }
            />
            <State ok={Boolean(config.email.smtp)} label={`SMTP · ${config.email.smtp ? `${config.email.smtp.host}:${config.email.smtp.port}` : "not configured"}`} detail={config.email.smtp ? `Signed in as ${config.email.smtp.user}` : "SMTP_HOST (default smtp.hostinger.com), SMTP_PORT 465, SMTP_USER, SMTP_PASS"} />
            <State ok label={`From · ${config.email.from.name} <${config.email.from.address}>`} detail="Must be the SMTP mailbox's own domain so SPF, DKIM and DMARC pass (inbox, not spam)." />
            <State ok={config.email.adminRecipients.length > 0 ? true : "warn"} label="Lead alerts go to" detail={config.email.adminRecipients.join(", ") || "Set ADMIN_NOTIFY_EMAILS"} />
            <div className="py-3">
              <TestEmailButton disabled={!config.email.smtp} />
            </div>
          </div>
        </Panel>

        <Panel title="WhatsApp to clients">
          <div className="divide-y divide-line/[0.05]">
            <State
              ok={config.whatsapp && config.email.delivery === "app" ? true : config.whatsapp ? "warn" : false}
              label={config.whatsapp ? `Cloud API · template "${config.whatsapp.template}" (${config.whatsapp.language})` : "Not configured"}
              detail={
                config.whatsapp
                  ? config.email.delivery === "app"
                    ? "Clients who add a WhatsApp number get the proposal PDF on WhatsApp too, next to the email."
                    : "Sent by the app only when EMAIL_DELIVERY=app (SMTP configured)."
                  : "Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID (Meta WhatsApp Cloud API) and create the proposal_ready template — see README."
              }
            />
            {config.whatsapp ? (
              <State ok label={`Phone number id · ${config.whatsapp.phoneNumberId}`} detail={`Graph API ${config.whatsapp.apiVersion} · local numbers get +${config.whatsapp.defaultCountryCode}`} />
            ) : null}
            <div className="py-3">
              <TestWhatsAppButton disabled={!config.whatsapp} />
            </div>
          </div>
        </Panel>

        <Panel title="n8n workflows">
          <div className="divide-y divide-line/[0.05]">
            {WORKFLOWS.map((wf) => {
              const url = config.n8n.urls[wf.target];
              return (
                <div key={wf.target} className="flex items-center justify-between gap-3">
                  <State ok={Boolean(url)} label={wf.name} detail={url ? <span className="font-mono">{url}</span> : `Not configured · receives ${wf.event}`} />
                  <TestWebhookButton target={wf.target} disabled={!url} />
                </div>
              );
            })}
            <State ok={config.n8n.webhookSecret ? true : config.n8n.enabled ? "warn" : false} label="Outbound auth (app → n8n)" detail="Authorization: Bearer N8N_WEBHOOK_SECRET + X-ASD-Signature (HMAC-SHA256)" />
            <State ok={config.n8n.callbackSecret ? true : config.n8n.enabled ? "warn" : false} label="Callback auth (n8n → app)" detail="Authorization: Bearer N8N_CALLBACK_SECRET" />
          </div>
        </Panel>

        <Panel title="Webhook targets for n8n">
          <div className="space-y-3">
            <CopyBlock label="Submit an AI analysis → creates the proposal draft" value={`POST ${config.appUrl}/api/v1/proposals`} />
            <CopyBlock label="Import a lead from any source (Typeform, Webflow, Meta…)" value={`POST ${config.appUrl}/api/v1/onboard`} />
            <CopyBlock label="Report pipeline events (proposal.sent, crm.synced, …)" value={`POST ${config.appUrl}/api/v1/events`} />
            <CopyBlock label="Proposal PDF (attach to emails)" value={`GET ${config.appUrl}/api/v1/proposals/{id}/pdf`} />
          </div>
        </Panel>

        <Panel title="Embed on asdesignlb.com">
          <div className="space-y-3">
            <CopyBlock label="Inline builder" value={inlineSnippet} />
            <CopyBlock label="Popup launcher" value={popupSnippet} />
            <p className="text-[12.5px] text-fog">Allowed parent sites are set with EMBED_ALLOWED_ORIGINS (CSP frame-ancestors).</p>
          </div>
        </Panel>

        <Panel title="Automation">
          <AutoSendSettings />
        </Panel>

        {config.dataStore === "local" || !config.isProduction ? (
          <Panel title="Demo data">
            <p className="mb-3 text-[13.5px] text-mist">Load five fictional leads at different pipeline stages (rule-based analyses, no webhooks fired).</p>
            <SeedDemoButton />
          </Panel>
        ) : null}
      </div>

      <Panel title="Pricing" className="mt-4" action={<span className="text-[12px] text-fog">Overrides catalog.ts — applies immediately, no redeploy</span>}>
        <PricingSettings />
      </Panel>
    </>
  );
}
