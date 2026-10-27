import { createHash } from "node:crypto";

/**
 * Tiny, dependency-free builder for importable n8n workflow JSON.
 *
 * Node ids and webhook ids are derived deterministically from the workflow and
 * node names so `npm run n8n:build` is reproducible (and `n8n:check` can diff).
 */

export interface N8nNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  credentials?: Record<string, { id: string; name: string }>;
  webhookId?: string;
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  onError?: "continueErrorOutput" | "continueRegularOutput" | "stopWorkflow";
  notes?: string;
  notesInFlow?: boolean;
}

export interface N8nWorkflow {
  name: string;
  nodes: N8nNode[];
  connections: Record<string, { main: { node: string; type: "main"; index: number }[][] }>;
  pinData: Record<string, never>;
  settings: Record<string, unknown>;
  staticData: null;
  tags: { name: string }[];
  meta: { templateCredsSetupCompleted: boolean; description: string };
  active: boolean;
}

export function stableUuid(...parts: string[]): string {
  const hex = createHash("sha1").update(parts.join("::")).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Credential references. Create credentials with these exact names before importing and n8n binds them automatically. */
export const CREDENTIALS = {
  webhookAuth: { type: "httpHeaderAuth", name: "ASD · Webhook auth (app → n8n)" },
  appApi: { type: "httpHeaderAuth", name: "ASD · App API (n8n → app)" },
  anthropic: { type: "httpHeaderAuth", name: "ASD · Anthropic API key" },
  openai: { type: "httpHeaderAuth", name: "ASD · OpenAI API key" },
  whatsapp: { type: "httpHeaderAuth", name: "ASD · WhatsApp Cloud API token" },
  telegram: { type: "telegramApi", name: "ASD · Telegram bot" },
  smtp: { type: "smtp", name: "ASD · SMTP" },
  airtable: { type: "airtableTokenApi", name: "ASD · Airtable" },
  notion: { type: "notionApi", name: "ASD · Notion" },
  supabase: { type: "supabaseApi", name: "ASD · Supabase CRM" },
} as const;
export type CredentialKey = keyof typeof CREDENTIALS;

export function credential(key: CredentialKey) {
  const c = CREDENTIALS[key];
  return { [c.type]: { id: stableUuid("credential", key).slice(0, 16).replace(/-/g, ""), name: c.name } };
}

export class WorkflowBuilder {
  private readonly nodes: N8nNode[] = [];
  private readonly connections: N8nWorkflow["connections"] = {};

  constructor(
    private readonly name: string,
    private readonly description: string,
    /** Kept for documentation in the generator source; not emitted (see `build`). */
    readonly suggestedTags: string[] = ["AS Design Studio"],
  ) {}

  add(node: Omit<N8nNode, "id"> & { id?: string }): string {
    if (this.nodes.some((n) => n.name === node.name)) throw new Error(`Duplicate node name "${node.name}" in ${this.name}`);
    this.nodes.push({ id: stableUuid(this.name, node.name), ...node } as N8nNode);
    return node.name;
  }

  connect(from: string, to: string, output = 0, input = 0): this {
    const entry = (this.connections[from] ??= { main: [] });
    while (entry.main.length <= output) entry.main.push([]);
    entry.main[output].push({ node: to, type: "main", index: input });
    return this;
  }

  /** Connect a chain a → b → c on output 0. */
  chain(...names: string[]): this {
    for (let i = 0; i < names.length - 1; i++) this.connect(names[i], names[i + 1]);
    return this;
  }

  build(): N8nWorkflow {
    for (const [from, value] of Object.entries(this.connections)) {
      if (!this.nodes.some((n) => n.name === from)) throw new Error(`Connection from unknown node "${from}"`);
      for (const branch of value.main) for (const target of branch) {
        if (!this.nodes.some((n) => n.name === target.node)) throw new Error(`Connection to unknown node "${target.node}"`);
      }
    }
    return {
      name: this.name,
      nodes: this.nodes,
      connections: this.connections,
      pinData: {},
      settings: { executionOrder: "v1", saveManualExecutions: true, callerPolicy: "workflowsFromSameOwner" },
      staticData: null,
      // Tags are left empty: n8n's importer creates tags by name and collides when several
      // templates share one. Add your own tags after importing.
      tags: [],
      meta: { templateCredsSetupCompleted: false, description: this.description },
      active: false,
    };
  }
}

/* ----------------------------------------------------------------------------
 * Node factories (n8n 1.x / 2.x node type versions)
 * ------------------------------------------------------------------------- */

type Pos = [number, number];

export const webhook = (name: string, path: string, position: Pos, workflow: string) => ({
  name,
  type: "n8n-nodes-base.webhook",
  typeVersion: 2,
  position,
  webhookId: stableUuid("webhook", workflow, path),
  parameters: { httpMethod: "POST", path, authentication: "headerAuth", responseMode: "responseNode", options: {} },
  credentials: credential("webhookAuth"),
});

export const respond = (name: string, position: Pos, body: string, code = 202) => ({
  name,
  type: "n8n-nodes-base.respondToWebhook",
  typeVersion: 1.1,
  position,
  parameters: { respondWith: "json", responseBody: body, options: { responseCode: code } },
});

type Assignment = { name: string; value: string | number | boolean; type?: "string" | "number" | "boolean" };

export const config = (name: string, position: Pos, fields: Assignment[], workflow: string) => ({
  name,
  type: "n8n-nodes-base.set",
  typeVersion: 3.4,
  position,
  parameters: {
    mode: "manual",
    assignments: {
      assignments: fields.map((field) => ({
        id: stableUuid(workflow, name, field.name),
        name: field.name,
        value: field.value,
        type: field.type ?? (typeof field.value === "boolean" ? "boolean" : typeof field.value === "number" ? "number" : "string"),
      })),
    },
    includeOtherFields: false,
    options: {},
  },
  notes: "⚙️ Edit these values for your installation.",
  notesInFlow: true,
});

export const code = (name: string, position: Pos, jsCode: string, extra: Partial<N8nNode> = {}) => ({
  name,
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position,
  parameters: { jsCode },
  ...extra,
});

type Condition =
  | { left: string; op: "true" | "false" }
  | { left: string; op: "equals" | "notEquals"; right: string }
  | { left: string; op: "exists" | "notExists" };

function conditionJson(workflow: string, nodeName: string, index: number, c: Condition) {
  const id = stableUuid(workflow, nodeName, "condition", String(index));
  if (c.op === "true" || c.op === "false") {
    return { id, leftValue: c.left, rightValue: "", operator: { type: "boolean", operation: c.op, singleValue: true } };
  }
  if (c.op === "exists" || c.op === "notExists") {
    return { id, leftValue: c.left, rightValue: "", operator: { type: "string", operation: c.op, singleValue: true } };
  }
  const compare = c as Extract<Condition, { right: string }>;
  return { id, leftValue: compare.left, rightValue: compare.right, operator: { type: "string", operation: compare.op } };
}

const conditionOptions = { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 };

export const ifNode = (name: string, position: Pos, condition: Condition, workflow: string) => ({
  name,
  type: "n8n-nodes-base.if",
  typeVersion: 2.2,
  position,
  parameters: {
    conditions: { options: conditionOptions, conditions: [conditionJson(workflow, name, 0, condition)], combinator: "and" },
    options: {},
  },
});

export const switchNode = (name: string, position: Pos, left: string, cases: { key: string; equals: string }[], workflow: string) => ({
  name,
  type: "n8n-nodes-base.switch",
  typeVersion: 3.2,
  position,
  parameters: {
    rules: {
      values: cases.map((c, index) => ({
        conditions: {
          options: conditionOptions,
          conditions: [conditionJson(workflow, name, index, { left, op: "equals", right: c.equals })],
          combinator: "and",
        },
        renameOutput: true,
        outputKey: c.key,
      })),
    },
    options: { fallbackOutput: "extra", renameFallbackOutput: "other" },
  },
});

export interface HttpOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT";
  url: string;
  auth?: CredentialKey;
  headers?: { name: string; value: string }[];
  jsonBody?: string;
  binaryBody?: string;
  multipart?: { name: string; value?: string; binaryField?: string }[];
  responseFile?: boolean;
  timeout?: number;
  retry?: boolean;
  errorOutput?: boolean;
}

