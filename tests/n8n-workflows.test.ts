import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildUserMessage } from "@/lib/ai/prompt";
import { WORKFLOWS } from "../n8n/src";
import { CREDENTIALS } from "../n8n/src/builder";
import { promptConstantsJs, USER_MESSAGE_JS } from "../n8n/src/workflows/02-ai-scope-analysis";
import { makeLead } from "./helpers";
import { toAiBrief } from "@/lib/ai/brief";

const built = Object.entries(WORKFLOWS).map(([file, build]) => ({ file, wf: build() }));

describe("n8n workflow templates", () => {
  it.each(built)("$file is structurally valid", ({ wf }) => {
    const names = wf.nodes.map((n) => n.name);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(wf.nodes.map((n) => n.id)).size).toBe(names.length);
    for (const [from, value] of Object.entries(wf.connections)) {
      expect(names).toContain(from);
      for (const branch of value.main) for (const target of branch) expect(names).toContain(target.node);
    }
    // Every non-sticky node except triggers must be reachable.
    const targets = new Set(Object.values(wf.connections).flatMap((c) => c.main.flat().map((t) => t.node)));
    for (const node of wf.nodes) {
      if (node.type === "n8n-nodes-base.stickyNote" || node.type === "n8n-nodes-base.webhook") continue;
      expect(targets.has(node.name), `${node.name} is unreachable`).toBe(true);
    }
    const knownCredNames = new Set(Object.values(CREDENTIALS).map((c) => c.name));
    for (const node of wf.nodes) for (const cred of Object.values(node.credentials ?? {})) expect(knownCredNames).toContain(cred.name);
    expect(wf.settings.executionOrder).toBe("v1");
  });

  it("uses unique webhook paths guarded by header auth", () => {
    const hooks = built.flatMap(({ wf }) => wf.nodes.filter((n) => n.type === "n8n-nodes-base.webhook"));
    const paths = hooks.map((h) => h.parameters.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toEqual(expect.arrayContaining(["asd-lead-intake", "asd-ai-analysis", "asd-proposal-pdf", "asd-proposal-dispatch", "asd-crm-sync"]));
    for (const hook of hooks) expect(hook.parameters.authentication).toBe("headerAuth");
  });

  it("every Code node contains syntactically valid JavaScript", () => {
    for (const { file, wf } of built) {
      for (const node of wf.nodes.filter((n) => n.type === "n8n-nodes-base.code")) {
        expect(() => new Function(`return (async () => {${node.parameters.jsCode as string}\n})`), `${file} › ${node.name}`).not.toThrow();
      }
    }
  });

  it("the n8n prompt builder matches the app's buildUserMessage exactly", () => {
    const twin = new Function(`${promptConstantsJs()}\n${USER_MESSAGE_JS}\nreturn buildUserMessage;`)() as typeof buildUserMessage;
    const brief = toAiBrief(makeLead());
    const cases = [{}, { instructions: " Fit phase one within $12k " }, { previous: { recommended: 18000, totalWeeks: 10, projectType: "Web" }, instructions: null }];
    for (const options of cases) expect(twin(brief, options)).toBe(buildUserMessage(brief, options));
  });

  it("committed JSON files are up to date (run `npm run n8n:build`)", () => {
    for (const { file, wf } of built) {
      const committed = readFileSync(path.join(process.cwd(), "n8n", "workflows", file), "utf8");
      expect(committed).toBe(`${JSON.stringify(wf, null, 2)}\n`);
    }
  });
});
