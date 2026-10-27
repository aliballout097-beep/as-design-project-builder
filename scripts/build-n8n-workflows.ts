/**
 * Generates the importable n8n workflow templates in n8n/workflows/.
 *
 *   npm run n8n:build   write the JSON files
 *   npm run n8n:check   fail if the committed files are out of date (CI)
 *
 * The AI workflow embeds the system prompt, rate card and JSON schema from
 * src/ — re-run after editing src/config/catalog.ts or src/lib/ai/prompt.ts.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { WORKFLOWS } from "../n8n/src";
import { LEAN_WORKFLOWS } from "../n8n/src/lean";

const outDir = path.join(process.cwd(), "n8n", "workflows");
const check = process.argv.includes("--check");
let stale = 0;

mkdirSync(path.join(outDir, "lean"), { recursive: true });
const outputs: [string, () => unknown][] = [
  ...Object.entries(WORKFLOWS),
  ...Object.entries(LEAN_WORKFLOWS).map(([file, build]): [string, () => unknown] => [`lean/${file}`, build]),
];

for (const [file, build] of outputs) {
  const json = `${JSON.stringify(build(), null, 2)}\n`;
  const target = path.join(outDir, file);
  if (check) {
    let current = "";
    try {
      current = readFileSync(target, "utf8");
    } catch {
      // missing file counts as stale
    }
    if (current !== json) {
      stale++;
      console.error(`✗ ${file} is out of date — run \`npm run n8n:build\``);
    } else {
      console.log(`✓ ${file}`);
    }
  } else {
    writeFileSync(target, json);
    console.log(`wrote n8n/workflows/${file}`);
  }
}

if (stale) process.exit(1);
