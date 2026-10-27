import { brand } from "@/config/brand";
import { code, config, http, ifNode, reportEvent, sticky, webhook, WorkflowBuilder } from "../builder";
import { ESCAPE_JS } from "../snippets";

const NAME = "ASD 03 · Proposal PDF Generator";

const RENDER_HTML_JS =
  ESCAPE_JS +
  "\nconst BRAND = " +
  JSON.stringify({ name: brand.name, ember: brand.colors.ember, ink: brand.colors.ink, email: brand.contactEmail }) +
  ";\n" +
  String.raw`// Branded HTML proposal → rendered to PDF by Gotenberg (Chromium). Edit freely: it's plain HTML/CSS.
const res = $json;
const p = res.proposal;
const lead = res.lead;
const m = (v) => money(v, p.currency);
const phaseRows = p.phases.map((phase) => {
  const items = p.lineItems.filter((i) => i.included && i.phase === phase.name);
  if (!items.length) return "";
  return '<h3>' + esc(phase.name) + ' <span>' + phase.weeks + ' weeks</span></h3><table>' +
    items.map((i) => '<tr><td><b>' + esc(i.title) + '</b><br><small>' + esc(i.description) + '</small></td><td class="r">' + m(i.price) + (i.billing === "monthly" ? "/mo" : "") + '</td></tr>').join("") +
    '</table>';
}).join("");
const optional = p.lineItems.filter((i) => !i.included);
const total = p.totals.totalWeeks || 1;
let cursor = 0;
const gantt = p.phases.map((phase) => {
  const left = (cursor / total) * 100; cursor += phase.weeks;
  return '<div class="g"><span>' + esc(phase.name) + '</span><i><b style="left:' + left + '%;width:' + Math.max((phase.weeks / total) * 100, 3) + '%"></b></i><em>' + phase.weeks + ' wk</em></div>';
}).join("");
const schedule = p.paymentSchedule.map((s) => '<tr><td>' + esc(s.label) + '</td><td class="r">' + s.percent + '%</td><td class="r">' + m(s.amount) + '</td></tr>').join("");
const html = '<!doctype html><html><head><meta charset="utf-8"><style>' +
  '@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Helvetica,Arial,sans-serif;color:#1c1b19;font-size:11pt;line-height:1.55}' +
  '.cover{height:297mm;padding:24mm 20mm;background:' + BRAND.ink + ';color:#f4f1ea;display:flex;flex-direction:column;justify-content:space-between;background-image:radial-gradient(circle at 15% 20%,rgba(255,138,76,.45),transparent 45%),radial-gradient(circle at 90% 85%,rgba(94,234,212,.25),transparent 40%)}' +
  '.cover h1{font-family:Georgia,serif;font-weight:400;font-size:34pt;line-height:1.1;margin:0}.eyebrow{color:' + BRAND.ember + ';letter-spacing:.25em;font-size:8pt;text-transform:uppercase}' +
  '.meta{display:flex;gap:24px;border-top:1px solid #2a2a34;padding-top:14px;font-size:9pt}.meta small{display:block;color:#8d8983;text-transform:uppercase;letter-spacing:.15em;font-size:7pt}' +
  '.page{padding:18mm 20mm;page-break-before:always}h2{font-family:Georgia,serif;font-weight:400;font-size:18pt;margin:22px 0 8px}h3{font-family:Georgia,serif;font-weight:400;border-bottom:1px solid #1c1b19;padding-bottom:4px;display:flex;justify-content:space-between}h3 span{font:8pt Helvetica;color:#6f6a63;text-transform:uppercase;letter-spacing:.1em}' +
  'table{width:100%;border-collapse:collapse}td{padding:7px 0;border-bottom:1px solid #e7e2d9;vertical-align:top}td small{color:#6f6a63}.r{text-align:right;white-space:nowrap}' +
  '.g{display:flex;align-items:center;gap:10px;margin:6px 0;font-size:9pt}.g span{width:140px}.g i{flex:1;height:10px;background:#efebe4;border-radius:5px;position:relative}.g b{position:absolute;top:0;height:10px;border-radius:5px;background:' + BRAND.ember + '}.g em{width:50px;text-align:right;color:#6f6a63;font-style:normal}' +
  '.total{background:' + BRAND.ink + ';color:#f4f1ea;border-radius:10px;padding:18px 20px;margin:12px 0}.total strong{display:block;font-family:Georgia,serif;font-size:26pt;font-weight:400}' +
  '</style></head><body>' +
  '<section class="cover"><div class="eyebrow">' + esc(BRAND.name) + '</div><div><div class="eyebrow">Project proposal</div><h1>' + esc(p.title) + '</h1><p>Prepared for ' + esc(lead.contact.name) + (lead.contact.company ? ' · ' + esc(lead.contact.company) : '') + '</p></div>' +
  '<div class="meta"><div><small>Reference</small>' + esc(lead.reference) + '</div><div><small>Valid until</small>' + esc(p.validUntil) + '</div><div><small>Investment</small>' + m(p.totals.total) + '</div><div><small>Timeline</small>' + p.totals.totalWeeks + ' weeks</div></div></section>' +
  '<section class="page"><div class="eyebrow">01 — Executive summary</div>' + p.executiveSummary.split(/\n{2,}/).map((x) => '<p>' + esc(x) + '</p>').join("") +
  (p.approach ? '<h2>How we will work together</h2><p>' + esc(p.approach) + '</p>' : '') +
  '<div class="eyebrow" style="margin-top:24px">02 — Scope</div><h2>Deliverables</h2>' + phaseRows +
  (optional.length ? '<h3>Optional add-ons <span>not included</span></h3><table>' + optional.map((i) => '<tr><td>' + esc(i.title) + '</td><td class="r">' + m(i.price) + '</td></tr>').join("") + '</table>' : '') +
  '<div class="eyebrow" style="margin-top:24px">03 — Timeline</div><h2>' + p.totals.totalWeeks + ' weeks from kickoff to launch</h2>' + gantt +
  '<div class="eyebrow" style="margin-top:24px">04 — Investment</div><div class="total">Total project investment<strong>' + m(p.totals.total) + '</strong>' + (p.totals.monthlyTotal ? 'Plus ' + m(p.totals.monthlyTotal) + ' per month' : '') + '</div>' +
  '<table>' + schedule + '</table>' +
  '<h2>Next steps</h2><ol>' + p.nextSteps.map((s) => '<li>' + esc(s) + '</li>').join("") + '</ol>' +
  '<p>Review and accept online: <a href="' + esc(res.links.proposal) + '">' + esc(res.links.proposal) + '</a> · Questions: ' + esc(BRAND.email) + '</p></section>' +
  '</body></html>';
return [{ json: { html, fileName: lead.reference + "-proposal-v" + p.version + ".pdf" } }];`;

