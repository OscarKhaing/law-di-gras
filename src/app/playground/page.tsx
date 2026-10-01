"use client";

import { useState } from "react";
import { ActivityIcon } from "lucide-react";
import { DocumentExtractor } from "@/components/document-extractor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { fetchJson } from "@/lib/fetch-json";

type Health = { ok: true; reply: string; model: string; latencyMs: number };

const message = (err: unknown) => (err instanceof Error ? err.message : "Request failed");

// Exercises each API route from the browser. Useful as a smoke test after every deploy.
export default function PlaygroundPage() {
  const [health, setHealth] = useState<{ text: string; ok: boolean } | null>(null);
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

  async function complete() {
    setBusy(true);
    setOutput("");
    try {
      const result = await fetchJson<{ text: string }>("/api/llm/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
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
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">LLM playground</h1>

      <Card>
        <CardHeader>
          <CardTitle>Connection</CardTitle>
          <CardDescription>Makes one small model call through /api/health.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-sm">
          <Button variant="outline" onClick={checkHealth}>
            <ActivityIcon />
            Check connection
          </Button>
          {health && <span className={health.ok ? "" : "text-destructive"}>{health.text}</span>}
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

      <DocumentExtractor />
    </div>
  );
}
