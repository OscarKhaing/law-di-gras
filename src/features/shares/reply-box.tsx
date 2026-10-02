"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { postJson } from "@/lib/fetch-json";
import { LocalTime } from "./local-time";
import { REPLY_LIMIT, type Reply } from "./schema";

/**
 * Where a provider's office answers one request from the firm. Replies already sent stay on the
 * page; a new one is confirmed in place. Without a `token` (the attorney's preview) it is shown
 * but cannot send.
 */
export function ReplyBox({ token, lineId, earlier }: { token?: string; lineId: string; earlier: Reply[] }) {
  const id = useId();
  const [sent, setSent] = useState<Reply[]>([]);
  const [text, setText] = useState("");
  const [writing, setWriting] = useState(earlier.length === 0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (!token || !message || sending) return;
    setSending(true);
    setError(null);
    try {
      const { at } = await postJson<{ at: string }>("/api/shares/reply", { token, lineId, text: message });
      setSent((list) => [...list, { lineId, text: message, at }]);
      setText("");
      setWriting(false);
    } catch (err) {
      // The text stays in the box, so nothing typed is lost.
      setError(err instanceof Error ? err.message : "The reply could not be sent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {(earlier.length > 0 || sent.length > 0) && (
        <ul className="space-y-3">
          {earlier.map((reply) => (
            <SentReply key={reply.at} reply={reply} />
          ))}
          {sent.map((reply) => (
            <SentReply key={reply.at} reply={reply} arriving />
          ))}
        </ul>
      )}

      {writing || (earlier.length === 0 && sent.length === 0) ? (
        <form onSubmit={send} className="space-y-2">
          <label htmlFor={id} className="block text-sm font-medium">
            Reply to the firm
          </label>
          <Textarea
            id={id}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={2}
            maxLength={REPLY_LIMIT}
            disabled={!token || sending}
            placeholder={token ? "For example, when it was sent, or who the firm should call" : "The provider's office writes its reply here"}
            aria-invalid={error !== null}
            aria-describedby={error ? `${id}-error` : undefined}
            className="bg-card"
          />
          {error && (
            <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
              Your reply was not sent. {error} Your text is still in the box; send it again.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button type="submit" size="lg" className="h-10 px-4" disabled={!token || sending || text.trim() === ""}>
              {sending ? "Sending…" : "Send reply"}
            </Button>
            {text.length >= REPLY_LIMIT - 200 && (
              <span className="text-xs text-muted-foreground">
                {text.length.toLocaleString("en-US")} of {REPLY_LIMIT.toLocaleString("en-US")} characters
              </span>
            )}
            {!token && <span className="text-xs text-muted-foreground">A reply reaches the case here, not Clio.</span>}
          </div>
        </form>
      ) : (
        <Button type="button" variant="outline" className="h-9 px-3" onClick={() => setWriting(true)}>
          Write another reply
        </Button>
      )}
    </div>
  );
}

function SentReply({ reply, arriving = false }: { reply: Reply; arriving?: boolean }) {
  return (
    <li
      className={
        "border-l-2 border-primary pl-3" +
        (arriving ? " animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none" : "")
      }
    >
      <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{reply.text}</p>
      <p className="mt-0.5 text-sm font-medium text-primary" role={arriving ? "status" : undefined}>
        Sent to the firm <LocalTime iso={reply.at} style="sent" />
      </p>
    </li>
  );
}
