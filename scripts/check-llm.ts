// End-to-end check of the LLM layer against the real API: `pnpm check-llm`.
// Exercises every path the app uses: plain completion, streaming, structured output, and document
// extraction from PDFs (including page references).
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { FIELDS, needsReview } from "../src/features/documents/schema";
import { extractDocument } from "../src/features/documents/server";
import { complete, describeError, extract, MODEL, ping, streamText } from "../src/server/llm";

const checks: [name: string, run: () => Promise<string>][] = [
  [
    "ping",
    async () => {
      const result = await ping();
      return `"${result.reply}" from ${result.model}`;
    },
  ],
  [
    "complete",
    async () => {
      const result = await complete({
        system: "Answer in one short sentence.",
        prompt: "What does a personal injury case manager do?",
      });
      if (!result.text) throw new Error("empty response");
      return `${result.usage.outputTokens} output tokens`;
    },
  ],
  [
    "stream",
    async () => {
      const reader = streamText({ prompt: "Count from 1 to 20, one number per line." }).getReader();
      const decoder = new TextDecoder();
      let text = "";
      let chunks = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        chunks++;
      }
      if (text.includes("[LLM error:")) throw new Error(text.trim());
      if (!text.includes("20")) throw new Error(`unexpected output: ${text.slice(0, 80)}`);
      return `${chunks} chunks`;
    },
  ],
  [
    "structured output",
    async () => {
      const Schema = z.object({ client: z.string(), injury: z.string(), treating: z.boolean() });
      const { data } = await extract(Schema, {
        prompt:
          "Extract: Riley Sample hurt their lower back in a rear-end collision and is seeing a chiropractor twice a week.",
      });
      if (data.client !== "Riley Sample") throw new Error(`wrong client: ${JSON.stringify(data)}`);
      return JSON.stringify(data);
    },
  ],
  [
    "pdf extraction",
    async () => {
      const { fields } = await extractFixture("sample-collision-report.pdf");
      const value = (label: string) => fields.find((field) => field.label === label)?.value ?? "";
      if (!value("Client").includes("Riley Sample")) throw new Error(`wrong client: ${value("Client")}`);
      if (value("Date of incident") !== "2026-03-14") throw new Error(`wrong date: ${value("Date of incident")}`);
      return `${fields.filter((field) => field.value).length} of ${fields.length} fields found`;
    },
  ],
  [
    // The MRI is on page 7 of the file, which is stamped RS-000107: the page must be the position
    // in the file, because that is what the review screen jumps to.
    "page references",
    async () => {
      const { fields } = await extractFixture("sample-medical-record.pdf");
      const mri = fields.find((field) => field.label === "Treatment" && /MRI/i.test(field.value));
      if (mri?.page !== 7) throw new Error(`expected the MRI on page 7, got ${JSON.stringify(mri)}`);
      const unknown = fields.filter((field) => !FIELDS.some((spec) => spec.label === field.label));
      if (unknown.length) throw new Error(`unrequested labels: ${unknown.map((field) => field.label)}`);
      return `${fields.length} fields, ${fields.filter(needsReview).length} flagged for review`;
    },
  ],
];

async function extractFixture(name: string) {
  const bytes = await readFile(`fixtures/${name}`);
  const { data } = await extractDocument({ name, mediaType: "application/pdf", bytes });
  return data;
}

async function main() {
  console.log(`Model: ${MODEL}\n`);
  let failed = 0;
  for (const [name, run] of checks) {
    const started = Date.now();
    try {
      const detail = await run();
      console.log(`PASS  ${name} (${Date.now() - started} ms): ${detail}`);
    } catch (err) {
      failed++;
      console.log(`FAIL  ${name}: ${describeError(err).message}`);
    }
  }
  console.log(failed ? `\n${failed} of ${checks.length} checks failed.` : "\nAll checks passed.");
  process.exit(failed ? 1 : 0);
}

main();
