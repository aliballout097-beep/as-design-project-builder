import type { N8nWorkflow } from "./builder";
import { leadIntakeWorkflow } from "./workflows/01-lead-intake";
import { aiScopeAnalysisWorkflow } from "./workflows/02-ai-scope-analysis";

/**
 * "Lean" editions for the recommended split: the app sends every email and the
 * client WhatsApp itself; n8n runs the AI analysis. They contain only the nodes
 * that split needs — no Telegram, WhatsApp, SMTP or unused AI-provider nodes,
 * whose missing credentials would otherwise stop n8n from publishing the
 * workflow. Needed credentials: "ASD · Webhook auth (app → n8n)",
 * "ASD · App API (n8n → app)" and "ASD · OpenAI API key".
 *
 * App side: ANALYSIS_RUNNER=n8n, N8N_WEBHOOK_LEAD_INTAKE=off,
 * N8N_WEBHOOK_DISPATCH=off, N8N_CRM_SYNC_ENABLED=false.
 */

interface PruneOptions {
  name: string;
  description: string;
  remove: string[];
  /** Extra connections to add after pruning: [from, to, output]. */
  connect?: [string, string, number][];
  /** Config node field overrides. */
  config?: Record<string, string | number | boolean>;
  /** Replace sticky-note content by node name. */
  notes?: Record<string, string>;
}

function prune(workflow: N8nWorkflow, o: PruneOptions): N8nWorkflow {
  const removed = new Set(o.remove);
  for (const name of removed) {
    if (!workflow.nodes.some((node) => node.name === name)) throw new Error(`lean: unknown node "${name}" in ${workflow.name}`);
  }
  const nodes = workflow.nodes
    .filter((node) => !removed.has(node.name))
    .map((node) => {
      if (node.type === "n8n-nodes-base.stickyNote" && o.notes?.[node.name]) {
        return { ...node, parameters: { ...node.parameters, content: o.notes[node.name] } };
      }
      if (node.name === "Config" && o.config) {
        const params = node.parameters as { assignments: { assignments: { name: string; value: unknown }[] } };
        const assignments = params.assignments.assignments.map((a) => (a.name in o.config! ? { ...a, value: o.config![a.name] } : a));
        return { ...node, parameters: { ...params, assignments: { assignments } } };
      }
      return node;
    });

  const connections: N8nWorkflow["connections"] = {};
  for (const [from, value] of Object.entries(workflow.connections)) {
    if (removed.has(from)) continue;
    const main = value.main.map((branch) => branch.filter((target) => !removed.has(target.node)));
    while (main.length && main[main.length - 1].length === 0) main.pop();
    if (main.length) connections[from] = { main };
  }
  for (const [from, to, output] of o.connect ?? []) {
    const entry = (connections[from] ??= { main: [] });
    while (entry.main.length <= output) entry.main.push([]);
    entry.main[output].push({ node: to, type: "main", index: 0 });
  }
  return { ...workflow, name: o.name, nodes, connections, meta: { ...workflow.meta, description: o.description } };
}

export function leanAnalysisWorkflow(): N8nWorkflow {
  return prune(aiScopeAnalysisWorkflow(), {
    name: "ASD 02 · AI Scope & Budget Analysis (OpenAI)",
    description:
      "Receives `analysis.requested` from the app, runs the scope & budget analysis on OpenAI (strict JSON schema) and posts it to POST /api/v1/proposals. The app sends the live prompt with every request, so price changes in Settings → Pricing apply immediately; it then prices the plans, builds the PDF and emails/WhatsApps the client itself.",
    remove: ["Use OpenAI?", "Claude · Messages API", "Format Ready Alert", "Telegram · Draft Ready", "Telegram · Failure"],
    connect: [["Build AI Request", "OpenAI · Chat Completions", 0]],
    config: { aiProvider: "openai" },
    notes: {
      "Note · Overview": [
        "## 02 · AI Scope & Budget Analysis (OpenAI)",
        "**Trigger:** the app POSTs `analysis.requested` here after every new brief.",
        "",
        "1. Replies 202 right away",
        "2. Uses the live prompt the app sends (your current prices from Settings → Pricing, with this client's exact plan prices) + a strict JSON schema",
        "3. Calls **OpenAI** with a strict `json_schema` response",
        "4. Posts the analysis to `POST /api/v1/proposals` (idempotent) — the app checks the prices, adds the current offer, renders the PDF and sends it to the client by email + WhatsApp",
        "5. On failure it reports `analysis.failed` and the app generates the proposal itself, so no client is left waiting",
        "",
        "**Credentials:** *ASD · Webhook auth (app → n8n)*, *ASD · App API (n8n → app)*, *ASD · OpenAI API key* (Header Auth · Name `Authorization` · Value `Bearer sk-…`).",
        "**Config:** `appBaseUrl`, `openaiModel`.",
      ].join("\n"),
    },
  });
}

export function leanImportWorkflow(): N8nWorkflow {
  const full = leadIntakeWorkflow();
  const importNodes = new Set(["Note · External leads", "External Lead Webhook", "Config (import)", "Map Fields", "Create Lead", "Respond Created", "Respond Invalid"]);
  return prune(full, {
    name: "ASD 01 · Import External Leads",
    description:
      "Optional. Point Typeform, Webflow forms, Meta Lead Ads (or any tool) at POST /webhook/asd-external-lead — each lead is created in the app and flows through the normal pipeline (email alert to the team, AI analysis, proposal).",
    remove: full.nodes.map((node) => node.name).filter((name) => !importNodes.has(name)),
  });
}

/** Lean editions, keyed by output file name (written to n8n/workflows/lean/). */
export const LEAN_WORKFLOWS = {
  "02-ai-scope-analysis-openai.json": leanAnalysisWorkflow,
  "01-import-external-leads.json": leanImportWorkflow,
} as const;
