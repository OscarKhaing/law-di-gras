@AGENTS.md

# Case Desk — hackathon starter

Starter for the Swans Applied AI Hackathon (Law-Di-Gras, 2026-10-02). The challenge is one operational
problem from a personal injury (PI) law firm, announced at kickoff. Coding time is 9:00–12:00 and
1:00–4:00, so optimise for a working, convincing demo over architecture. No auth, no tests, no
abstractions that aren't needed today.

## Hard rule: self-check before adding anything

**Project direction:** _not set yet. At kickoff, replace this with one sentence naming the workflow
the demo will show end to end._

Before adding a feature, dependency, abstraction, guard, config option or extra endpoint, stop and
answer these four questions:

1. **Direction** — does it move the demo's one end-to-end workflow forward, or is it beside it?
2. **Request** — was it asked for? If not, would its absence break the demo or mislead a judge?
3. **Cost** — what does it add: a dependency, a new concept to explain, another way for the demo to
   fail, time that could go to the core workflow?
4. **Simpler option** — can existing code, a convention in this file, or doing nothing cover it?

Then decide:

- Build it only if it serves the direction (1) and its cost (3) is small next to what it buys.
- Otherwise do not build it. Tell the user in one line what you left out and why, and let them opt in.
- When unsure, don't build.

Say the outcome in one line before implementing, e.g. "Self-check: needed for the demo path, no new
dependency, building it." This applies to work the user asked for as well: if a requested feature
fails the check, say so before starting rather than building it silently.

Two things already failed this check and were removed: a site-wide password gate (redundant once the
API spend cap was set) and a `server-only` import guard (a dependency and a script flag to enforce
what the folder layout already shows).

## Commands

- `pnpm dev` — app on http://localhost:3000
- `pnpm check-llm` — runs every LLM path against the real API (needs `ANTHROPIC_API_KEY` in `.env.local`)
- `pnpm script scripts/<file>.ts` — run a script with `.env.local` loaded
- `pnpm typecheck` / `pnpm lint` / `pnpm build`
- `pnpm dlx shadcn@latest add <component>` — add UI components

## Where things live

```
src/
  app/                  Routing only. Pages and API routes; no logic of their own.
    api/<feature>/<action>/route.ts
    api/llm/            Generic prompt endpoints (complete, stream) used by the playground.
    api/health/         Smoke tests: model (/api/health) and Supabase (/api/health/db).
  features/<name>/      One folder per product feature. Everything about the feature is here.
    schema.ts           Zod schema and inferred types: what the model returns / what the data is.
    prompt.ts           System prompt and instructions.
    server.ts           Server functions: call the model and Supabase. Used by routes and scripts.
    *.tsx               The feature's UI components.
  server/               Server-only infrastructure shared by features.
    llm.ts              The only file that talks to Claude: complete, extract, streamText, ping.
    supabase.ts         Supabase client (Postgres + Storage).
    http.ts             Route helpers: parseJson, badRequest, errorResponse.
  components/           UI shared across features (app-sidebar). `ui/` is shadcn-generated.
  lib/                  Browser-safe helpers only (fetchJson, cn).
scripts/                Node scripts (check-llm; put demo precompute scripts here).
fixtures/               Synthetic test documents.
```

Existing features: `documents` (upload → extract → human review) and `cases` (placeholder list in
`data.ts`; replace with real queries in a `server.ts`).

| To change… | Open |
|---|---|
| What the model extracts | `src/features/<name>/schema.ts` |
| How the model is instructed | `src/features/<name>/prompt.ts` |
| What happens on the server for a feature | `src/features/<name>/server.ts` |
| What the user sees for a feature | `src/features/<name>/*.tsx` |
| Which page shows it, or the URL | `src/app/**/page.tsx` |
| Model choice, token limits, file handling | `src/server/llm.ts` |
| Database or file storage access | `src/server/supabase.ts`, then the feature's `server.ts` |
| Sidebar navigation | `src/components/app-sidebar.tsx` |

## Adding a feature

Run the self-check above first. Then:

