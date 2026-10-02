"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/fetch-json";
import { LocalTime } from "./local-time";
import type { ShareStatus } from "./schema";

type Props = {
  providerName: string;
  /** Every update shared with this office, newest first. */
  shares: ShareStatus[];
  /** The lines each update showed, by share id, in the words the office read. */
  published: Record<string, { id: string; text: string }[]>;
  /** The server's time when the page was loaded, to tell a live link from an expired one. */
  now: string;
  /** Called once a link has been withdrawn, with its share id. */
  onWithdrawn: (shareId: string) => void;
};

/**
 * What has been shared with one provider's office: when, until when, whether it was opened, what
 * the office wrote back, and the way to take a link back.
 */
export function ShareLog({ providerName, shares, published, now, onWithdrawn }: Props) {
  return (
    <section aria-labelledby="shared-with-office" className="space-y-3">
      <div className="space-y-1">
        <h2 id="shared-with-office" className="font-heading text-xl font-semibold tracking-tight">
          Shared with this office
        </h2>
        {shares.length > 0 && (
          <p className="max-w-prose text-sm text-muted-foreground">
            Every time the link is opened it is counted, your own visits included. A reply from the office is kept here; nothing
            is written to Clio.
          </p>
        )}
      </div>
      {shares.length === 0 ? (
        <p className="border-y py-3 text-sm text-muted-foreground">
          Nothing has been shared with {providerName} yet. Once you publish, the link, its opens and any replies are listed here.
        </p>
      ) : (
        <div className="divide-y border-y">
          {shares.map((share) => (
            <ShareRow key={share.id} share={share} lines={published[share.id] ?? []} now={now} onWithdrawn={onWithdrawn} />
          ))}
        </div>
      )}
    </section>
  );
}

function ShareRow({
  share,
  lines,
  now,
  onWithdrawn,
}: {
  share: ShareStatus;
  lines: { id: string; text: string }[];
  now: string;
  onWithdrawn: (shareId: string) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const expired = Date.parse(share.expiresAt) <= Date.parse(now);
  const state = share.revoked ? "Withdrawn" : expired ? "Expired" : "Live";

  async function withdraw() {
    setWithdrawing(true);
    setError(null);
    try {
      await postJson<{ revoked: boolean }>("/api/shares/revoke", { shareId: share.id });
      setAsking(false);
      onWithdrawn(share.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The link could not be withdrawn.");
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <div className="grid gap-x-6 gap-y-2 py-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
      <p className={state === "Live" ? "text-sm font-medium text-primary" : "text-sm text-muted-foreground"}>{state}</p>

      <div className="space-y-2 text-sm">
        <p className="max-w-prose leading-relaxed">
          Published <LocalTime iso={share.publishedAt} />.{" "}
          {share.revoked ? (
            "The link was withdrawn and no longer opens."
          ) : (
            <>
              The link {expired ? "stopped working on" : "works until"} <LocalTime iso={share.expiresAt} style="date" />.
            </>
          )}
        </p>
        <p className={share.opens === 0 ? "text-muted-foreground" : undefined}>
          {share.opens === 0 ? (
            "Not opened yet."
          ) : (
            <>
              Opened {share.opens === 1 ? "once" : `${share.opens} times`}
              {share.lastOpenedAt && (
                <>
                  , last <LocalTime iso={share.lastOpenedAt} style="sent" />
                </>
              )}
              .
            </>
          )}
        </p>

        {share.replies.length === 0 ? (
          <p className="text-muted-foreground">The office has not replied.</p>
        ) : (
          <ul className="space-y-2">
            {share.replies.map((reply, index) => {
              const asked = lines.find((line) => line.id === reply.lineId)?.text;
              return (
                <li key={`${reply.at}-${index}`} className="max-w-prose border-l-2 border-marker bg-marker-soft px-3 py-2">
                  <p className="text-xs text-muted-foreground">
                    From the provider, not yet in Clio, sent <LocalTime iso={reply.at} style="sent" />
                  </p>
                  <p className="mt-0.5 font-serif text-[16px] leading-relaxed whitespace-pre-wrap">{reply.text}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {asked ? (
                      <>
                        In answer to: <span className="font-serif text-[13px] text-foreground">{asked}</span>
                      </>
                    ) : (
                      "In answer to a line that is no longer part of the update."
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        {state === "Live" &&
          (asking ? (
            <div className="max-w-prose space-y-2 border-l-2 border-marker bg-marker-soft px-3 py-2">
              <p className="leading-relaxed">
                Withdraw this link? The office&rsquo;s page stops opening at once. Its opens and replies stay listed here, and
                publishing again makes a new link.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={withdraw} disabled={withdrawing}>
                  {withdrawing ? "Withdrawing…" : "Withdraw link"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAsking(false)} disabled={withdrawing}>
                  Keep the link
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setAsking(true)}>
              Withdraw link
            </Button>
          ))}
        {error && (
          <p role="alert" className="max-w-prose border-l-2 border-destructive pl-3">
            <span className="font-medium text-destructive">The link was not withdrawn.</span> {error} It still opens; try again.
          </p>
        )}
      </div>
    </div>
  );
}
