"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { panelClass } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { useOpenTab } from "@/features/brief/case-tabs";
import { SourceLinks } from "@/features/brief/source-panel";
import type { CaseFile } from "@/features/cases/schema";
import { fetchJson } from "@/lib/fetch-json";
import { cn } from "@/lib/utils";
import { isPart, NOT_IN_FILE, PART_LABEL, type AskResult } from "./schema";

// Why the reader is here: they have a question and no time to read. The one action is asking, by
// typing or by voice. After it they have a short answer drawn from the file, the entries it rests
// on (each opens beside the page), and the part of the case to open for more. The last three
// questions stay, newest first, so a follow-up makes sense. Nothing is saved.

/** How many questions and answers are kept on the page. */
const KEPT = 3;
/** The attorney's own question, asked by "Catch me up". */
const CATCH_UP = "What happened since the last time I had this file?";

type Asked = { id: number; question: string; spoken: boolean; catchUp: boolean };
type Row = Asked & ({ status: "thinking" } | { status: "answered"; result: AskResult } | { status: "failed"; message: string });

// The browser's speech recognition, as much of it as is used here. Chrome has it under a prefix.
type Recognizer = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognizerClass = new () => Recognizer;

function recognizerClass(): RecognizerClass | undefined {
  const browser = window as unknown as { SpeechRecognition?: RecognizerClass; webkitSpeechRecognition?: RecognizerClass };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}

const canHear = () => recognizerClass() !== undefined;
const canSpeak = () => "speechSynthesis" in window;
const unchanging = () => () => {};
/** What this browser can do, read after the page is live; false on the server and until then. */
const useBrowser = (read: () => boolean) => useSyncExternalStore(unchanging, read, () => false);

/** This browser's reader id, as the case page keeps it; "" when there is none yet. */
function viewerId() {
  try {
    return localStorage.getItem("case-desk-viewer") ?? "";
  } catch {
    return "";
  }
}

const linkClass =
  "cursor-pointer rounded-sm text-sm font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50";

