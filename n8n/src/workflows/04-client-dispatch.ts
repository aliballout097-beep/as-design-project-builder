import { code, config, email, http, ifNode, noop, reportEvent, respond, sticky, switchNode, telegram, webhook, WorkflowBuilder } from "../builder";
import { EMAIL_LAYOUT_JS, ESCAPE_JS } from "../snippets";

const NAME = "ASD 04 · Client Dispatch & Admin Alerts";

const whatsapp = (name: string, position: [number, number], textExpression: string) => ({
  ...http(name, position, {
    url: "=https://graph.facebook.com/v21.0/{{ $('Config').first().json.whatsappPhoneNumberId }}/messages",
    auth: "whatsapp",
    jsonBody: `={{ JSON.stringify({ messaging_product: 'whatsapp', to: $('Config').first().json.adminWhatsappNumber, type: 'text', text: { preview_url: true, body: ${textExpression} } }) }}`,
  }),
  onError: "continueRegularOutput" as const,
});

export function clientDispatchWorkflow() {
  const wf = new WorkflowBuilder(
    NAME,
    "Receives proposal lifecycle events. On approval: fetches the PDF (workflow 03), delivers it to the client by email and/or WhatsApp per their delivery preference, reports proposal.sent per channel and alerts the team on Telegram/WhatsApp. Also handles acceptance, decline and draft-ready alerts.",
    ["AS Design Studio", "Dispatch"],
  );

  wf.add(
    sticky("Note · Overview", [-480, -320], [
      "## 04 · Client Dispatch & Admin Alerts",
      "**Trigger:** the app POSTs proposal events here.",
      "",
      "- `proposal.approved` → PDF from workflow 03 → delivered to the client by **email and/or WhatsApp**, per `lead.contact.deliveryChannel` (`email` | `whatsapp` | `both`) → `proposal.sent` reported to the app per channel → Telegram / WhatsApp / **admin email** alert to the team (`adminEmail` in Config)",
      "- `proposal.accepted` → 🎉 alert (Telegram + admin email) + **welcome email** with kickoff link",
      "- `proposal.declined` → alert (Telegram + admin email) with the client's note",
      "- `proposal.created` → *draft ready for review* alert (only sent when the app runs the AI itself)",
      "- `proposal.sent` → the **app already emailed** the PDF to the client (payload `delivery.email = app`): Telegram/WhatsApp alert only. Welcome / admin emails on acceptance are skipped too, so nothing is sent twice.",
      "",
      "**Client WhatsApp delivery** requires an approved Meta message **template** (Cloud API can't send free-form text to a client who hasn't messaged you in the last 24h). Create one in Meta Business Manager with a body of the form \"Hi {{1}}, your proposal is ready — {{2}}. Review and accept: {{3}}\" and set its name in `whatsappClientTemplateName` below.",
      "",
      "**Credentials:** *ASD · Webhook auth* (also used to call workflow 03), *ASD · App API*, *ASD · SMTP*, *ASD · Telegram bot*, *ASD · WhatsApp Cloud API token*.",
    ].join("\n"), { width: 460, height: 440 }, 6),
  );

  wf.add(webhook("Dispatch Webhook", "asd-proposal-dispatch", [0, 0], NAME));
  wf.add(respond("Respond 202", [220, 0], "={{ JSON.stringify({ accepted: true, executionId: $execution.id }) }}"));
  wf.add(
    config("Config", [440, 0], [
      { name: "appBaseUrl", value: "https://automation.asdesignlb.com" },
      { name: "telegramChatId", value: "REPLACE_WITH_TELEGRAM_CHAT_ID" },
      { name: "whatsappEnabled", value: false },
      { name: "whatsappPhoneNumberId", value: "REPLACE_WITH_META_PHONE_NUMBER_ID" },
      { name: "adminWhatsappNumber", value: "9617XXXXXXX" },
      { name: "adminEmail", value: "info@asdesignlb.com" },
      { name: "whatsappClientTemplateName", value: "proposal_ready" },
      // Must be the SMTP credential's own mailbox (Hostinger: info@asdesignlb.com) — otherwise SPF/DMARC fail → spam.
      { name: "fromEmail", value: "info@asdesignlb.com" },
      { name: "fromName", value: "Ali Mawla · AS Design" },
      { name: "replyTo", value: "info@asdesignlb.com" },
      { name: "bookingUrl", value: "" },
    ], NAME),
  );
  wf.add(
    switchNode(
      "Route Event",
      [660, 0],
      "={{ $('Dispatch Webhook').first().json.body.type }}",
      [
        { key: "approved", equals: "proposal.approved" },
        { key: "accepted", equals: "proposal.accepted" },
        { key: "declined", equals: "proposal.declined" },
        { key: "draft ready", equals: "proposal.created" },
        { key: "sent by app", equals: "proposal.sent" },
      ],
      NAME,
    ),
  );
  wf.add(noop("Ignore (test / other)", [900, 720]));

  /* ---------------------------- approved → send ---------------------------- */
  wf.add(
    // Straight from the app (no hop through workflow 03, no hard-coded n8n host).
    http("Get PDF", [900, -620], {
      method: "GET",
      url: "={{ $('Config').first().json.appBaseUrl }}/api/v1/proposals/{{ $('Dispatch Webhook').first().json.body.proposal.id }}/pdf?download=1",
      auth: "appApi",
      responseFile: true,
      timeout: 120_000,
    }),
  );
  wf.add(
    code(
      "Compose Proposal Email",
      [1120, -620],
      ESCAPE_JS +
        "\n" +
        EMAIL_LAYOUT_JS +
        String.raw`
const body = $('Dispatch Webhook').first().json.body;
const lead = body.lead, p = body.proposal;
const first = String(lead.contact.name).split(" ")[0];
const html = emailLayout({
  title: p.title,
  bodyHtml: "<p>Hi " + esc(first) + ",</p>" +
    "<p>Thank you for your patience — your tailored proposal is ready. It covers the full scope, a timeline of " + esc(p.display.duration) + " and a total investment of <b>" + esc(p.display.total) + "</b>" + (p.display.monthly ? " (plus " + esc(p.display.monthly) + ")" : "") + ".</p>" +
    "<p>The PDF is attached. You can also review it online and accept it in a couple of clicks — the link is private to you and valid until " + esc(p.display.validUntil || p.validUntil) + ".</p>" +
    "<p>Happy to walk you through it on a call — just reply to this email.</p>",
  ctaUrl: body.links.proposal,
  ctaLabel: "Review & accept your proposal",
});
const binary = $input.first().binary || {};
if (binary.data) binary.data.fileName = lead.reference + "-proposal-v" + p.version + ".pdf";
return [{ json: { to: lead.contact.email, subject: "Your proposal from " + $('Config').first().json.fromName + " · " + lead.reference, html }, binary }];`,
    ),
  );
  wf.add(
    telegram(
      "Telegram · Sent",
      [1340, -860],
      "={{ '📤 <b>Proposal sent</b> · ' + $('Dispatch Webhook').first().json.body.lead.reference + '\\n' + $('Dispatch Webhook').first().json.body.lead.display.name + ' — ' + $('Dispatch Webhook').first().json.body.proposal.display.total + '\\n<a href=\"' + $('Dispatch Webhook').first().json.body.links.admin + '\">Open lead →</a>' }}",
    ),
  );
  wf.add(ifNode("WhatsApp? (sent)", [1340, -620], { left: "={{ $('Config').first().json.whatsappEnabled }}", op: "true" }, NAME));
  wf.add(whatsapp("WhatsApp · Sent", [1560, -610], "'Proposal sent: ' + $('Dispatch Webhook').first().json.body.lead.reference + ' · ' + $('Dispatch Webhook').first().json.body.proposal.display.total"));
  wf.add(
    code(
      "Compose Admin Email · Sent",
      [1340, -740],
      ESCAPE_JS + "\n" + EMAIL_LAYOUT_JS + String.raw`
const body = $('Dispatch Webhook').first().json.body;
const html = emailLayout({
  title: "Proposal sent · " + body.lead.reference,
  bodyHtml: "<p>" + esc(body.lead.display.name) + " — <b>" + esc(body.proposal.display.total) + "</b></p>",
  ctaUrl: body.links.admin,
  ctaLabel: "Open lead",
});
return [{ json: { to: $('Config').first().json.adminEmail, subject: "Proposal sent · " + body.lead.reference, html } }];`,
    ),
  );
  wf.add(email("Admin Email · Sent", [1560, -740], { to: "={{ $json.to }}", subject: "={{ $json.subject }}", html: "={{ $json.html }}" }));

  /* ---- client delivery: email leg (deliveryChannel: email | both, or unset) ---- */
  wf.add(
    ifNode(
      "Client wants email?",
      [1340, -500],
      { left: "={{ $('Dispatch Webhook').first().json.body.lead.contact.deliveryChannel !== 'whatsapp' }}", op: "true" },
      NAME,
    ),
  );
  wf.add(email("Email Proposal to Client", [1560, -520], { to: "={{ $json.to }}", subject: "={{ $json.subject }}", html: "={{ $json.html }}", attachments: "data" }));
  wf.add(
    reportEvent(
      "Report proposal.sent (email)",
      [1780, -520],
      "{ type: 'proposal.sent', proposalId: $('Dispatch Webhook').first().json.body.proposal.id, data: { channel: 'email', to: $('Compose Proposal Email').first().json.to, executionId: $execution.id } }",
    ),
  );

  /* -- client delivery: WhatsApp leg (deliveryChannel: whatsapp | both, template message) -- */
  wf.add(
    ifNode(
      "Client wants WhatsApp?",
      [1340, -380],
      {
        left:
          "={{ $('Config').first().json.whatsappEnabled && $('Dispatch Webhook').first().json.body.lead.contact.deliveryChannel !== 'email' && $('Dispatch Webhook').first().json.body.lead.contact.whatsapp === true }}",
        op: "true",
      },
      NAME,
    ),
  );
  wf.add(
    code(
      "Compose Client WhatsApp",
      [1560, -400],
      String.raw`
const body = $('Dispatch Webhook').first().json.body;
const lead = body.lead, p = body.proposal;
const first = String(lead.contact.name).split(" ")[0];
const digits = String(lead.contact.phone || "").replace(/[^0-9]/g, "");
return [{ json: {
  to: digits,
  template: $('Config').first().json.whatsappClientTemplateName,
  param1: first,
  param2: p.display.total,
  param3: body.links.proposal,
} }];`,
    ),
  );
  wf.add({
    ...http("Send Client WhatsApp", [1780, -400], {
      url: "=https://graph.facebook.com/v21.0/{{ $('Config').first().json.whatsappPhoneNumberId }}/messages",
      auth: "whatsapp",
      jsonBody:
        "={{ JSON.stringify({ messaging_product: 'whatsapp', to: $json.to, type: 'template', template: { name: $json.template, language: { code: 'en_US' }, components: [{ type: 'body', parameters: [ { type: 'text', text: $json.param1 }, { type: 'text', text: $json.param2 }, { type: 'text', text: $json.param3 } ] }] } }) }}",
    }),
    onError: "continueRegularOutput" as const,
  });
  wf.add(
    reportEvent(
      "Report proposal.sent (whatsapp)",
      [2000, -400],
      "{ type: 'proposal.sent', proposalId: $('Dispatch Webhook').first().json.body.proposal.id, data: { channel: 'whatsapp', to: $('Compose Client WhatsApp').first().json.to, executionId: $execution.id } }",
    ),
  );

  /* --------------------------- accepted → celebrate ------------------------ */
  wf.add(
    telegram(
      "Telegram · Accepted",
      [900, -240],
      "={{ '🎉 <b>Proposal accepted!</b> · ' + $('Dispatch Webhook').first().json.body.lead.reference + '\\n' + $('Dispatch Webhook').first().json.body.lead.display.name + ' signed ' + $('Dispatch Webhook').first().json.body.proposal.display.total + ($('Dispatch Webhook').first().json.body.proposal.clientResponse && $('Dispatch Webhook').first().json.body.proposal.clientResponse.note ? '\\n“' + $('Dispatch Webhook').first().json.body.proposal.clientResponse.note + '”' : '') + '\\n<a href=\"' + $('Dispatch Webhook').first().json.body.links.admin + '\">Plan the kickoff →</a>' }}",
    ),
  );
  wf.add(ifNode("WhatsApp? (accepted)", [1120, -240], { left: "={{ $('Config').first().json.whatsappEnabled }}", op: "true" }, NAME));
  wf.add(whatsapp("WhatsApp · Accepted", [1340, -260], "'🎉 Accepted: ' + $('Dispatch Webhook').first().json.body.lead.reference + ' · ' + $('Dispatch Webhook').first().json.body.proposal.display.total"));
  wf.add(
    code(
      "Compose Admin Email · Accepted",
      [1120, -120],
      ESCAPE_JS + "\n" + EMAIL_LAYOUT_JS + String.raw`
const body = $('Dispatch Webhook').first().json.body;
const note = body.proposal.clientResponse && body.proposal.clientResponse.note;
const html = emailLayout({
  title: "🎉 Proposal accepted · " + body.lead.reference,
  bodyHtml: "<p>" + esc(body.lead.display.name) + " signed <b>" + esc(body.proposal.display.total) + "</b></p>" + (note ? "<p><i>“" + esc(note) + "”</i></p>" : ""),
  ctaUrl: body.links.admin,
  ctaLabel: "Plan the kickoff",
});
return [{ json: { to: $('Config').first().json.adminEmail, subject: "🎉 Accepted · " + body.lead.reference, html } }];`,
    ),
  );
  wf.add(email("Admin Email · Accepted", [1340, -120], { to: "={{ $json.to }}", subject: "={{ $json.subject }}", html: "={{ $json.html }}" }));
  wf.add(
    code(
      "Compose Welcome Email",
      [1120, 20],
      ESCAPE_JS +
        "\n" +
        EMAIL_LAYOUT_JS +
        String.raw`
const body = $('Dispatch Webhook').first().json.body;
const cfg = $('Config').first().json;
const lead = body.lead;
const first = String(lead.contact.name).split(" ")[0];
const html = emailLayout({
  title: "Welcome aboard, " + first,
  bodyHtml: "<p>We're thrilled to be working together on <b>" + esc(body.proposal.title) + "</b>.</p>" +
    "<p>Here's what happens next:</p><ol>" + body.proposal.nextSteps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>" +
    "<p>Your first invoice (" + esc(body.proposal.paymentSchedule[0] ? body.proposal.paymentSchedule[0].label : "kickoff") + ") will follow separately.</p>",
  ctaUrl: cfg.bookingUrl || body.links.proposal,
  ctaLabel: cfg.bookingUrl ? "Book your kickoff call" : "View your signed proposal",
});
return [{ json: { to: lead.contact.email, subject: "Welcome to " + cfg.fromName + " · next steps", html } }];`,
    ),
  );
  wf.add(email("Send Welcome Email", [1340, 20], { to: "={{ $json.to }}", subject: "={{ $json.subject }}", html: "={{ $json.html }}" }));
  wf.add(reportEvent("Report Welcome Email", [1560, 20], "{ type: 'email.sent', proposalId: $('Dispatch Webhook').first().json.body.proposal.id, data: { kind: 'welcome', to: $('Compose Welcome Email').first().json.to } }"));

  /* ----------------------------- declined / draft ------------------------- */
  wf.add(
    telegram(
      "Telegram · Declined",
      [900, 160],
      "={{ '🕊 <b>Proposal declined</b> · ' + $('Dispatch Webhook').first().json.body.lead.reference + '\\n' + $('Dispatch Webhook').first().json.body.lead.display.name + ($('Dispatch Webhook').first().json.body.proposal.clientResponse && $('Dispatch Webhook').first().json.body.proposal.clientResponse.note ? '\\n“' + $('Dispatch Webhook').first().json.body.proposal.clientResponse.note + '”' : '') + '\\n<a href=\"' + $('Dispatch Webhook').first().json.body.links.admin + '\">Open lead →</a>' }}",
    ),
  );
  wf.add(
    code(
      "Compose Admin Email · Declined",
      [1120, 280],
      ESCAPE_JS + "\n" + EMAIL_LAYOUT_JS + String.raw`
const body = $('Dispatch Webhook').first().json.body;
const note = body.proposal.clientResponse && body.proposal.clientResponse.note;
const html = emailLayout({
  title: "Proposal declined · " + body.lead.reference,
  bodyHtml: "<p>" + esc(body.lead.display.name) + "</p>" + (note ? "<p><i>“" + esc(note) + "”</i></p>" : ""),
  ctaUrl: body.links.admin,
  ctaLabel: "Open lead",
});
return [{ json: { to: $('Config').first().json.adminEmail, subject: "Declined · " + body.lead.reference, html } }];`,
    ),
  );
  wf.add(email("Admin Email · Declined", [1340, 280], { to: "={{ $json.to }}", subject: "={{ $json.subject }}", html: "={{ $json.html }}" }));
  const appEmails = "={{ ($('Dispatch Webhook').first().json.body.delivery || {}).email !== 'app' }}";
  wf.add(ifNode("n8n sends emails? (accepted)", [900, -100], { left: appEmails, op: "true" }, NAME));
  wf.add(ifNode("n8n sends emails? (declined)", [900, 300], { left: appEmails, op: "true" }, NAME));
  wf.add(
    telegram(
      "Telegram · Sent by app",
      [900, 580],
      "={{ '📤 <b>Proposal emailed</b> · ' + $('Dispatch Webhook').first().json.body.lead.reference + '\\n' + $('Dispatch Webhook').first().json.body.lead.display.name + ' — ' + $('Dispatch Webhook').first().json.body.proposal.display.total + '\\n<a href=\"' + $('Dispatch Webhook').first().json.body.links.admin + '\">Open lead →</a>' }}",
    ),
  );
  wf.add(ifNode("WhatsApp? (sent by app)", [1120, 580], { left: "={{ $('Config').first().json.whatsappEnabled }}", op: "true" }, NAME));
  wf.add(whatsapp("WhatsApp · Sent by app", [1340, 560], "'Proposal emailed: ' + $('Dispatch Webhook').first().json.body.lead.reference + ' · ' + $('Dispatch Webhook').first().json.body.proposal.display.total"));
  wf.add(
    telegram(
      "Telegram · Draft Ready",
      [900, 440],
      "={{ '✨ <b>Proposal draft ready</b> · ' + $('Dispatch Webhook').first().json.body.lead.reference + '\\n' + $('Dispatch Webhook').first().json.body.proposal.title + '\\n💰 ' + $('Dispatch Webhook').first().json.body.proposal.display.total + '\\n<a href=\"' + $('Dispatch Webhook').first().json.body.links.admin + '\">Review & approve →</a>' }}",
    ),
  );

  wf.chain("Telegram · Sent by app", "WhatsApp? (sent by app)");
  wf.connect("WhatsApp? (sent by app)", "WhatsApp · Sent by app", 0);
  wf.chain("Dispatch Webhook", "Respond 202", "Config", "Route Event");
  wf.connect("Route Event", "Get PDF", 0);
  wf.connect("Route Event", "Telegram · Accepted", 1);
  wf.connect("Route Event", "n8n sends emails? (accepted)", 1);
  wf.connect("n8n sends emails? (accepted)", "Compose Welcome Email", 0);
  wf.connect("Route Event", "Telegram · Declined", 2);
  wf.connect("Route Event", "Telegram · Draft Ready", 3);
  wf.connect("Route Event", "Telegram · Sent by app", 4);
  wf.connect("Route Event", "Ignore (test / other)", 5);
  wf.chain("Get PDF", "Compose Proposal Email");
  wf.connect("Compose Proposal Email", "Telegram · Sent");
  wf.connect("Compose Proposal Email", "WhatsApp? (sent)");
  wf.connect("WhatsApp? (sent)", "WhatsApp · Sent", 0);
  wf.chain("Compose Proposal Email", "Compose Admin Email · Sent", "Admin Email · Sent");
  wf.connect("Compose Proposal Email", "Client wants email?");
  wf.connect("Client wants email?", "Email Proposal to Client", 0);
  wf.chain("Email Proposal to Client", "Report proposal.sent (email)");
  wf.connect("Compose Proposal Email", "Client wants WhatsApp?");
  wf.connect("Client wants WhatsApp?", "Compose Client WhatsApp", 0);
  wf.chain("Compose Client WhatsApp", "Send Client WhatsApp", "Report proposal.sent (whatsapp)");
  wf.connect("Telegram · Accepted", "WhatsApp? (accepted)");
  wf.connect("WhatsApp? (accepted)", "WhatsApp · Accepted", 0);
  wf.connect("n8n sends emails? (accepted)", "Compose Admin Email · Accepted", 0);
  wf.chain("Compose Admin Email · Accepted", "Admin Email · Accepted");
  wf.connect("Route Event", "n8n sends emails? (declined)", 2);
  wf.connect("n8n sends emails? (declined)", "Compose Admin Email · Declined", 0);
  wf.chain("Compose Admin Email · Declined", "Admin Email · Declined");
  wf.chain("Compose Welcome Email", "Send Welcome Email", "Report Welcome Email");

  return wf.build();
}
