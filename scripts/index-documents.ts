// Index the pages of a case's documents, outside the server's time limit:
//   pnpm -s script scripts/index-documents.ts [matterId] [--only D3] [--local <file.pdf>]
// Without a matter id, the case most recently read from Clio. Documents go smallest first, so a run
// that is stopped early has already indexed the short ones; parts already stored are skipped.
// --local splits and reads a file on this machine and prints its page notes; nothing is stored.
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { getCaseFile, listCases } from "../src/features/cases/server";
import { indexDocument, indexUsage, photoOnPage, readPart, splitPdf, type PartReport } from "../src/features/documents/server";
import { describeError } from "../src/server/llm";

// Haiku 4.5, in dollars per million tokens.
const cost = (inputTokens: number, outputTokens: number) => (inputTokens * 1 + outputTokens * 5) / 1_000_000;
const dollars = (amount: number) => `$${amount.toFixed(2)}`;
const pageRange = (from: number, to: number) => (from === to ? `p. ${from}` : `pp. ${from}-${to}`);

function option(name: string) {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
}

async function indexLocal(path: string) {
  const { pages, parts } = await splitPdf(await readFile(path));
  console.log(`${basename(path)}: ${pages} pages in ${parts.length} ${parts.length === 1 ? "part" : "parts"}`);
  let inputTokens = 0;
  let outputTokens = 0;
  const readings = await Promise.all(
    parts.map(async (part) => {
      const result = await readPart(basename(path), part);
      inputTokens += result.usage.inputTokens;
      outputTokens += result.usage.outputTokens;
      console.error(
        `${pageRange(part.from, part.to)}: ${(part.bytes.length / 1e6).toFixed(1)} MB, ${part.hasText ? "text layer" : "scan"}, ` +
          `${result.seconds} s, ${result.usage.inputTokens} in, ${result.usage.outputTokens} out, ${result.reading.pages.length} pages noted`,
      );
      const photoPage = result.reading.clientPhotoPage;
      const photo = photoPage ? await photoOnPage(part.bytes, photoPage - part.from + 1) : null;
      return { ...result.reading, photoBytes: photo?.length ?? 0 };
    }),
  );
  for (const reading of readings) {
    for (const note of reading.pages) {
      console.log(`\np. ${note.page}  ${note.kind}  |  ${note.provider || "no provider"}  |  ${note.date || "no date"}`);
      for (const fact of note.facts) console.log(`   - ${fact.text}  "${fact.quote}"`);
    }
    if (reading.clientPhotoPage) {
      console.log(`\nClient photo ID on p. ${reading.clientPhotoPage}: ${reading.photoBytes ? `a JPEG of ${reading.photoBytes} bytes` : "no JPEG on that page"}`);
    }
  }
  console.log(`\nTotal: ${pages} pages, ${inputTokens} input and ${outputTokens} output tokens, ${dollars(cost(inputTokens, outputTokens))}`);
}

async function indexCase(matterId: number, only?: string) {
  const file = await getCaseFile(matterId);
  if (!file) throw new Error(`Case ${matterId} has not been read from Clio yet.`);
  const documents = file.entries
    .filter((entry) => entry.kind === "document" && (!only || entry.ref === only))
    .sort((a, b) => Number(a.facts.bytes) - Number(b.facts.bytes));
  if (documents.length === 0) throw new Error(only ? `Case ${matterId} has no document ${only}.` : `Case ${matterId} has no documents.`);

  const started = Date.now();
  const total = { documents: 0, pages: 0, read: 0, skipped: 0, failed: 0, inputTokens: 0, outputTokens: 0 };
  const report = ({ ref, from, to, read }: PartReport) => {
    if (!read) {
      total.skipped += 1;
      return console.log(`${ref} ${pageRange(from, to)}: already indexed`);
    }
    total.read += 1;
    total.inputTokens += read.inputTokens;
    total.outputTokens += read.outputTokens;
    console.log(`${ref} ${pageRange(from, to)}: ${read.seconds} s, ${read.inputTokens} in, ${read.outputTokens} out`);
  };

  // Four documents at a time; the model calls themselves are limited to four inside indexDocument.
  const queue = [...documents];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let entry = queue.shift(); entry; entry = queue.shift()) {
        try {
          const { pages } = await indexDocument(matterId, entry.ref, report);
          total.documents += 1;
          total.pages += pages;
        } catch (err) {
          total.failed += 1;
          console.log(`${entry.ref} FAILED: ${describeError(err).message}`);
        }
      }
    }),
  );

  console.log(
    `\nThis run: ${total.documents} of ${documents.length} documents (${total.pages} pages) indexed, ${total.read} parts read, ` +
      `${total.skipped} already stored, ${total.failed} failed; ${total.inputTokens} input and ${total.outputTokens} output tokens, ` +
      `${dollars(cost(total.inputTokens, total.outputTokens))}, ${Math.round((Date.now() - started) / 1000)} s`,
  );
  const usage = await indexUsage(matterId);
  if (usage) {
    console.log(
      `Stored for the case: ${usage.documents} documents, ${usage.pages} pages, ${usage.inputTokens} input and ${usage.outputTokens} output tokens, ` +
        `${dollars(cost(usage.inputTokens, usage.outputTokens))} (${usage.model})`,
    );
  }
  if (total.failed) process.exitCode = 1;
}

async function main() {
  const local = option("--local");
  if (local) return indexLocal(local);
  const given = process.argv[2] && /^\d+$/.test(process.argv[2]) ? Number(process.argv[2]) : undefined;
  const matterId = given ?? (await listCases())[0]?.matterId;
  if (!matterId) throw new Error("No case has been read from Clio yet.");
  await indexCase(matterId, option("--only"));
}

main().catch((err) => {
  console.error(describeError(err).message);
  process.exit(1);
});
