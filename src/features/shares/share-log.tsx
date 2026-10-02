"use client";

import { useState } from "react";
import { StatusPill } from "@/components/status";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/fetch-json";
import { LocalTime } from "./local-time";
import { ReceivedFileLink } from "./received-file";
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
            Every time the link is opened it is counted, your own visits included. A reply or a file from the office is kept
            here; nothing is written to Clio.
          </p>
        )}
      </div>
      {shares.length === 0 ? (
        <p className="border-y py-3 text-sm text-muted-foreground">
          Nothing has been shared with {providerName} yet. Once you publish, the link, its opens and any replies and files are
          listed here.
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
      <p>
        <StatusPill tone={state === "Live" ? "done" : "neutral"}>{state}</StatusPill>
      </p>

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
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {share.opens === 0 ? (
            <StatusPill tone="mild">Not opened yet</StatusPill>
          ) : (
            <>
              <StatusPill tone="done">Opened {share.opens === 1 ? "once" : `${share.opens} times`}</StatusPill>
              {share.lastOpenedAt && (
                <span className="text-muted-foreground">
                  last <LocalTime iso={share.lastOpenedAt} style="sent" />
                </span>
              )}
            </>
          )}
        </p>

        {share.replies.length === 0 && share.files.length === 0 && <p className="text-muted-foreground">The office has not replied.</p>}
        {share.replies.length > 0 && (
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
        {/* Files are a ledger under the request they were sent for: said once, however many files answer it. */}
        {[...new Set(share.files.map((file) => file.lineId))].map((lineId) => {
          const asked = lines.find((line) => line.id === lineId)?.text;
          const sent = share.files.filter((file) => file.lineId === lineId);
          return (
            <div key={lineId ?? "no line"} className="max-w-prose">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {sent.length === 1 ? "A file" : `${sent.length} files`} received from the provider, not yet in Clio. A name opens
                the file.{" "}
                {asked ? (
                  <>
                    Sent for: <span className="font-serif text-[13px] text-foreground">{asked}</span>
                  </>
                ) : (
                  "Sent for a line that is no longer part of the update."
                )}
              </p>
              <ul className="mt-1.5 divide-y border-y">
                {sent.map((file) => (
                  <li key={file.path} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1.5 text-muted-foreground">
                    <span className="min-w-0">
                      <ReceivedFileLink shareId={share.id} file={file} />
                    </span>
                    <span className="text-xs">
                      sent <LocalTime iso={file.at} style="sent" />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

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