export function proposalPdfWorkflow() {
  const wf = new WorkflowBuilder(
    NAME,
    "PDF microservice: POST { proposalId } and receive the branded proposal PDF. Renders with the app's built-in engine (default) or HTML → Gotenberg, and can archive every PDF to Supabase Storage.",
    ["AS Design Studio", "PDF"],
  );

  wf.add(
    sticky("Note · Overview", [-480, -280], [
      "## 03 · Proposal PDF Generator",
      "**Trigger:** `POST /webhook/asd-proposal-pdf` with `{ \"proposalId\": \"…\" }` — called by workflow 04 before emailing the client (or by any other workflow).",
      "",
      "**Engines** (Config → `pdfEngine`):",
      "- `app` *(default)* — downloads the PDF rendered by the app (`GET /api/v1/proposals/:id/pdf`, react-pdf, brand fonts)",
      "- `gotenberg` — builds the HTML below and converts it with a self-hosted Gotenberg container (see docker-compose.yml). Full HTML/CSS control.",
      "",
      "Optionally archives the file to **Supabase Storage** (`uploadToSupabase`).",
      "",
      "Responds with the PDF binary (`application/pdf`).",
    ].join("\n"), { width: 440, height: 400 }, 6),
  );

  wf.add({ ...webhook("PDF Webhook", "asd-proposal-pdf", [0, 0], NAME) });
  wf.add(
    config("Config", [220, 0], [
      { name: "appBaseUrl", value: "https://automation.asdesignlb.com" },
      { name: "pdfEngine", value: "app" },
      { name: "gotenbergUrl", value: "http://gotenberg:3000" },
      { name: "uploadToSupabase", value: false },
      { name: "supabaseUrl", value: "https://YOUR-PROJECT.supabase.co" },
      { name: "supabaseBucket", value: "proposals" },
    ], NAME),
  );
  wf.add(ifNode("Use Gotenberg?", [440, 0], { left: "={{ $('Config').first().json.pdfEngine }}", op: "equals", right: "gotenberg" }, NAME));

  wf.add(
    http("Download App PDF", [680, 120], {
      method: "GET",
      url: "={{ $('Config').first().json.appBaseUrl }}/api/v1/proposals/{{ $('PDF Webhook').first().json.body.proposalId }}/pdf",
      auth: "appApi",
      responseFile: true,
      timeout: 60_000,
    }),
  );

  wf.add(
    http("Fetch Proposal", [680, -120], {
      method: "GET",
      url: "={{ $('Config').first().json.appBaseUrl }}/api/v1/proposals/{{ $('PDF Webhook').first().json.body.proposalId }}",
      auth: "appApi",
    }),
  );
  wf.add(code("Render HTML", [900, -120], RENDER_HTML_JS));
  wf.add({
    name: "HTML to File",
    type: "n8n-nodes-base.convertToFile",
    typeVersion: 1.1,
    position: [1120, -120],
    parameters: { operation: "toText", sourceProperty: "html", binaryPropertyName: "data", options: { fileName: "index.html" } },
  });
  wf.add(
    http("Gotenberg · Chromium", [1340, -120], {
      url: "={{ $('Config').first().json.gotenbergUrl }}/forms/chromium/convert/html",
      multipart: [
        { name: "files", binaryField: "data" },
        { name: "printBackground", value: "true" },
        { name: "preferCssPageSize", value: "true" },
      ],
      responseFile: true,
      timeout: 60_000,
    }),
  );

  wf.add({
    name: "Respond with PDF",
    type: "n8n-nodes-base.respondToWebhook",
    typeVersion: 1.1,
    position: [1580, 0],
    parameters: {
      respondWith: "binary",
      options: { responseHeaders: { entries: [{ name: "Content-Type", value: "application/pdf" }] } },
    },
  });
  wf.add(ifNode("Archive to Supabase?", [1800, 0], { left: "={{ $('Config').first().json.uploadToSupabase }}", op: "true" }, NAME));
  wf.add(
    http("Upload to Storage", [2020, -60], {
      url: "={{ $('Config').first().json.supabaseUrl }}/storage/v1/object/{{ $('Config').first().json.supabaseBucket }}/{{ $('PDF Webhook').first().json.body.proposalId }}.pdf",
      auth: "supabase",
      headers: [
        { name: "x-upsert", value: "true" },
        { name: "Content-Type", value: "application/pdf" },
      ],
      binaryBody: "data",
    }),
  );
  wf.add(
    reportEvent(
      "Report PDF Archived",
      [2240, -60],
      "{ type: 'pdf.generated', proposalId: $('PDF Webhook').first().json.body.proposalId, data: { engine: $('Config').first().json.pdfEngine, storagePath: $('Config').first().json.supabaseBucket + '/' + $('PDF Webhook').first().json.body.proposalId + '.pdf' } }",
    ),
  );

  wf.chain("PDF Webhook", "Config", "Use Gotenberg?");
  wf.connect("Use Gotenberg?", "Fetch Proposal", 0);
  wf.connect("Use Gotenberg?", "Download App PDF", 1);
  wf.chain("Fetch Proposal", "Render HTML", "HTML to File", "Gotenberg · Chromium", "Respond with PDF");
  wf.connect("Download App PDF", "Respond with PDF");
  wf.chain("Respond with PDF", "Archive to Supabase?");
  wf.connect("Archive to Supabase?", "Upload to Storage", 0);
  wf.connect("Upload to Storage", "Report PDF Archived");

  return wf.build();
}
