import { code, config, http, ifNode, noop, reportEvent, respond, sticky, webhook, WorkflowBuilder } from "../builder";

const NAME = "ASD 05 · CRM Sync (Airtable · Notion · Supabase)";

const MAP_JS = String.raw`// One flat record per lead, reused by every CRM target.
const body = $('CRM Webhook').first().json.body;
const lead = body.lead, p = body.proposal, links = body.links;
const record = {
  Reference: lead.reference,
  Name: lead.contact.name,
  Email: lead.contact.email,
  Phone: lead.contact.phone || "",
  Company: lead.contact.company || "",
  Status: lead.status,
  Services: lead.project.services,
  ServicesLabel: lead.display.services,
  Budget: lead.display.budget,
  Timeline: lead.display.timeline,
  Source: lead.source,
  "Fit Score": lead.fitScore,
  "Estimated Value": lead.estimatedValue,
  "Proposal Status": p ? p.status : "",
  "Proposal Total": p ? p.totals.total : null,
  "Last Event": body.trigger,
  Created: lead.createdAt,
  Dashboard: links.admin,
  Proposal: links.proposal || "",
};
const text = (v) => ({ rich_text: [{ text: { content: String(v || "").slice(0, 1900) } }] });
const notionProperties = {
  Name: { title: [{ text: { content: record.Company ? record.Company + " — " + record.Name : record.Name } }] },
  Reference: text(record.Reference),
  Email: { email: record.Email },
  Phone: { phone_number: record.Phone || null },
  Company: text(record.Company),
  Status: { select: { name: record.Status } },
  Services: { multi_select: lead.display.services.split(", ").filter(Boolean).map((name) => ({ name: name.replace(/,/g, "") })) },
  Budget: text(record.Budget),
  Timeline: text(record.Timeline),
  "Fit Score": { number: record["Fit Score"] },
  "Estimated Value": { number: record["Estimated Value"] },
  "Proposal Total": { number: record["Proposal Total"] },
  Created: { date: { start: record.Created } },
  Dashboard: { url: record.Dashboard },
  Proposal: { url: record.Proposal || null },
};
const supabaseRow = {
  lead_reference: record.Reference, lead_id: lead.id, name: record.Name, email: record.Email, phone: record.Phone || null,
  company: record.Company || null, status: record.Status, services: record.Services, budget: record.Budget, timeline: record.Timeline,
  source: record.Source, fit_score: record["Fit Score"], estimated_value: record["Estimated Value"], proposal_status: record["Proposal Status"] || null,
  proposal_total: record["Proposal Total"], dashboard_url: record.Dashboard, proposal_url: record.Proposal || null, last_event: record["Last Event"],
  updated_at: new Date().toISOString(),
};
const airtableFields = Object.assign({}, record, { Services: record.ServicesLabel });
delete airtableFields.ServicesLabel;
return [{ json: { leadId: lead.id, record, airtableFields, notionProperties, supabaseRow } }];`;