/** "Ask about this case": a question, typed or spoken, answered from the file with its sources. */
export function AskBar({ file, today }: { file: CaseFile; today: string }) {
  const openTab = useOpenTab();
  const hears = useBrowser(canHear);
  const speaks = useBrowser(canSpeak);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [listening, setListening] = useState(false);
  const [micNote, setMicNote] = useState("");
  const [reading, setReading] = useState<number | null>(null);

  const nextId = useRef(1);
  const request = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognizer = useRef<Recognizer | null>(null);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);

  const busy = rows[0]?.status === "thinking";

  // Leaving the case stops whatever is under way: the request, the listening and the reading aloud.
  useEffect(
    () => () => {
      request.current?.abort();
      if (timer.current) clearInterval(timer.current);
      recognizer.current?.abort();
      if (utterance.current) window.speechSynthesis?.cancel();
    },
    [],
  );

  function stopReading() {
    utterance.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setReading(null);
  }

  function read(id: number, answer: string) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const spoken = new SpeechSynthesisUtterance(answer);
    spoken.lang = "en-US";
    const done = () => {
      if (utterance.current !== spoken) return;
      utterance.current = null;
      setReading(null);
    };
    spoken.onend = done;
    spoken.onerror = done;
    utterance.current = spoken;
    setReading(id);
    window.speechSynthesis.speak(spoken);
  }

  async function ask(asking: string, spoken: boolean, catchUp = false, retryOf?: number) {
    const question = asking.trim();
    if (question.length < 3 || request.current) return;
    stopReading();
    const asked: Asked = { id: nextId.current++, question, spoken, catchUp };
    const controller = new AbortController();
    request.current = controller;
    setRows((current) => [{ ...asked, status: "thinking" as const }, ...current.filter((row) => row.id !== retryOf)].slice(0, KEPT));
    setText("");
    setElapsed(0);
    timer.current = setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
    const settle = (row: Row) => setRows((current) => current.map((old) => (old.id === asked.id ? row : old)));
    try {
      const result = await fetchJson<AskResult>("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matterId: file.matterId, question, today, ...(catchUp ? { catchUp: true, viewer: viewerId() || undefined } : {}) }),
        signal: controller.signal,
      });
      settle({ ...asked, status: "answered", result });
      // Only a question asked by voice is answered by voice.
      if (spoken) read(asked.id, result.answer);
    } catch (err) {
      if (!controller.signal.aborted) settle({ ...asked, status: "failed", message: err instanceof Error ? err.message : String(err) });
    } finally {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      if (request.current === controller) request.current = null;
    }
  }

  function close() {
    request.current?.abort();
    request.current = null;
    stopReading();
    setRows([]);
  }

  function listen() {
    if (listening) {
      // A second press ends the question; what was heard is then asked.
      recognizer.current?.stop();
      return;
    }
    const Recognition = recognizerClass();
    if (!Recognition) return;
    stopReading();
    setMicNote("");
    const hearing = new Recognition();
    hearing.lang = "en-US";
    hearing.interimResults = true;
    hearing.continuous = false;
    let heard = "";
    let failed = false;
    hearing.onresult = (event) => {
      heard = Array.from(event.results, (result) => result[0].transcript).join("").trim();
      setText(heard);
    };
    hearing.onerror = (event) => {
      if (event.error === "aborted") return;
      failed = true;
      setMicNote(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "This page is not allowed to use the microphone. Allow it in the browser's address bar, or type the question."
          : event.error === "no-speech"
            ? "Nothing was heard. Press the microphone and ask again, or type the question."
            : "The browser could not listen just now. Try the microphone again, or type the question.",
      );
    };
    hearing.onend = () => {
      recognizer.current = null;
      setListening(false);
      if (!failed && heard.length >= 3) void ask(heard, true);
    };
    recognizer.current = hearing;
    try {
      hearing.start();
      setListening(true);
    } catch {
      recognizer.current = null;
      setMicNote("The browser could not start listening. Type the question instead.");
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(text, false);
  }

  return (
    <section aria-label="Ask about this case" className="space-y-2">
      <form
        onSubmit={submit}
        className="flex h-12 items-center gap-1.5 rounded-2xl border bg-card pr-2 pl-4 shadow-xs focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30"
      >
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          readOnly={listening}
          maxLength={500}
          aria-label="Ask about this case"
          placeholder={listening ? "Listening. Ask your question, then pause." : "Ask about this case: who are we waiting on? what is the coverage limit?"}
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {hears && (
          <button
            type="button"
            onClick={listen}
            disabled={busy}
            aria-pressed={listening}
            aria-label={listening ? "Stop listening and ask" : "Ask by voice"}
            title={listening ? "Stop listening and ask" : "Ask by voice"}
            className={cn(
              "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-50",
              listening ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {listening ? <Square className="size-3.5 fill-current" /> : <Mic className="size-4" />}
          </button>
        )}
        <Button type="submit" disabled={busy || listening || text.trim().length < 3}>
          Ask
        </Button>
        <Button type="button" variant="outline" disabled={busy || listening} onClick={() => void ask(CATCH_UP, false, true)}>
          Catch me up
        </Button>
      </form>

      {micNote && (
        <p role="status" className="px-4 text-xs text-muted-foreground">
          {micNote}
        </p>
      )}

      {rows.length > 0 && (
        <div className={cn(panelClass, "overflow-hidden")}>
          <div className="flex items-baseline justify-between gap-4 bg-muted/60 px-5 py-2.5">
            <p className="text-xs text-muted-foreground">Answered from this case&apos;s file. Open a source to check an answer against it.</p>
            <button type="button" onClick={close} className={cn(linkClass, "shrink-0 text-xs")}>
              Close
            </button>
          </div>
          <ul aria-live="polite" className="divide-y">
            {rows.map((row, index) => (
              <li
                key={row.id}
                className="grid animate-in gap-x-6 gap-y-1.5 px-5 py-4 duration-300 fade-in slide-in-from-top-1 motion-reduce:animate-none md:grid-cols-[13rem_minmax(0,1fr)]"
              >
                <p className="text-sm leading-snug text-muted-foreground">{row.question}</p>
                <div className="min-w-0 space-y-2">
                  {row.status === "thinking" && (
                    <p role="status" className="text-sm text-muted-foreground">
                      Looking through the file{elapsed > 0 && `, ${elapsed} ${elapsed === 1 ? "second" : "seconds"}`}
                    </p>
                  )}

                  {row.status === "failed" && (
                    <>
                      <p role="alert" className="text-sm text-destructive">
                        {row.message}
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void ask(row.question, row.spoken, row.catchUp, row.id)}
                        className={cn(linkClass, "disabled:cursor-default disabled:opacity-50")}
                      >
                        Try again
                      </button>
                    </>
                  )}

                  {row.status === "answered" && (
                    <>
                      <p className={cn("max-w-prose font-serif leading-snug text-pretty", index === 0 ? "text-[17px]" : "text-[15px]")}>
                        {row.result.answer}
                      </p>
                      {row.result.evidence.length > 0 ? (
                        <p>
                          <SourceLinks evidence={row.result.evidence} />
                        </p>
                      ) : (
                        !row.result.answer.startsWith(NOT_IN_FILE.slice(0, -1)) && (
                          <p className="text-xs text-muted-foreground">No entry of the file was cited for this answer. Check it in the full file.</p>
                        )
                      )}
                      {row.result.evidence.some((item) => !item.found) && (
                        <p className="text-xs text-muted-foreground">
                          A passage this answer quotes was not found word for word in its source. Open the sources to check it.
                        </p>
                      )}
                      <p className="flex flex-wrap gap-x-5 gap-y-1">
                        {isPart(row.result.part) && (
                          <button type="button" onClick={() => openTab(row.result.part)} className={linkClass}>
                            Open {PART_LABEL[row.result.part]}
                          </button>
                        )}
                        {speaks &&
                          (reading === row.id ? (
                            <button type="button" onClick={stopReading} className={linkClass}>
                              Stop reading
                            </button>
                          ) : (
                            <button type="button" onClick={() => read(row.id, row.result.answer)} className={linkClass}>
                              Read it to me
                            </button>
                          ))}
                      </p>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
