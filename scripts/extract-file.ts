// Extract one local file without the browser, Storage or the server's time limit:
//   pnpm -s script scripts/extract-file.ts record.pdf > public/demo/record.json
// The JSON on stdout is what the review screen shows, so this is also how to prepare a demo case
// ahead of time (see SAMPLE in src/features/documents/document-review.tsx). A summary goes to stderr.
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { Extraction } from "../src/features/documents/schema";
import { extractDocument } from "../src/features/documents/server";
import { describeError } from "../src/server/llm";

const MEDIA_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".json": "application/json",
};

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("Usage: pnpm -s script scripts/extract-file.ts <file>");
  const bytes = await readFile(path);
  const started = Date.now();
  const { data, model, stopReason, usage } = await extractDocument({
    name: basename(path),
    mediaType: MEDIA_TYPES[extname(path).toLowerCase()] ?? "text/plain",
    bytes,
  });
  const result: Extraction = { data, model, usage, seconds: Math.round((Date.now() - started) / 1000) };
  console.log(JSON.stringify(result, null, 2));
  console.error(
    `${basename(path)}: ${(bytes.length / 1e6).toFixed(1)} MB, ${data.fields.length} fields, ` +
      `${usage.inputTokens} input tokens, ${usage.outputTokens} output tokens, ` +
      `${result.seconds} s, ${model}, stop reason ${stopReason}`,
  );
}

main().catch((err) => {
  console.error(describeError(err).message);
  process.exit(1);
});