export const http = (name: string, position: Pos, o: HttpOptions) => {
  const cred = o.auth ? CREDENTIALS[o.auth] : null;
  const predefined = cred && cred.type !== "httpHeaderAuth";
  const parameters: Record<string, unknown> = {
    method: o.method ?? "POST",
    url: o.url,
    ...(cred
      ? predefined
        ? { authentication: "predefinedCredentialType", nodeCredentialType: cred.type }
        : { authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth" }
      : {}),
    ...(o.headers?.length ? { sendHeaders: true, headerParameters: { parameters: o.headers } } : {}),
  };
  if (o.jsonBody) Object.assign(parameters, { sendBody: true, specifyBody: "json", jsonBody: o.jsonBody });
  if (o.binaryBody) Object.assign(parameters, { sendBody: true, contentType: "binaryData", inputDataFieldName: o.binaryBody });
  if (o.multipart) {
    Object.assign(parameters, {
      sendBody: true,
      contentType: "multipart-form-data",
      bodyParameters: {
        parameters: o.multipart.map((p) =>
          p.binaryField ? { parameterType: "formBinaryData", name: p.name, inputDataFieldName: p.binaryField } : { name: p.name, value: p.value ?? "" },
        ),
      },
    });
  }
  parameters.options = {
    timeout: o.timeout ?? 30_000,
    ...(o.responseFile ? { response: { response: { responseFormat: "file", outputPropertyName: "data" } } } : {}),
  };
  return {
    name,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position,
    parameters,
    ...(o.auth ? { credentials: credential(o.auth) } : {}),
    ...(o.retry === false ? {} : { retryOnFail: true, maxTries: 3, waitBetweenTries: 3000 }),
    ...(o.errorOutput ? { onError: "continueErrorOutput" as const } : {}),
  };
};

export const telegram = (name: string, position: Pos, text: string) => ({
  name,
  type: "n8n-nodes-base.telegram",
  typeVersion: 1.2,
  position,
  parameters: {
    chatId: "={{ $('Config').first().json.telegramChatId }}",
    text,
    additionalFields: { appendAttribution: false, parse_mode: "HTML", disable_web_page_preview: true },
  },
  credentials: credential("telegram"),
  onError: "continueRegularOutput" as const,
});

export const email = (name: string, position: Pos, o: { to: string; subject: string; html: string; attachments?: string }) => ({
  name,
  type: "n8n-nodes-base.emailSend",
  typeVersion: 2.1,
  position,
  parameters: {
    fromEmail: "={{ $('Config').first().json.fromName + ' <' + $('Config').first().json.fromEmail + '>' }}",
    toEmail: o.to,
    subject: o.subject,
    // HTML + plain-text alternative: HTML-only mail scores worse with spam filters.
    emailFormat: "both",
    text: "={{ $json.text || String($json.html || '').replace(/<(style|head)[\\s\\S]*?<\\/\\1>/gi, '').replace(/<br\\s*\\/?>/gi, '\\n').replace(/<\\/(p|tr|h1|li)>/gi, '\\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[ \\t]+/g, ' ').replace(/\\n\\s*\\n\\s*\\n+/g, '\\n\\n').trim() }}",
    html: o.html,
    options: {
      appendAttribution: false,
      replyTo: "={{ $('Config').first().json.replyTo }}",
      ...(o.attachments ? { attachments: o.attachments } : {}),
    },
  },
  credentials: credential("smtp"),
  retryOnFail: true,
  maxTries: 2,
  waitBetweenTries: 5000,
});

export const sticky = (name: string, position: Pos, content: string, size: { width: number; height: number }, color = 7) => ({
  name,
  type: "n8n-nodes-base.stickyNote",
  typeVersion: 1,
  position,
  parameters: { content, width: size.width, height: size.height, color },
});

export const noop = (name: string, position: Pos) => ({ name, type: "n8n-nodes-base.noOp", typeVersion: 1, position, parameters: {} });

/** Report an event back to the app (POST /api/v1/events). `body` is an n8n expression producing an object. */
export const reportEvent = (name: string, position: Pos, bodyExpression: string) => ({
  ...http(name, position, {
    url: "={{ $('Config').first().json.appBaseUrl }}/api/v1/events",
    auth: "appApi",
    jsonBody: `={{ JSON.stringify(${bodyExpression}) }}`,
    timeout: 15_000,
  }),
  // Reporting back is best-effort: never fail the workflow because the app was briefly unreachable.
  onError: "continueRegularOutput" as const,
});
