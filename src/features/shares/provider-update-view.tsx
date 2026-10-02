import { StageTrack } from "@/features/cases/stage-track";
import { LocalTime } from "./local-time";
import { ReplyBox } from "./reply-box";
import { SECTION_HEADINGS, SECTIONS, sectionOf, type ProviderUpdate, type Reply } from "./schema";

type Props = {
  update: ProviderUpdate;
  /** What this office has already written back. */
  replies?: Reply[];
  /** True in the attorney's composer: the page as the office will see it, with replying switched off. */
  preview?: boolean;
  /** The link's token, which a reply is sent with. Left out in a preview. */
  token?: string;
};

/**
 * The body of the provider's page, drawn from a published update and nothing else. The same
 * component is the live preview in the attorney's composer, so what is checked is what is sent.
 * It lays itself out by the width of its container, not of the window. Words taken from the
 * firm's update are in the serif face; the page's own words are in the sans.
 */
export function ProviderUpdateView({ update, replies = [], preview = false, token }: Props) {
  const current = update.stages.indexOf(update.stage);
  const sections = SECTIONS.map((section) => ({
    section,
    lines: update.lines.filter((line) => sectionOf(line.section) === section),
  })).filter(({ lines }) => lines.length > 0);

  return (
    <article className="@container">
      <header>
        <p className="text-sm leading-relaxed text-muted-foreground">
          An update for <Words>{update.provider}</Words> from <Words>{update.firm}</Words>, about your patient
        </p>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight text-balance @2xl:text-4xl">{update.patient}</h1>
      </header>

      <section className="mt-8">
        <h2 className="font-heading text-xl font-semibold">This case is active</h2>
        {update.stage ? (
          <>
            <div className="mt-2 font-serif text-lg">
              <StageTrack stage={update.stage} stages={update.stages} />
            </div>
            {current >= 0 && update.stages.length > 1 && (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Stage {current + 1} of {update.stages.length}. The firm&rsquo;s stages, in order:{" "}
                {update.stages.map((name, index) => (
                  <span key={name}>
                    {index > 0 && ", "}
                    <span className={index === current ? "font-serif text-[15px] font-semibold text-foreground" : undefined}>{name}</span>
                  </span>
                ))}
                .
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">The firm has not said which stage it is at.</p>
        )}
      </section>

      {sections.length > 0 ? (
        <div className="mt-8 border-t">
          {sections.map(({ section, lines }) => (
            <section key={section} className="grid gap-x-8 gap-y-2 border-b py-5 @2xl:grid-cols-[12.5rem_1fr]">
              <h2 className="text-sm leading-relaxed font-medium @2xl:pt-1">
                {section === "needs" ? (
                  // The one thing on this page the office is asked to act on.
                  <mark className="bg-marker box-decoration-clone px-1 py-0.5 text-foreground">{SECTION_HEADINGS[section]}</mark>
                ) : (
                  SECTION_HEADINGS[section]
                )}
              </h2>
              <ul className={section === "needs" ? "space-y-7" : "space-y-3"}>
                {lines.map((line) => (
                  <li key={line.id}>
                    <p className="font-serif text-[17px] leading-relaxed text-pretty">{line.text}</p>
                    {section === "needs" && (
                      <ReplyBox
                        token={preview ? undefined : token}
                        lineId={line.id}
                        earlier={replies.filter((reply) => reply.lineId === line.id)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <p className="mt-8 border-y py-5 text-sm text-muted-foreground">
          {preview
            ? "No lines are switched on. Switch on the lines this office should see."
            : "The firm has not added any details to this update yet."}
        </p>
      )}

      <footer className="mt-6 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
        <p>
          Last updated <LocalTime iso={update.publishedAt} />. This link works until <LocalTime iso={update.expiresAt} style="date" />.
        </p>
        {update.contactLine && (
          <p>
            Questions about this update: <ContactLine text={update.contactLine} />
          </p>
        )}
      </footer>
    </article>
  );
}

/** Words that come from the firm's update, set apart from the page's own. */
function Words({ children }: { children: React.ReactNode }) {
  return <span className="font-serif text-[15px] text-foreground">{children}</span>;
}

/** Who to contact at the firm; an email address in the line can be tapped. */
function ContactLine({ text }: { text: string }) {
  const parts = text.split(/([^\s,;<>]+@[^\s,;<>]+\.[^\s,;<>]+)/);
  return (
    <Words>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <a key={index} href={`mailto:${part}`} className="text-primary underline underline-offset-2">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </Words>
  );
}