1. `src/features/<name>/schema.ts` — Zod schema for the model's output.
2. `src/features/<name>/prompt.ts` — the prompts.
3. `src/features/<name>/server.ts` — a function that calls `extract` / `complete` / `streamText`.
4. `src/app/api/<name>/<action>/route.ts` — parse the request, call that one function, return JSON.
5. `src/features/<name>/<component>.tsx` — client UI that calls the route with `fetchJson`.
6. Add the component to a page in `src/app/`, and a nav entry if it gets its own page.
7. Add a check to `scripts/check-llm.ts` so the model path can be verified without the browser.

`src/features/documents/` is the worked example of all seven steps.

## Structure rules

- `src/app/` stays thin. A route handler validates input, calls one function from a feature's
  `server.ts`, and returns its result or `errorResponse(err)`. No prompts, schemas or model calls in
  `app/`.
- Use the fixed file names above inside a feature, so every feature reads the same way.
- `src/server/**` and every feature's `server.ts` are server-only: never import them from a
  `"use client"` file. Nothing enforces this; the symptom of getting it wrong is a misleading
  "ANTHROPIC_API_KEY is not set" error in the browser. Client components may import a feature's
  `schema.ts` with `import type`.
- `src/lib/` must stay safe to import in the browser: no secrets, no `process.env`, no Node APIs.
- Imports: relative (`./schema`) inside a feature, `@/…` everywhere else. A feature imports from
  `@/server`, `@/lib` and `@/components`; if two features need the same code, move it up into one of
  those rather than importing across features.
- Secrets are read from `process.env` only inside `src/server/`.
- After moving or deleting a route, delete the `.next` folder if `pnpm typecheck` or `pnpm build`
  complains about a missing module in `.next/**/validator.ts`.

## LLM conventions

- Call the model only through `src/server/llm.ts`. Don't construct an Anthropic client anywhere else.
- Default model is `claude-haiku-4-5` (override with `LLM_MODEL`). Haiku rejects the `effort` parameter
  and is called without thinking; before pointing `LLM_MODEL` at an Opus- or Sonnet-class model, load the
  `claude-api` skill, because their request parameters differ.
- Structured output: call `extract(Schema, { system, prompt, files })`. Every schema field must be
  required; use `.nullable()` for unknowns.
- Structured output and API-level citations cannot be combined. To point at sources, ask for a `page`
  field in the schema, as `DocumentSummary` does.
- Files: PDFs and images are sent natively; anything else is inlined as text. Use `fileFromUpload` to
  turn a form upload into an `LlmFile`.
- Every API error has the shape `{ error: { type, message } }`. In the browser, `fetchJson` from
  `src/lib/fetch-json.ts` throws an Error carrying that message.

## UI conventions

- shadcn here is built on Base UI, not Radix: there is no `asChild`. Compose with the `render` prop,
  e.g. `<SidebarMenuButton render={<Link href="/" />}>`.
- Import `cn` from `@/lib/utils`.
- Dynamic route `params` is a Promise in this Next.js version: `const { id } = await params`.

## Deployment

- Production is https://law-di-gras.vercel.app and redeploys on every push to `main`.
- Vercel rejects request bodies over 4.5 MB. Larger PDFs must be uploaded from the browser to
  Supabase Storage and fetched server-side, not posted to an API route.
- Routes set `maxDuration = 60`. Stream anything that could run longer.

## What a good demo needs

- A human approves before anything is saved or sent. Keep the review step visible.
- Every extracted fact shows where it came from (file and page).
- Use the firm's vocabulary in the UI (below), and state the time saved per case.
- Precompute results for the demo cases so the live demo never waits on a model call.

## PI vocabulary

A PI firm is paid a share of the settlement, so speed and case-manager capacity are the economics.
Stages: intake → claim setup → treatment → records & bills → demand → negotiation/settlement (or
litigation). Terms: case manager (runs the file day to day), adjuster (insurer's negotiator), LOR
(letter of representation), policy limits, specials (medical bills total), treatment gap (missed care
that weakens the claim), demand letter/package, lien (a provider's or insurer's claim on the
settlement), SOL (statute of limitations deadline), CMS (case management system: Filevine, Litify,
SmartAdvocate, CASEpeer).
