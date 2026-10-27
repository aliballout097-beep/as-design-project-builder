import { afterEach, describe, expect, it } from "vitest";
import { getConfig, resetConfigForTests } from "@/lib/env";
import { LEAN_WORKFLOWS } from "../n8n/src/lean";

describe("lean n8n editions (app sends emails & WhatsApp, n8n runs the analysis)", () => {
  for (const [file, build] of Object.entries(LEAN_WORKFLOWS)) {
    it(`${file} only needs credentials the split uses, with no loose connections`, () => {
      const workflow = build();
      const credentials = new Set(workflow.nodes.flatMap((node) => Object.values(node.credentials ?? {}).map((c) => c.name)));
      expect([...credentials].every((name) => /Webhook auth|App API|OpenAI/.test(name))).toBe(true);
      expect(workflow.nodes.some((node) => /telegram|emailSend/i.test(node.type))).toBe(false);
      const names = new Set(workflow.nodes.map((node) => node.name));
      for (const [from, value] of Object.entries(workflow.connections)) {
        expect(names.has(from)).toBe(true);
        for (const branch of value.main) for (const target of branch) expect(names.has(target.node)).toBe(true);
      }
    });
  }
});

describe("turning individual n8n webhooks off", () => {
  afterEach(() => {
    for (const key of ["N8N_WEBHOOK_BASE_URL", "N8N_WEBHOOK_LEAD_INTAKE", "N8N_WEBHOOK_DISPATCH", "N8N_CRM_SYNC_ENABLED", "ANALYSIS_RUNNER"]) delete process.env[key];
    resetConfigForTests();
  });

  it("keeps only the analysis webhook and still runs the analysis in n8n", () => {
    process.env.N8N_WEBHOOK_BASE_URL = "https://n8n.example.com/webhook";
    process.env.N8N_WEBHOOK_LEAD_INTAKE = "off";
    process.env.N8N_WEBHOOK_DISPATCH = "off";
    process.env.N8N_CRM_SYNC_ENABLED = "false";
    resetConfigForTests();
    const { n8n, analysisRunner } = getConfig();
    expect(n8n.urls).toEqual({ leadIntake: null, analysis: "https://n8n.example.com/webhook/asd-ai-analysis", dispatch: null, crmSync: null });
    expect(analysisRunner).toBe("n8n");
  });
});
