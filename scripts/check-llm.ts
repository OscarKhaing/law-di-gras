// End-to-end check of the LLM layer against the real API: `pnpm check-llm`.
// Exercises every path the app uses: plain completion, streaming and structured output. Reading a
// PDF is checked with `pnpm -s script scripts/index-documents.ts --local <file.pdf>`.
import { z } from "zod";
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
];

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
