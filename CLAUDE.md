@AGENTS.md

# Case Desk — hackathon starter

Starter for the Swans Applied AI Hackathon (Law-Di-Gras, 2026-10-02). The challenge is one operational
problem from a personal injury (PI) law firm, announced at kickoff. Coding time is 9:00–12:00 and
1:00–4:00, so optimise for a working, convincing demo over architecture. No auth, no tests, no
abstractions that aren't needed today.

## At kickoff

1. Put the hosts' brief and sample files in `challenge/`. That folder is git-ignored; keep the files
   out of `public/`, which anyone can read, unless the hosts say they are safe to publish.
2. Read everything in `challenge/` and answer, before writing code:
   - Who does this work today, and which step is slow or error-prone?
   - Which one workflow will the demo show end to end, and on which sample documents?
   - What must be extracted or decided, what does a person review, and what happens after approval?
   - Does anything need to be saved? If so, which tables (see "Database" below)?
   - What requirement did the brief leave unwritten (source links, audit trail, privacy)?
3. Fill in "Project direction" below: the user, their pain, the outcome and the one workflow.
4. Write the screen-by-screen brief described in "Designing a screen" and agree it before coding.
5. Build in this order, checking each step on the real samples before the next:
   1. Change `FIELDS` and the prompt, and run `pnpm -s script scripts/extract-file.ts challenge/<file>`
      until the output is right. This loop needs no browser.
   2. Adapt the review screen's wording, then whatever happens after Approve.
   3. Precompute the demo cases (see "The documents feature") so the demo never waits on the model.

## Hard rule: self-check before adding anything

**Project direction:** _not set yet. At kickoff, replace this with four lines:_

- _Primary user: the specific role doing this work today._
- _Pain point: the one repetitive or difficult task._
- _Successful outcome: what they will have accomplished._
- _Workflow: one sentence naming what the demo shows end to end._

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

## Designing a screen

Design the smallest complete journey first, on paper, before any code. One polished path beats
three half-built screens.

For each screen in the journey, write down:

- Why the user is here.
- What they need to see to make their decision.
- The one main action, and what happens after it.
- The loading, empty, success and error states.
- How they undo a mistake or get back to earlier work.

Rules for this app:

- Use the words of the user's role (see "PI vocabulary"), not ours. "Extract" and "fields" are our
  words; a case manager pulls facts from a record.
- Anything the model produced is shown beside its source, can be edited, and is approved by a person.
- Keep it restrained: shadcn components as they come, no decoration. Amber means a person must look;
  red means something failed. Do not use colour for anything else.
- If more than one role is involved, state what each can see, edit and approve. Hiding a button is
  not a permission; enforce it in the route.