export function crmSyncWorkflow() {
  const wf = new WorkflowBuilder(
    NAME,
    "Receives `crm.sync` for every lifecycle change (lead created, proposal created/approved/sent/accepted/declined, status changes) and upserts one record per lead into Airtable, Notion and/or a Supabase table.",
    ["AS Design Studio", "CRM"],
  );

  wf.add(
    sticky("Note · Overview", [-480, -320], [
      "## 05 · CRM Sync",
      "**Trigger:** the app POSTs `crm.sync` with `{ trigger, lead, proposal, links }` on every lifecycle change.",
      "",
      "Enable the targets you use in ⚙️ Config — each upserts on the lead **Reference** so records never duplicate:",
      "- **Airtable** — `PATCH /v0/{base}/{table}` with `performUpsert` · credential *ASD · Airtable* (personal access token)",
      "- **Notion** — query the database by Reference, then update or create the page · credential *ASD · Notion*",
      "- **Supabase** — `POST /rest/v1/crm_contacts?on_conflict=lead_reference` (table in `supabase/migrations`) · credential *ASD · Supabase CRM*",
      "",
      "Record ids are reported back (`crm.synced`) and shown on the lead in the dashboard.",
      "Field names & Notion property types: see README → CRM sync.",
    ].join("\n"), { width: 460, height: 400 }, 6),
  );

  wf.add(webhook("CRM Webhook", "asd-crm-sync", [0, 0], NAME));
  wf.add(respond("Respond 202", [220, 0], "={{ JSON.stringify({ accepted: true, executionId: $execution.id }) }}"));
  wf.add(
    config("Config", [440, 0], [
      { name: "appBaseUrl", value: "https://automation.asdesignlb.com" },
      { name: "airtableEnabled", value: false },
      { name: "airtableBaseId", value: "appXXXXXXXXXXXXXX" },
      { name: "airtableTable", value: "Leads" },
      { name: "notionEnabled", value: false },
      { name: "notionDatabaseId", value: "REPLACE_WITH_NOTION_DATABASE_ID" },
      { name: "supabaseEnabled", value: false },
      { name: "supabaseUrl", value: "https://YOUR-PROJECT.supabase.co" },
      { name: "supabaseTable", value: "crm_contacts" },
    ], NAME),
  );
  wf.add(ifNode("Is test ping?", [660, 0], { left: "={{ $('CRM Webhook').first().json.body.type }}", op: "equals", right: "test.ping" }, NAME));
  wf.add(noop("Test OK", [880, -140]));
  wf.add(code("Map CRM Record", [880, 60], MAP_JS));

  // Airtable
  wf.add(ifNode("Airtable enabled?", [1100, -140], { left: "={{ $('Config').first().json.airtableEnabled }}", op: "true" }, NAME));
  wf.add({
    ...http("Airtable · Upsert", [1320, -160], {
      method: "PATCH",
      url: "=https://api.airtable.com/v0/{{ $('Config').first().json.airtableBaseId }}/{{ encodeURIComponent($('Config').first().json.airtableTable) }}",
      auth: "airtable",
      jsonBody: "={{ JSON.stringify({ performUpsert: { fieldsToMergeOn: ['Reference'] }, typecast: true, records: [{ fields: $('Map CRM Record').first().json.airtableFields }] }) }}",
    }),
    onError: "continueRegularOutput",
  });
  wf.add(reportEvent("Report Airtable", [1540, -160], "{ type: 'crm.synced', leadId: $('Map CRM Record').first().json.leadId, data: { provider: 'airtable', airtableRecordId: $json.records && $json.records[0] ? $json.records[0].id : undefined } }"));

  // Notion
  wf.add(ifNode("Notion enabled?", [1100, 60], { left: "={{ $('Config').first().json.notionEnabled }}", op: "true" }, NAME));
  const notionHeaders = [{ name: "Notion-Version", value: "2022-06-28" }];
  wf.add(
    http("Notion · Find Page", [1320, 40], {
      url: "=https://api.notion.com/v1/databases/{{ $('Config').first().json.notionDatabaseId }}/query",
      auth: "notion",
      headers: notionHeaders,
      jsonBody: "={{ JSON.stringify({ page_size: 1, filter: { property: 'Reference', rich_text: { equals: $('Map CRM Record').first().json.record.Reference } } }) }}",
    }),
  );
  wf.add(ifNode("Page exists?", [1540, 40], { left: "={{ $json.results && $json.results[0] ? $json.results[0].id : '' }}", op: "notEquals", right: "" }, NAME));
  wf.add(
    http("Notion · Update Page", [1760, -20], {
      method: "PATCH",
      url: "=https://api.notion.com/v1/pages/{{ $('Notion · Find Page').first().json.results[0].id }}",
      auth: "notion",
      headers: notionHeaders,
      jsonBody: "={{ JSON.stringify({ properties: $('Map CRM Record').first().json.notionProperties }) }}",
    }),
  );
  wf.add(
    http("Notion · Create Page", [1760, 120], {
      url: "https://api.notion.com/v1/pages",
      auth: "notion",
      headers: notionHeaders,
      jsonBody: "={{ JSON.stringify({ parent: { database_id: $('Config').first().json.notionDatabaseId }, properties: $('Map CRM Record').first().json.notionProperties }) }}",
    }),
  );
  wf.add(reportEvent("Report Notion", [1980, 40], "{ type: 'crm.synced', leadId: $('Map CRM Record').first().json.leadId, data: { provider: 'notion', notionPageId: $json.id } }"));

  // Supabase
  wf.add(ifNode("Supabase enabled?", [1100, 260], { left: "={{ $('Config').first().json.supabaseEnabled }}", op: "true" }, NAME));
  wf.add({
    ...http("Supabase · Upsert", [1320, 260], {
      url: "={{ $('Config').first().json.supabaseUrl }}/rest/v1/{{ $('Config').first().json.supabaseTable }}?on_conflict=lead_reference",
      auth: "supabase",
      headers: [{ name: "Prefer", value: "resolution=merge-duplicates,return=representation" }],
      jsonBody: "={{ JSON.stringify($('Map CRM Record').first().json.supabaseRow) }}",
    }),
    onError: "continueRegularOutput",
  });
  wf.add(reportEvent("Report Supabase", [1540, 260], "{ type: 'crm.synced', leadId: $('Map CRM Record').first().json.leadId, data: { provider: 'supabase', supabaseRecordId: Array.isArray($json) ? String($json[0] && $json[0].id) : ($json.id ? String($json.id) : undefined) } }"));

  wf.chain("CRM Webhook", "Respond 202", "Config", "Is test ping?");
  wf.connect("Is test ping?", "Test OK", 0);
  wf.connect("Is test ping?", "Map CRM Record", 1);
  wf.connect("Map CRM Record", "Airtable enabled?");
  wf.connect("Map CRM Record", "Notion enabled?");
  wf.connect("Map CRM Record", "Supabase enabled?");
  wf.connect("Airtable enabled?", "Airtable · Upsert", 0);
  wf.connect("Airtable · Upsert", "Report Airtable");
  wf.connect("Notion enabled?", "Notion · Find Page", 0);
  wf.connect("Notion · Find Page", "Page exists?");
  wf.connect("Page exists?", "Notion · Update Page", 0);
  wf.connect("Page exists?", "Notion · Create Page", 1);
  wf.connect("Notion · Update Page", "Report Notion");
  wf.connect("Notion · Create Page", "Report Notion");
  wf.connect("Supabase enabled?", "Supabase · Upsert", 0);
  wf.connect("Supabase · Upsert", "Report Supabase");

  return wf.build();
}
