"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { postJson } from "@/lib/fetch-json";
import { LocalTime } from "./local-time";
import {
  FILE_ACCEPT,
  FILE_KINDS,
  FILE_KINDS_SAID,
  FILE_MAX_BYTES,
  FILE_MAX_MB,
  fileSize,
  REPLY_LIMIT,
  type Reply,
  type SentFile,
} from "./schema";

type Props = {
  token?: string;
  lineId: string;
  /** What this office already wrote back to this request, and the files it attached. */
  earlier: Reply[];
  earlierFiles?: SentFile[];
};

/**
 * Where a provider's office answers one request from the firm: in words, by attaching the file
 * that was asked for, or both. What was already sent stays on the page; a new reply or file is
 * confirmed in place. A file is sent only after the office has seen its name and pressed send.
 * Without a `token` (the attorney's preview) everything is shown but nothing can be sent.
 */
export function ReplyBox({ token, lineId, earlier, earlierFiles = [] }: Props) {
  const id = useId();
  const [sent, setSent] = useState<Reply[]>([]);
  const [text, setText] = useState("");
  const [writing, setWriting] = useState(earlier.length === 0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const picker = useRef<HTMLInputElement>(null);
  const request = useRef<XMLHttpRequest | null>(null);
  const [sentFiles, setSentFiles] = useState<SentFile[]>([]);
  const [chosen, setChosen] = useState<File | null>(null);
  /** How much of the chosen file has gone, in percent; null when nothing is being sent. */
  const [progress, setProgress] = useState<number | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

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

  function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // so the same file can be chosen again after a mistake
    if (!file) return;
    // Said at once, before anything leaves the office. The server checks the same limits again.
    if (!Object.hasOwn(FILE_KINDS, file.type)) {
      setChosen(null);
      return setFileError(`${file.name} is not a ${FILE_KINDS_SAID} file. Save or scan it as a PDF and attach that.`);
    }
    if (file.size > FILE_MAX_BYTES) {
      setChosen(null);
      return setFileError(`${file.name} is ${fileSize(file.size)}. A file can be at most ${FILE_MAX_MB} MB; send it in smaller parts.`);
    }
    setFileError(null);
    setChosen(file);
  }

  async function sendFile() {
    if (!token || !chosen || progress !== null) return;
    setProgress(0);
    setFileError(null);
    try {
      const { url, path } = await postJson<{ url: string; path: string }>("/api/shares/upload", {
        token,
        lineId,
        fileName: chosen.name,
        type: chosen.type,
        size: chosen.size,
      });
      await put(url, chosen, setProgress, request);
      const file = await postJson<SentFile>("/api/shares/upload/done", { token, lineId, path });
      setSentFiles((list) => [...list, file]);
      setChosen(null);
    } catch (err) {
      // The file stays chosen, so it can be sent again without looking for it. A cancelled send is not an error.
      if (!(err instanceof Cancelled)) setFileError(err instanceof Error ? err.message : "The file could not be sent.");
    } finally {
      request.current = null;
      setProgress(null);
    }
  }

  // Everything already sent for this request, replies and files together, in the order it was sent.
  const history = [
    ...earlier.map((reply) => ({ at: reply.at, reply, file: null, arriving: false })),
    ...earlierFiles.map((file) => ({ at: file.at, reply: null, file, arriving: false })),
    ...sent.map((reply) => ({ at: reply.at, reply, file: null, arriving: true })),
    ...sentFiles.map((file) => ({ at: file.at, reply: null, file, arriving: true })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const attach = (
    <>
      <input ref={picker} type="file" accept={FILE_ACCEPT} onChange={choose} className="sr-only" tabIndex={-1} aria-hidden />
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-10 px-4"
        disabled={!token || progress !== null}
        onClick={() => picker.current?.click()}
        aria-describedby={`${id}-kinds`}
      >
        Attach a file
      </Button>
    </>
  );

  return (
    <div className="mt-3 space-y-3">
      {history.length > 0 && (
        <ul className="space-y-3">
          {history.map((item) => (
            <Sent key={`${item.at}-${item.file ? "file" : "reply"}`} at={item.at} arriving={item.arriving}>
              {item.file ? (
                <p className="text-[15px] leading-relaxed break-words">
                  <span className="font-medium">{item.file.name}</span>
                  <span className="text-muted-foreground">, {fileSize(item.file.bytes)}</span>
                </p>
              ) : (
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{item.reply?.text}</p>
              )}
            </Sent>
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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button type="submit" size="lg" className="h-10 px-4" disabled={!token || sending || text.trim() === ""}>
              {sending ? "Sending…" : "Send reply"}
            </Button>
            {attach}
            {text.length >= REPLY_LIMIT - 200 && (
              <span className="text-xs text-muted-foreground">
                {text.length.toLocaleString("en-US")} of {REPLY_LIMIT.toLocaleString("en-US")} characters
              </span>
            )}
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button type="button" variant="outline" size="lg" className="h-10 px-4" onClick={() => setWriting(true)}>
            Write another reply
          </Button>
          {attach}
        </div>
      )}

      {chosen && progress === null && (
        <div className="space-y-2 border-l-2 border-marker bg-marker-soft px-3 py-2">
          <p className="text-[15px] leading-relaxed break-words">
            Ready to send: <span className="font-medium">{chosen.name}</span>, {fileSize(chosen.size)}. Check it is the right
            file for this patient; once sent it cannot be taken back from this page.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="lg" className="h-10 px-4" onClick={sendFile}>
              {fileError ? "Send the file again" : "Send file to the firm"}
            </Button>
            <Button type="button" variant="outline" size="lg" className="h-10 px-4" onClick={() => (setChosen(null), setFileError(null))}>
              Do not send it
            </Button>
          </div>
        </div>
      )}

      {chosen && progress !== null && (
        <div role="status" className="space-y-1.5 border-l-2 border-primary pl-3">
          <p className="text-[15px] leading-relaxed break-words">
            Uploading <span className="font-medium">{chosen.name}</span>, {fileSize(chosen.size)}
            <span className="text-muted-foreground tabular-nums">
              {progress >= 100 ? ". It has arrived and is being checked." : progress > 0 ? ` (${progress}%)` : ""}
            </span>
          </p>
          <div className="flex h-7 items-center gap-3">
            <div
              role="progressbar"
              aria-label={`Uploading ${chosen.name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-border"
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
            {progress < 100 && (
              <Button type="button" variant="outline" size="sm" onClick={() => request.current?.abort()}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}

      {fileError && (
        <p role="alert" className="border-l-2 border-destructive pl-3 text-sm leading-relaxed">
          <span className="font-medium text-destructive">The file was not sent.</span> {fileError}
        </p>
      )}

      <p id={`${id}-kinds`} className="text-xs leading-relaxed text-muted-foreground">
        {token
          ? `A file can be a ${FILE_KINDS_SAID}, up to ${FILE_MAX_MB} MB.`
          : "A reply or a file reaches the case here, not Clio."}
      </p>
    </div>
  );
}

class Cancelled extends Error {}

/** Send a file straight to storage at its one-time address, reporting how much has gone. */
function put(url: string, file: File, onProgress: (percent: number) => void, holder: { current: XMLHttpRequest | null }) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    holder.current = request;
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", file.type);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error("The file did not reach the firm. Send it again; if it keeps failing, call the firm."));
    request.onerror = () => reject(new Error("The file did not reach the firm. Check your connection and send it again."));
    request.onabort = () => reject(new Cancelled());
    request.send(file);
  });
}

/** Something this office sent, marked with when it reached the firm. */
function Sent({ at, arriving, children }: { at: string; arriving: boolean; children: React.ReactNode }) {
  return (
    <li
      className={
        "border-l-2 border-primary pl-3" +
        (arriving ? " animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none" : "")
      }
    >
      {children}
      <p className="mt-0.5 text-sm font-medium text-primary" role={arriving ? "status" : undefined}>
        Sent to the firm <LocalTime iso={at} style="sent" />
      </p>
    </li>
  );
}