Before calling a screen done, capture each of its states with `scripts/screenshot.ts` and check them
against these ten points (Nielsen's usability heuristics):

1. **Status is visible** — every wait says what is happening.
2. **The user's language** — labels and messages use their terms.
3. **Control** — they can cancel, undo and reopen; there are no dead ends.
4. **Consistency** — the same word and control for the same thing everywhere.
5. **Error prevention** — block or confirm before work is lost or something is sent.
6. **Recognition, not recall** — what they need is on the screen, not in their memory.
7. **Efficiency** — exceptions come first; the common case takes one action.
8. **Minimal** — nothing on the screen that the decision does not need.
9. **Recoverable errors** — a message says what went wrong and what to do, and stays visible.
10. **Help in place** — an empty screen says what to do next.

Then have a teammate use it with no instructions. Wherever they hesitate is the next thing to fix.

For components, look before building: `pnpm dlx shadcn@latest search @shadcn -q <word>` finds
components and blocks, `docs <name>` links their documentation, and `add <name>` installs one.

## Current state (evening of 2026-10-01)

What exists and works, locally and on production:

- An app shell: sidebar, a case list on placeholder rows, a case page, and a playground page that
  checks the model and database connections.
- One feature, `documents`: upload a PDF, image or text file, extract a list of fields from it, and
  review them next to the source. Details in "The documents feature".
- A model wrapper that passes its checks on Haiku 4.5, Sonnet 5.5 and Opus 5.5.

What does not exist: database tables, saving of anything (Approve changes only the screen), auth,
splitting of long documents, and any connection between a case and its documents.

Services:

- **Vercel** — production is https://law-di-gras.vercel.app, redeployed on every push to `main`.
  Hobby plan; functions may run 300 seconds. `ANTHROPIC_API_KEY`, `SUPABASE_URL` and
  `SUPABASE_SECRET_KEY` are set there. A changed environment variable needs a redeploy.
- **Anthropic** — a spend cap is set in the Console. When it is reached, every call fails with "You
  have reached your specified API usage limits".
- **Supabase** — see "Database".

Local setup needs the same three variables in `.env.local` (see `.env.example`).

## Database

- Supabase project `ocqpdippafieojisieln`, at https://ocqpdippafieojisieln.supabase.co.
- It has no tables. It has one private Storage bucket, `documents`, for uploaded files.
- Server code reaches it through `supabase()` in `src/server/supabase.ts`, which uses the secret key
  and so bypasses row-level security. Never use it in browser code.
- To add tables: write the SQL, and have the user run it in the SQL editor at
  https://supabase.com/dashboard/project/ocqpdippafieojisieln/sql/new. This machine cannot run SQL
  itself: `psql` is not installed, the Supabase CLI is not logged in, and the direct database host is
  IPv6-only. Keep the SQL in `supabase/schema.sql` so the schema is on record.
- Prefer a few tables with a `jsonb` column for challenge-specific data over a detailed schema.
- A random 401 with code `PGRST303` on table queries is a reported Supabase issue with `sb_secret_`
  keys. It has not been seen here; if it appears, retry the query once.

## Commands

- `pnpm dev` — app on http://localhost:3000
- `pnpm check-llm` — runs every model path against the real API
- `pnpm -s script scripts/extract-file.ts <file>` — extract a local file and print the JSON
- `pnpm -s script scripts/screenshot.ts <path> [--click <text>] [--upload <file>] [--wait <ms>] [--out <png>]`
  — take a picture of a page after some steps, then read the image (needs `pnpm dev` running)
- `pnpm -s script scripts/<file>.ts` — run any script with `.env.local` loaded
- `pnpm typecheck` / `pnpm lint` / `pnpm build`
- `pnpm dlx shadcn@latest add <component>` — add a UI component

## Where things live

```
src/
  app/                  Routing only. Pages and API routes; no logic of their own.
    page.tsx            Case list.          cases/[id]/page.tsx   Case page with document review.
    playground/         Connection checks and a streaming prompt box.
    api/<feature>/<action>/route.ts
    api/llm/stream/     Generic streaming prompt endpoint, used by the playground.
    api/health/         Smoke tests: model (/api/health) and Supabase (/api/health/db).
  features/<name>/      One folder per product feature. Everything about the feature is here.
    schema.ts           What gets extracted, as a Zod schema and inferred types. Browser-safe.
    prompt.ts           System prompt and instructions.
    server.ts           Server functions: call the model and Supabase. Used by routes and scripts.
    *.tsx               The feature's UI components.
  server/               Server-only infrastructure shared by features.
    llm.ts              The only file that talks to Claude: complete, extract, streamText, ping.
    supabase.ts         Supabase client (Postgres + Storage).
    http.ts             Route helpers: parseJson, errorResponse.
  components/           UI shared across features (app-sidebar). `ui/` is shadcn-generated.
  lib/                  Browser-safe helpers only (fetchJson, postJson, cn).
scripts/                check-llm, extract-file, screenshot, create-bucket (one-time Storage setup).
public/demo/            A sample record and its precomputed extraction, opened by "Open sample".
challenge/              The hosts' brief and sample files (git-ignored; create it at kickoff).
```

Features: `documents` (below) and `cases` (placeholder rows in `data.ts`; replace with real queries
in a `server.ts`).

| To change… | Open |
|---|---|
| What the model extracts | `src/features/<name>/schema.ts` (for documents, the `FIELDS` list) |
| How the model is instructed | `src/features/<name>/prompt.ts` |
| What happens on the server for a feature | `src/features/<name>/server.ts` |
| What the user sees for a feature | `src/features/<name>/*.tsx` |
| Which page shows it, or the URL | `src/app/**/page.tsx` |
| Model choice, token limits, file handling | `src/server/llm.ts` |
| Database or file storage access | `src/server/supabase.ts`, then the feature's `server.ts` |
| Sidebar navigation | `src/components/app-sidebar.tsx` |

## The documents feature

- Flow: the browser asks `/api/documents/upload-url` for a signed URL, PUTs the file straight to the
  Storage bucket, then posts the returned path to `/api/documents/extract`, which reads the file back
  and calls the model. Nothing but the path passes through our API.
- What to extract is the `FIELDS` list in `schema.ts`. The model returns one entry per field (several
  for a `list` field), each with a value, a supporting quote, the page and an optional concern.
  `tidy` in `server.ts` puts them in `FIELDS` order and adds a blank entry for anything not found.
- The review screen (`document-review.tsx`, `review-panel.tsx`, `source-viewer.tsx`) shows the source
  beside the fields. A page link jumps the PDF and highlights the quote; a quote that is not in the
  document shows no highlight, which is the reviewer's cue. This relies on desktop Chrome's built-in
  PDF viewer and on the PDF having a text layer.
- A field needs review when the model raised a concern or gave no quote (`needsReview`). There is no
  confidence score: the model's own percentage would not be a measured number.
- Approve is blocked until flagged fields are checked or edited. Nothing is saved.
- To show a document without waiting for the model, extract it ahead of time with
  `pnpm -s script scripts/extract-file.ts <file> > public/demo/<name>.json`, put the file in
  `public/demo/`, and load the pair the way `openSample` does in `document-review.tsx`.

Measured on synthetic, text-only pages (real scans cost more tokens per page):

| Document | Model | Input tokens | Time |
|---|---|---|---|
| 12 pages | claude-haiku-4-5 | 22,000 | about 20 s |
| 12 pages | claude-sonnet-5-5 | 23,500 | about 30 s |
| 12 pages | claude-opus-5-5 | not recorded | about 40 s |
| 120 pages | claude-sonnet-5-5 | 218,000 | 59 s |

Limits that follow:

- Haiku takes at most 100 PDF pages and 200,000 tokens per request; above that the API answers "A
  maximum of 100 PDF pages may be provided." Use a larger model for longer documents.
- The larger models take 600 pages and 1,000,000 tokens. At roughly 1,800 tokens per page or more,
  expect a ceiling of a few hundred pages. A longer record must be split into page ranges first, and
  page numbers then need the range's offset added. Nothing here does that yet.
- A file can be at most 23 MB, because the model accepts 32 MB per request and files are sent
  base64-encoded. Larger files would need the Files API.
- The extract route stops the model call after 270 seconds. `scripts/extract-file.ts` has no limit.

Usability gaps found when the review screen was checked against the ten points above, not yet fixed:

- An extraction cannot be cancelled once started (point 3).
- Choosing another file, or opening the sample, discards a review in progress without warning (5).
- "Extract" is our word, not the user's (2). Rename it once the user's role is known.

## Adding a feature

Run the self-check above first. Then:

1. `src/features/<name>/schema.ts` — Zod schema for the model's output.
2. `src/features/<name>/prompt.ts` — the prompts.
3. `src/features/<name>/server.ts` — a function that calls `extract` / `complete` / `streamText`.
4. `src/app/api/<name>/<action>/route.ts` — parse the request, call that one function, return JSON.
5. `src/features/<name>/<component>.tsx` — client UI that calls the route with `postJson`.
6. Add the component to a page in `src/app/`, and a nav entry if it gets its own page.
7. Add a check to `scripts/check-llm.ts` so the model path can be verified without the browser.

`src/features/documents/` is the worked example of all seven steps. For text that should appear as it
is written (a draft letter, a summary), `streamText` with `src/app/api/llm/stream/route.ts` and the
reader loop in `src/app/playground/page.tsx` is the worked example.

## Structure rules

- `src/app/` stays thin. A route handler validates input, calls one function from a feature's
  `server.ts`, and returns its result or `errorResponse(err)`. No prompts, schemas or model calls in
  `app/`.
- Use the fixed file names above inside a feature, so every feature reads the same way.
- `src/server/**` and every feature's `server.ts` are server-only: never import them from a
  `"use client"` file. Nothing enforces this; the symptom of getting it wrong is a misleading
  "ANTHROPIC_API_KEY is not set" error in the browser.
- A feature's `schema.ts` is imported by its client components, so it must stay browser-safe: Zod
  schemas, types and small pure functions only.
- `src/lib/` must stay safe to import in the browser: no secrets, no `process.env`, no Node APIs.
- Imports: relative (`./schema`) inside a feature, `@/…` everywhere else. A feature imports from
  `@/server`, `@/lib` and `@/components`; if two features need the same code, move it up into one of
  those rather than importing across features.
- Secrets are read from `process.env` only inside `src/server/`.
- Any path or id that comes from a request and is passed to Supabase must be validated first, as
  `isDocumentPath` does. The Storage client builds its URL from the path as given, so `../` would
  reach other buckets and APIs with the secret key.
- After moving or deleting a route, delete the `.next` folder if `pnpm typecheck` or `pnpm build`
  complains about a missing module in `.next/**/validator.ts`.

## LLM conventions

- Call the model only through `src/server/llm.ts`. Don't construct an Anthropic client anywhere else.
- Default model is `claude-haiku-4-5`. `pnpm check-llm` also passes, with no code changes, on
  `claude-sonnet-5-5` and `claude-opus-5-5` (checked 2026-10-01). To switch, change the default in
  `src/server/llm.ts` and push, which moves local and production together; or set `LLM_MODEL`, which on
  Vercel only takes effect after a redeploy.
- The wrapper sends no `thinking` or `effort` parameter, which is the one request shape all three
  models accept (Haiku rejects `effort`). Load the `claude-api` skill before adding either.
- The larger models think before answering, so they are slower, and they can decline a request. A
  declined or cut-off reply is thrown as an error, never returned as a partial answer. No fallback
  model is configured.
- Structured output: call `extract(Schema, { system, prompt, files })`. Every schema field must be
  required; use `.nullable()` for unknowns. The SDK does not enforce `z.enum` (it becomes a hint in
  the description), so validate or normalise such values yourself, as `tidy` in the documents feature
  does for labels.
- Structured output and API-level citations cannot be combined. To point at sources, ask for a quote
  and a `page` in the schema, as `ExtractedField` does.
- Files: PDFs and the four supported image types are sent natively, text and JSON are inlined, and
  anything else is rejected.
- Every API error has the shape `{ error: { type, message } }`. In the browser, `fetchJson` and
  `postJson` from `src/lib/fetch-json.ts` throw an Error carrying that message.

## UI conventions

- shadcn here is built on Base UI, not Radix: there is no `asChild`. Compose with the `render` prop,
  e.g. `<SidebarMenuButton render={<Link href="/" />}>`.
- Import `cn` from `@/lib/utils`.
- Dynamic route `params` is a Promise in this Next.js version: `const { id } = await params`.
- Creating an object URL or other state inside `useEffect` fails this repo's lint; do it in the event
  handler, as `choose` does in `document-review.tsx`.
- Look at what you built instead of guessing: `scripts/screenshot.ts` drives the installed Chrome
  headless and saves a picture to `screenshots/` (git-ignored). It renders the PDF viewer too, e.g.
  `pnpm -s script scripts/screenshot.ts /cases/c-1001 --click "Open sample" --click "p. 11" --wait 2500`.

## Deployment

- Vercel rejects request and response bodies over 4.5 MB, so files never go through an API route:
  they are uploaded from the browser to Supabase Storage and read server-side.
- Model routes set `maxDuration = 300`, the most the plan allows. Streaming a response does not
  extend it. A request that runs past it gets a bare 504 from Vercel, shown as "Request failed (504)".
- The Storage bucket is created by `scripts/create-bucket.ts`. Uploaded files are never deleted
  automatically; empty the bucket by hand when needed.
- After a push, wait for the deployment to finish before testing production:
  `gh api "repos/OscarKhaing/law-di-gras/deployments?sha=$(git rev-parse HEAD)"` lists it.

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
