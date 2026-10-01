"use client";

import { useState } from "react";
import { ActivityIcon, DatabaseIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { fetchJson, postJson } from "@/lib/fetch-json";

type Health = { ok: true; reply: string; model: string; latencyMs: number };

const message = (err: unknown) => (err instanceof Error ? err.message : "Request failed");

// Exercises the model and database routes from the browser. Useful as a smoke test after every deploy.
// Document upload and review are on the case page.
export default function PlaygroundPage() {
  const [health, setHealth] = useState<{ text: string; ok: boolean } | null>(null);
  const [db, setDb] = useState<{ text: string; ok: boolean } | null>(null);
  const [prompt, setPrompt] = useState(
    "In two sentences, what slows down a personal injury case between intake and demand?",
  );
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);

  async function checkHealth() {
    setHealth({ text: "Checking…", ok: true });
    try {
      const result = await fetchJson<Health>("/api/health");
      setHealth({ text: `Connected to ${result.model} in ${result.latencyMs} ms`, ok: true });
    } catch (err) {
      setHealth({ text: message(err), ok: false });
    }
  }

  async function checkDb() {
    setDb({ text: "Checking…", ok: true });
    try {
      const result = await fetchJson<{ buckets: string[] }>("/api/health/db");
      setDb({ text: `Supabase connected, ${result.buckets.length} storage buckets`, ok: true });
    } catch (err) {
      setDb({ text: message(err), ok: false });
    }
  }

  async function complete() {
    setBusy(true);
    setOutput("");
    try {
      const result = await postJson<{ text: string }>("/api/llm/complete", { prompt });
      setOutput(result.text);
    } catch (err) {
      setOutput(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function stream() {
    setBusy(true);
    setOutput("");
    try {
      const res = await fetch("/api/llm/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setOutput((current) => current + chunk);
      }
    } catch (err) {
      setOutput(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold">LLM playground</h1>

      <Card>
        <CardHeader>
          <CardTitle>Connection</CardTitle>
          <CardDescription>
            One small model call through /api/health and one Supabase call through /api/health/db.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={checkHealth}>
              <ActivityIcon />
              Check model
            </Button>
            {health && <span className={health.ok ? "" : "text-destructive"}>{health.text}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={checkDb}>
              <DatabaseIcon />
              Check database
            </Button>
            {db && <span className={db.ok ? "" : "text-destructive"}>{db.text}</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prompt</CardTitle>
          <CardDescription>Full response via /api/llm/complete or chunks via /api/llm/stream.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={3} />
          <div className="flex gap-2">
            <Button onClick={complete} disabled={busy || !prompt.trim()}>
              Complete
            </Button>
            <Button variant="outline" onClick={stream} disabled={busy || !prompt.trim()}>
              Stream
            </Button>
          </div>
          {output && (
            <pre className="rounded-md border bg-muted/40 p-3 font-sans text-sm whitespace-pre-wrap">
              {output}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
