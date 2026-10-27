import { code, config, email, http, ifNode, noop, reportEvent, respond, sticky, telegram, webhook, WorkflowBuilder } from "../builder";
import { EMAIL_LAYOUT_JS, ESCAPE_JS } from "../snippets";

const NAME = "ASD 01 · Lead Intake & Alerts";

export function leadIntakeWorkflow() {
  const wf = new WorkflowBuilder(
    NAME,
    "Receives `lead.created` from the app: instant Telegram/WhatsApp alert for the team + acknowledgement email to the client. A second entry point imports leads from any other source into POST /api/v1/onboard.",
    ["AS Design Studio", "Lead intake"],
  );

  wf.add(
    sticky("Note · Overview", [-480, -260], [
      "## 01 · Lead Intake & Alerts",
      "**Trigger:** the app POSTs `lead.created` here right after a brief is submitted.",
      "",
      "1. Replies 202 immediately (the app never waits on n8n)",
      "2. Formats the lead and alerts the team on **Telegram** (and optionally **WhatsApp**), plus an **admin email** (`adminEmail` in Config)",
      "3. Emails the client an acknowledgement with their reference",
      "4. Reports each notification back to `/api/v1/events` (shown in the dashboard activity feed)",
      "",
      "AI analysis is requested separately by the app (workflow 02).",
      "",
      "**Emails:** when the app sends emails itself (payload `delivery.email = app`, the default once SMTP is set in the app), this workflow skips its email nodes and only sends the Telegram/WhatsApp alerts — no duplicates.",
      "",
      "**Setup:** edit the ⚙️ Config node · credentials: *ASD · Webhook auth*, *ASD · App API*, *ASD · Telegram bot*, *ASD · SMTP*, *ASD · WhatsApp Cloud API token* (optional).",
    ].join("\n"), { width: 420, height: 400 }, 6),
  );

  wf.add(webhook("Lead Webhook", "asd-lead-intake", [0, 0], NAME));
  wf.add(respond("Respond 202", [220, 0], "={{ JSON.stringify({ accepted: true, executionId: $execution.id }) }}"));
  wf.add(
    config("Config", [440, 0], [
      { name: "appBaseUrl", value: "https://automation.asdesignlb.com" },
      { name: "telegramChatId", value: "REPLACE_WITH_TELEGRAM_CHAT_ID" },
      { name: "whatsappEnabled", value: false },
      { name: "whatsappPhoneNumberId", value: "REPLACE_WITH_META_PHONE_NUMBER_ID" },
      { name: "adminWhatsappNumber", value: "9617XXXXXXX" },
      { name: "adminEmail", value: "info@asdesignlb.com" },
      { name: "sendClientAck", value: true },
      // Must be the SMTP credential's own mailbox (Hostinger: info@asdesignlb.com) — otherwise SPF/DMARC fail → spam.
      { name: "fromEmail", value: "info@asdesignlb.com" },
      { name: "fromName", value: "Ali Mawla · AS Design" },
      { name: "replyTo", value: "info@asdesignlb.com" },
    ], NAME),
  );
  wf.add(ifNode("Is test ping?", [660, 0], { left: "={{ $('Lead Webhook').first().json.body.type }}", op: "equals", right: "test.ping" }, NAME));
  wf.add(noop("Test OK", [880, -140]));

  wf.add(
    code(
      "Format Lead",
      [880, 60],
      ESCAPE_JS +
        String.raw`
const body = $('Lead Webhook').first().json.body;
const lead = body.lead;
const d = lead.display;
const budgetMax = lead.estimate && lead.estimate.max ? lead.estimate.max : 0;
const priority = budgetMax >= 30000 ? "🔥 High value" : lead.plan.timeline === "asap" ? "⚡ Rush" : "🆕 New";
const lines = [
  "<b>" + priority + " lead · " + esc(lead.reference) + "</b>",
  "",
  "<b>" + esc(d.name) + "</b>" + (d.company ? " · " + esc(d.company) : ""),
  "🧩 " + esc(d.services),
  "💰 Budget " + esc(d.budget) + " · indicative " + esc(d.estimate),
  "🗓 " + esc(d.timeline),
  "📨 " + esc(lead.contact.email) + (lead.contact.phone ? " · " + esc(lead.contact.phone) : ""),
  "💬 Prefers " + esc(d.preferredContact),
  "",
  "<i>" + esc(String(lead.project.description).slice(0, 280)) + (lead.project.description.length > 280 ? "…" : "") + "</i>",
  "",
  '<a href="' + esc(body.links.admin) + '">Open in dashboard →</a>',
];
const whatsappText = priority + " lead " + lead.reference + ": " + d.name + (d.company ? " (" + d.company + ")" : "") + " · " + d.services + " · " + d.budget + ". " + body.links.admin;
return [{ json: { lead, links: body.links, telegramText: lines.join("\n"), whatsappText } }];`,
    ),
  );

  wf.add(telegram("Telegram Alert", [1100, -20], "={{ $json.telegramText }}"));
  wf.add(reportEvent("Log Telegram", [1320, -20], "{ type: 'notification.sent', leadId: $('Format Lead').first().json.lead.id, data: { channel: 'telegram', kind: 'new_lead', delivered: !$json.error, error: $json.error ? String($json.error.message || $json.error) : undefined } }"));

  wf.add(
    code(
      "Compose Admin Lead Email",
      [1320, -380],
      ESCAPE_JS +
        "\n" +
        EMAIL_LAYOUT_JS +
        String.raw`
const lead = $('Format Lead').first().json.lead;
const d = lead.display;
const html = emailLayout({
  title: "New lead · " + lead.reference,
  bodyHtml: "<p><b>" + esc(d.name) + "</b>" + (d.company ? " · " + esc(d.company) : "") + "</p>" +
    "<p>🧩 " + esc(d.services) + "<br/>💰 Budget " + esc(d.budget) + " · indicative " + esc(d.estimate) + "<br/>🗓 " + esc(d.timeline) + "</p>" +
    "<p>📨 " + esc(lead.contact.email) + (lead.contact.phone ? " · " + esc(lead.contact.phone) : "") + " · prefers " + esc(d.preferredContact) + "</p>" +
    "<p><i>" + esc(String(lead.project.description).slice(0, 400)) + (lead.project.description.length > 400 ? "…" : "") + "</i></p>",
  ctaUrl: $('Format Lead').first().json.links.admin,
  ctaLabel: "Open in dashboard",
});
return [{ json: { to: $('Config').first().json.adminEmail, subject: "New lead · " + lead.reference + " · " + d.name, html } }];`,
    ),
  );
  wf.add(email("Send Admin Lead Email", [1540, -380], { to: "={{ $json.to }}", subject: "={{ $json.subject }}", html: "={{ $json.html }}" }));
  wf.add(reportEvent("Log Admin Lead Email", [1760, -380], "{ type: 'email.sent', leadId: $('Format Lead').first().json.lead.id, data: { kind: 'admin_new_lead', to: $('Compose Admin Lead Email').first().json.to } }"));

  wf.add(
    ifNode(
      "n8n sends emails?",
      [1100, -300],
      { left: "={{ ($('Lead Webhook').first().json.body.delivery || {}).email !== 'app' }}", op: "true" },
      NAME,
    ),
  );

  wf.add(ifNode("WhatsApp enabled?", [1100, 160], { left: "={{ $('Config').first().json.whatsappEnabled }}", op: "true" }, NAME));
  wf.add({
    ...http("WhatsApp Alert", [1320, 140], {
      url: "=https://graph.facebook.com/v21.0/{{ $('Config').first().json.whatsappPhoneNumberId }}/messages",
      auth: "whatsapp",
      jsonBody:
        "={{ JSON.stringify({ messaging_product: 'whatsapp', to: $('Config').first().json.adminWhatsappNumber, type: 'text', text: { preview_url: true, body: $('Format Lead').first().json.whatsappText } }) }}",
    }),
    onError: "continueRegularOutput",
    notes: "Free-form text only reaches numbers that messaged your business in the last 24h. For always-on alerts, switch the body to an approved template message.",
  });

  wf.add(ifNode("Send client ack?", [1320, -200], { left: "={{ $('Config').first().json.sendClientAck }}", op: "true" }, NAME));
  wf.add(
    code(
      "Compose Ack Email",
      [1540, -220],
      ESCAPE_JS +
        "\n" +
        EMAIL_LAYOUT_JS +
        String.raw`
const lead = $('Format Lead').first().json.lead;
const first = String(lead.contact.name).split(" ")[0];
const html = emailLayout({
  title: "We've received your brief",
  bodyHtml: "<p>Hi " + esc(first) + ",</p>" +
    "<p>Thank you for sharing your project with us. Your reference is <b>" + esc(lead.reference) + "</b>.</p>" +
    "<p>Our studio assistant is preparing a tailored scope and investment proposal, and a strategist will review it before it reaches you. " +
    "Based on your choices, the indicative range is <b>" + esc(lead.display.estimate) + "</b> over roughly " + lead.estimate.weeksMin + "–" + lead.estimate.weeksMax + " weeks.</p>" +
    "<p>If anything comes to mind in the meantime, simply reply to this email.</p>",
});
return [{ json: { to: lead.contact.email, subject: "Your project brief · " + lead.reference, html } }];`,
    ),
  );
  wf.add(email("Send Ack Email", [1760, -220], { to: "={{ $json.to }}", subject: "={{ $json.subject }}", html: "={{ $json.html }}" }));
  wf.add(reportEvent("Log Ack Email", [1980, -220], "{ type: 'email.sent', leadId: $('Format Lead').first().json.lead.id, data: { kind: 'acknowledgement', to: $('Compose Ack Email').first().json.to } }"));

  wf.chain("Lead Webhook", "Respond 202", "Config", "Is test ping?");
  wf.connect("Is test ping?", "Test OK", 0);
  wf.connect("Is test ping?", "Format Lead", 1);
  wf.connect("Format Lead", "Telegram Alert");
  wf.connect("Format Lead", "n8n sends emails?");
  wf.connect("n8n sends emails?", "Compose Admin Lead Email", 0);
  wf.connect("n8n sends emails?", "Send client ack?", 0);
  wf.connect("Format Lead", "WhatsApp enabled?");
  wf.connect("Telegram Alert", "Log Telegram");
  wf.chain("Compose Admin Lead Email", "Send Admin Lead Email", "Log Admin Lead Email");
  wf.connect("WhatsApp enabled?", "WhatsApp Alert", 0);
  wf.chain("Send client ack?", "Compose Ack Email", "Send Ack Email", "Log Ack Email");

  /* ---------------- Entry point 2: import leads from other sources ---------------- */
  wf.add(
    sticky("Note · External leads", [-480, 460], [
      "## Import leads from anywhere",
      "Point Typeform, Webflow forms, Meta Lead Ads (or any tool) at this webhook: `POST /webhook/asd-external-lead`.",
      "",
      "**Map Fields** converts the payload into the app's lead schema and **Create Lead** calls `POST /api/v1/onboard` with the App API token — the lead then flows through the normal pipeline (alerts, AI analysis, CRM).",
      "",
      "Adjust the mapping to your form's field names.",
    ].join("\n"), { width: 420, height: 300 }, 4),
  );
  wf.add(webhook("External Lead Webhook", "asd-external-lead", [0, 560], NAME));
  wf.add(config("Config (import)", [220, 560], [{ name: "appBaseUrl", value: "https://automation.asdesignlb.com" }], NAME));
  wf.add(
    code(
      "Map Fields",
      [440, 560],
      String.raw`// Accepts flat payloads such as { name, email, phone, company, message, services, budget, timeline }.
const src = $('External Lead Webhook').first().json.body || {};
const pick = (...keys) => { for (const k of keys) { if (src[k] !== undefined && src[k] !== null && src[k] !== "") return src[k]; } return undefined; };
const services = [].concat(pick("services", "service") || ["web-design"]).map(String);
const payload = {
  project: {
    services,
    description: String(pick("message", "description", "brief", "details") || "Imported lead — details to be confirmed on the discovery call.").padEnd(30, "."),
    name: pick("project", "projectName"),
  },
  plan: { budget: pick("budget") || "not-sure", timeline: pick("timeline") || "flexible" },
  contact: {
    name: String(pick("name", "full_name", "fullName") || "Unknown"),
    email: String(pick("email", "email_address")),
    phone: pick("phone", "phone_number"),
    company: pick("company", "company_name"),
    consent: true,
  },
  meta: { source: "import", utm: { source: pick("utm_source", "source") } },
};
return [{ json: { payload } }];`,
    ),
  );
  wf.add(
    http("Create Lead", [660, 560], {
      url: "={{ $('Config (import)').first().json.appBaseUrl }}/api/v1/onboard",
      auth: "appApi",
      jsonBody: "={{ JSON.stringify($json.payload) }}",
      errorOutput: true,
    }),
  );
  wf.add(respond("Respond Created", [880, 500], "={{ JSON.stringify({ ok: true, reference: $json.reference }) }}", 201));
  wf.add(respond("Respond Invalid", [880, 660], "={{ JSON.stringify({ ok: false, error: $json.error }) }}", 422));
  wf.chain("External Lead Webhook", "Config (import)", "Map Fields", "Create Lead");
  wf.connect("Create Lead", "Respond Created", 0);
  wf.connect("Create Lead", "Respond Invalid", 1);

  return wf.build();
}
