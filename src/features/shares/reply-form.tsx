"use client";

import { useId, useState } from "react";
import { CircleCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { postJson } from "@/lib/fetch-json";
import { LocalTime } from "./local-time";
import { REPLY_LIMIT, type Reply } from "./schema";

/**
 * The office's reply to the firm. A reply is about one of the firm's requests (or, with none, the
 * update as a whole); it is stored with Case Desk and never written to Clio. Without a `token` (the
 * attorney's preview) the form is shown but cannot send.
 */
export function ReplyForm({
  token,
  about,
  earlier,
}: {
  token?: string;
  /** What a reply can be about: the firm's requests, or the update's first line when it asks for nothing. */
  about: { id: string; text: string }[];
  earlier: Reply[];
}) {
  const id = useId();
  const [lineId, setLineId] = useState(about[0]?.id ?? "");
  const [text, setText] = useState("");
  const [sent, setSent] = useState<Reply[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (!token || !message || !lineId || sending) return;
    setSending(true);
    setError(null);
    try {
      const { at } = await postJson<{ at: string }>("/api/shares/reply", { token, lineId, text: message });
      setSent((list) => [...list, { lineId, text: message, at }]);
      setText("");
    } catch (err) {
      // The text stays in the box, so nothing typed is lost.
      setError(err instanceof Error ? err.message : "The reply could not be sent.");
    } finally {
      setSending(false);
    }
  }

  const all = [...earlier, ...sent];
  return (
    <div className="flex flex-col gap-4">
      {all.length > 0 && (
        <ul className="flex flex-col gap-3">
          {all.map((reply) => (
            <li key={reply.at} className="flex flex-col gap-0.5 border-l-2 border-primary pl-3">
              <p className="leading-relaxed whitespace-pre-wrap">{reply.text}</p>
              <p className="text-xs text-muted-foreground">
                Sent to the firm <LocalTime iso={reply.at} style="sent" />
              </p>
            </li>
          ))}
        </ul>
      )}
      {sent.length > 0 && (
        <p role="status" className="flex items-center gap-2 text-sm font-medium text-primary">
          <CircleCheckIcon className="size-4" />
          Your reply reached the firm.
        </p>
      )}
      <form onSubmit={send} className="flex flex-col gap-2">
        {about.length > 1 && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">About</span>
            <select
              value={lineId}
              onChange={(event) => setLineId(event.target.value)}
              disabled={!token || sending}
              className="h-9 rounded-md border bg-card px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {about.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.text.length > 80 ? `${item.text.slice(0, 79)}…` : item.text}
                </option>
              ))}
            </select>
          </label>
        )}
        <label htmlFor={id} className="text-sm font-medium">
          Your reply
        </label>
        <Textarea
          id={id}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          maxLength={REPLY_LIMIT}
          disabled={!token || sending}
          placeholder={token ? "For example, when the records were sent, or who the firm should call" : "The office writes its reply here"}
          aria-invalid={error !== null}
          aria-describedby={error ? `${id}-error` : undefined}
          className="bg-card"
        />
        {error && (
          <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
            Your reply was not sent. {error} Your text is still in the box; send it again.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!token || sending || text.trim() === "" || !lineId}>
            {sending ? "Sending…" : "Send"}
          </Button>
          <span className="text-xs text-muted-foreground">Your reply goes to the firm only.</span>
        </div>
      </form>
    </div>
  );
}
