import { NeedsChecklist } from "./needs-checklist";
import { LocalTime } from "./local-time";
import { ReplyForm } from "./reply-form";
import { sectionOf, type ProviderUpdate, type Reply } from "./schema";
import { StageStepper } from "./stage-stepper";

type Props = {
  update: ProviderUpdate;
  /** What this office has already written back. */
  replies?: Reply[];
  /** True in the attorney's dialog: the page as the office will see it, with replying switched off. */
  preview?: boolean;
  /** The link's token, which a reply is sent with. Left out in a preview. */
  token?: string;
};

// Never shown to a provider, whatever was published: money, coverage and the firm's view of the case.
const NEVER = new Set(["coverage"]);

/**
 * The provider's page, drawn from a published update and nothing else: like an order-tracking
 * page. The same component is the preview in the attorney's dialog, so what is checked is what is sent.
 */
export function ProviderUpdateView({ update, replies = [], preview = false, token }: Props) {
  const lines = update.lines.filter((line) => !NEVER.has(sectionOf(line.section)));
  const needs = lines.filter((line) => sectionOf(line.section) === "needs");
  const news = lines.filter((line) => sectionOf(line.section) !== "needs");
  const initial = (update.firm.trim()[0] ?? "F").toUpperCase();

  return (
    <article className="@container flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="flex size-9 items-center justify-center rounded-md bg-primary font-semibold text-primary-foreground">
            {initial}
          </span>
          <span className="font-medium">{update.firm || "The law firm"}</span>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">Case update for {update.provider}, about your patient</p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance">{update.patient}</h1>
        </div>
      </header>

      <section aria-labelledby="stage" className="flex flex-col gap-3">
        <h2 id="stage" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Where the case is
        </h2>
        <StageStepper stage={update.stage} stages={update.stages} />
      </section>

      <section aria-labelledby="needs" className="flex flex-col gap-3">
        <h2 id="needs" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          What we need from you
        </h2>
        <NeedsChecklist needs={needs} replies={replies} />
      </section>

      <section aria-labelledby="latest" className="flex flex-col gap-3">
        <h2 id="latest" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Latest update from the firm
        </h2>
        {news.length > 0 ? (
          <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
            {news.map((line) => (
              <p key={line.id} className="leading-relaxed text-pretty">
                {line.text}
              </p>
            ))}
            <p className="text-xs text-muted-foreground">
              Updated <LocalTime iso={update.publishedAt} />
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {preview ? "No update lines are included yet." : "The firm has not added a note to this update."}
          </p>
        )}
      </section>

      <section aria-labelledby="reply" className="flex flex-col gap-3">
        <h2 id="reply" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Reply to the firm
        </h2>
        <ReplyForm token={preview ? undefined : token} about={(needs.length ? needs : lines).slice(0, 20)} earlier={replies} />
      </section>

      <footer className="flex flex-col gap-1 border-t pt-4 text-sm text-muted-foreground">
        <p>
          This link works until <LocalTime iso={update.expiresAt} style="date" />.
        </p>
        {update.contactLine && (
          <p>
            Questions: <ContactLine text={update.contactLine} />
          </p>
        )}
      </footer>
    </article>
  );
}

/** Who to contact at the firm; an email address in the line can be tapped. */
function ContactLine({ text }: { text: string }) {
  const parts = text.split(/([^\s,;<>]+@[^\s,;<>]+\.[^\s,;<>]+)/);
  return (
    <span className="text-foreground">
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <a key={index} href={`mailto:${part}`} className="text-primary underline underline-offset-2">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </span>
  );
}
