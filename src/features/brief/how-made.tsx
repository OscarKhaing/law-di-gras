import type { ReactNode } from "react";
import { shortDate } from "@/features/cases/schema";
import { Disclosure } from "./fold";
import type { SectionProps } from "./schema";

// US dollars per million tokens, matched on the start of the model id.
const PRICES = [
  { model: "claude-haiku-4-5", input: 1, output: 5 },
  { model: "claude-sonnet-5-5", input: 2, output: 10 },
  { model: "claude-opus-5-5", input: 4, output: 20 },
];

type Usage = { inputTokens: number; outputTokens: number };

/**
 * What one reading cost in US dollars, or null when the model's price is not in the table. Rounded to
 * the cent (never down to nothing), so the parts shown add up to the total shown.
 */
function costOf(model: string, usage: Usage): number | null {
  const price = PRICES.find((row) => model.startsWith(row.model));
  if (!price) return null;
  const cost = (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
  return cost > 0 && cost < 0.01 ? cost : Math.round(cost * 100) / 100;
}

const count = new Intl.NumberFormat("en-US");

function dollars(amount: number) {
  if (amount === 0) return "$0.00";
  return amount < 0.01 ? "less than $0.01" : `$${amount.toFixed(2)}`;
}

/** The day of a timestamp. Timestamps are in UTC, so one on tomorrow's date there still happened today. */
function dayAt(timestamp: string, today: string) {
  const day = timestamp.slice(0, 10);
  if (day >= today) return `today, ${shortDate(today, true)}`;
  return shortDate(day, true) || "on a date that was not recorded";
}

function plural(n: number, one: string, many: string) {
  return `${count.format(n)} ${n === 1 ? one : many}`;
}

/**
 * How this brief was made: when the case was read from Clio, which model read the documents and
 * wrote the brief, and what that reading cost. A quiet footer, closed until asked for, all of it
 * computed from what is stored.
 */
export function HowMade({ file, stored, index, today }: SectionProps) {
  const briefCost = costOf(stored.model, stored.usage);
  const indexCost = index ? costOf(index.model, index) : 0;
  const unknown = [
    ...(index && indexCost === null ? [index.model] : []),
    ...(briefCost === null ? [stored.model] : []),
  ];

  return (
    <Disclosure
      open
      title="How this brief was made"
      remark={`Written ${dayAt(stored.createdAt, today)}${stored.current ? ", current with Clio" : ", Clio has changed since"}`}
      className="text-sm text-muted-foreground [&_summary>span:first-child]:text-foreground"
    >
      <dl className="divide-y border-t">
        <Row label="The case file">
          <p>
            Read from Clio {dayAt(file.syncedAt, today)}: {plural(file.entries.length, "entry", "entries")}.
          </p>
        </Row>

        <Row label="The documents">
          {index ? (
            <>
              <p>
                {plural(index.documents, "document", "documents")}, {plural(index.pages, "page", "pages")}, each page
                read once by {index.model}.
              </p>
              <Tokens usage={index} />
            </>
          ) : (
            <p>No documents have been read page by page yet, so the brief rests on the entries in Clio alone.</p>
          )}
        </Row>

        <Row label="The brief">
          <p>
            Written {dayAt(stored.createdAt, today)} by {stored.model}.
          </p>
          <Tokens usage={stored.usage} />
          {stored.current ? (
            <p>Current with Clio: nothing has changed there since it was written.</p>
          ) : (
            <p className="w-fit border-l-2 border-marker bg-marker-soft px-2.5 py-1 text-foreground">
              Clio has changed since this brief was written, so it does not cover the newest entries.
            </p>
          )}
        </Row>

        <Row label="Cost">
          {unknown.length === 0 ? (
            <p>
              <span className="font-medium text-foreground tabular-nums">
                {dollars((indexCost ?? 0) + (briefCost ?? 0))}
              </span>{" "}
              to read this case once
              {index
                ? `: ${dollars(indexCost ?? 0)} for the documents and ${dollars(briefCost ?? 0)} for the brief.`
                : ", all of it for the brief."}
            </p>
          ) : (
            <p>
              Price not known for {unknown.join(" and ")}
              {index && indexCost !== null && `; the documents cost ${dollars(indexCost)}`}
              {briefCost !== null && `; the brief cost ${dollars(briefCost)}`}.
            </p>
          )}
          <p>Opening the case costs nothing, because nothing is read again.</p>
        </Row>
      </dl>
    </Disclosure>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-1 py-2.5 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
      <dt className="font-medium">{label}</dt>
      <dd className="max-w-prose space-y-1 leading-relaxed">{children}</dd>
    </div>
  );
}

function Tokens({ usage }: { usage: Usage }) {
  return (
    <p className="tabular-nums">
      {count.format(usage.inputTokens)} tokens in, {count.format(usage.outputTokens)} out.
    </p>
  );
}
