@AGENTS.md

# Case Desk — Swans Applied AI Hackathon, 2026-10-02

**Hard stop 4:00 PM. Feature freeze 3:00 PM.** Optimise for a working, convincing demo over
architecture. No tests, no abstractions that aren't needed today.

## The challenge

On one live Clio Manage matter (a personal injury case; the hosts' brief and files are in the
git-ignored `challenge/` folder), build a dashboard that (1) gets a firm's own people up to speed on
a case in about 90 seconds and (2) gives the treating medical providers visibility into where the
case stands. The hosts want a visual digest of what is already in the file, not a chat box.

Rules that decide whether we make the top seven (Swans reads the repo at 4:00):

- **Read the case live from Clio.** The hosts' JSON in `challenge/` is their setup payload, not our input.
- **Nothing hardcoded.** No name, date, amount or fact of the case may appear in `src/` or `scripts/`.
  Every sentence on screen comes from Clio or from a model reading Clio, and says where it came from.
- **Clio is read-only.** `src/server/clio.ts` exports GET helpers only. Our own data goes in Supabase.

## What we are building

One workflow, end to end: **open the case, read the brief, open any line's source, then send a
treating provider an update the attorney has checked.**

Readers: the attorney, the case manager, and the provider's billing or lien coordinator. The one
permission boundary is firm to provider, enforced on the server: the provider's page can read
nothing but the update published to its link.

1. **Cases (`/`).** Cases read from Clio. A row opens the case. States: Clio not connected, none read
   yet, error.
2. **The brief (`/cases/[id]`),** read top to bottom: header (client, matter number, stage track from
   Clio's stages, "Read from Clio at …", "Check Clio"); the bottom line in the serif face; "since you
   last opened" as a marker strip (computed in code); at a glance; worth and coverage (bars on one
   scale, the coverage limit as a marker line through them, the firm's own spend underneath); the ten
   moments that matter on a time strip with a ledger below; needs attention (overdue and coming up
   from tasks and calendar in code; waiting on others and to decide from the model); red flags;
   injuries; treating providers (with "Prepare update" and whether a shared update was opened); the
   full file (every entry, filter by kind, search); how this brief was made (models, cost, when).
   Selecting any line opens the **source panel** on the right: the note, email, call, task or
   calendar entry with the quoted passage marked, or the document at the cited page.
3. **Provider update (`/cases/[id]/providers/[contact]`).** Left: drafted lines grouped by section,
   each with a switch, editable wording and its source; lines that are the attorney's call start
   switched off. Right: the provider's page exactly as it will look. Main action: "Publish and copy
   link"; then the link, its expiry, opens and replies. Undo: "Withdraw link".
4. **The provider's page (`/p/[token]`),** no sidebar, works on a phone: the case is active and at
   which stage, what the firm needs from this office, the lines the attorney switched on, who to call.
   The provider can reply to a request; the reply is stored in our database and shown to the firm as
   "from the provider, not yet in Clio".

How it works: `syncCase` reads a matter from Clio into one `CaseFile` (a flat list of entries, each
with a short ref such as `N12`) stored in Supabase. Documents are copied to Storage and their pages
indexed once by Haiku 4.5. `buildBrief` makes one structured call to Opus 5.5 over the entries and
the page index; code then checks every ref and quote and stores the brief against the case file's
fingerprint. Opening a case never calls Clio or a model. Dates, sums, overdue, last contact and
"since you last opened" are computed in code, not by the model.

## Who builds what

Three people, each with a Claude session. **Stay inside your own paths.** Commit small, run
`pnpm typecheck` and `git pull --rebase` before every push, `git add` your own paths (never `-A`),
never force-push. Only lane 1 edits the shared files.

| Lane | Owns | Delivers |
|---|---|---|
| 1. Pipeline (Oscar) | `src/server/clio.ts`, `src/features/cases/{schema,server}.ts`, `src/features/documents/`, `src/features/brief/{schema,prompt,server}.ts`, `src/app/api/{clio,cases,documents,brief}/`, `scripts/`, `supabase/schema.sql`, and the shared files: `CLAUDE.md`, `package.json`, `src/app/layout.tsx` | A real case file in Supabase, then the brief, then the page index |
| 2. The brief page | `src/features/brief/*.tsx`, `src/features/cases/*.tsx`, `src/app/(firm)/` except `cases/[id]/providers/`, `src/components/`, `src/app/globals.css` | Screens 1 and 2 and the source panel |
| 3. Provider side | `src/features/shares/`, `src/app/api/shares/`, `src/app/(firm)/cases/[id]/providers/`, `src/app/p/`, `README.md` | Screens 3 and 4, open tracking, replies, then the README |

The contract between the lanes is three files; change one only after telling the others:
`src/features/cases/schema.ts` (`CaseFile`, `Entry`, `Evidence`, and the helpers `overdue`,
`upcoming`, `lastClientContact`, `firmSpend`, `changedSince`, `byRef`, `parseSource`),
`src/features/brief/schema.ts` (`Brief`, `StoredBrief`) and `src/features/shares/schema.ts`
(`UpdateDraft`, `ProviderUpdate`, `ShareStatus`). Screens read through `getCaseFile` and `listCases`
(`cases/server.ts`), `getBrief` (`brief/server.ts`) and `sharesFor` (`shares/server.ts`).

Only lane 1 calls Clio: it allows 50 requests a minute per token during the day. Everyone else reads
the case file from Supabase. Until the first sync lands, build against the types.

Checkpoints: **12:00** the brief page shows a real bottom line, money, needs attention and ten
moments, and a line opens its source. **2:00** the whole workflow runs locally. **3:00** no new
features. If behind at 2:00, cut provider replies, the client photo and full-file search first.

Not building unless asked: sign-in for the firm side, email to providers, a body diagram, a role
switch inside the firm.

## Hard rule: self-check before adding anything

**Project direction:**

- Primary user: an attorney or case manager opening a case they have not seen, and the billing or
  lien coordinator at a provider treating the client.
- Pain point: the case system holds everything but nobody can absorb it; providers cannot see where
  the case stands and fall back on email.
- Successful outcome: the firm's reader knows where the case stands, what it is worth and what is
  stuck within 90 seconds, with a source behind every line; the provider knows the case is alive and
  what the firm needs from them.
- Workflow: open the case, read the brief, open a line's source, publish a checked update to a provider.

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

- Use the words of the user's role (see "PI vocabulary"), not ours. The app "reads a document" and
  lists "facts"; "extract" and "fields" are our words and stay in the code.
- Anything the model produced is shown beside its source, can be edited, and is approved by a person.
- If more than one role is involved, state what each can see, edit and approve. Hiding a button is
  not a permission; enforce it in the route.

### The visual system

The look is deliberate, not shadcn's default. The project has the `frontend-design` plugin enabled
(see `.claude/settings.json`); use that skill for visual work, and stay inside this system when
adding screens. Tokens live in `src/app/globals.css`, fonts in `src/app/layout.tsx`.

- **The one bold idea is the highlighter.** A passage quoted from a document is drawn as a marker
  stroke (`bg-marker`), the same gesture as the highlight that appears in the source. Spend boldness
  there and keep everything around it quiet.
- **Two typefaces, each with a meaning.** Source Serif 4 (`font-heading`, `font-serif`) is for page
  headings and for words taken from a document: values and quotes. IBM Plex Sans (the default) is
  the app speaking. A reader should be able to tell which is which from the face alone.
- **Colour has three jobs and no others.** Ledger green (`primary`) is the user's own action and
  approval. Marker yellow (`marker`, `marker-soft`) is evidence and anything a person must look at.
  Red (`destructive`) means something failed. Everything else is ink on a cool off-white.
- **Ledgers, not cards.** Lists are rows divided by hairlines with the label in a left column, as in
  `review-panel.tsx` and the case table. Do not wrap each item in its own rounded box.
- **Structure must carry information.** The stage track on a case is there because the stages really
  are a sequence. Do not add numbering, labels above headings, or dividers that encode nothing.
- **One piece of motion per screen**, and only in answer to something the user did: the ledger rows
  arriving when a reading lands. No hover effects on every row, no entrance animation on page load.
- Avoid the marks of a generated page: all-caps labels, facts strung together with middle dots,
  arrows on links, a monospace face for small labels, one accent word in a heading.

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

## Current state (10:15 on 2026-10-02, after step 0)

- The three contract files exist. `listCases`, `getCaseFile` and `getBrief` read from Supabase and
  work once the tables are created; `syncCase`, `buildBrief` and `sharesFor` are stubs.
- The firm's pages are under `src/app/(firm)/` with the sidebar; `/p/[token]` has none and shows
  "This link is not active". The case list and case page render the case file's header only.
- Not built yet: the Clio client and connection, the sync, the page index, the brief, every section
  of the brief page, the source panel, and the whole provider side.
- Left over from the starter, to delete at the 3:00 cleanup: the upload-and-review screen
  (`document-review.tsx`, `review-panel.tsx`, the two `api/documents` routes, `public/demo/`,
  `scripts/extract-file.ts`) and the playground. `source-viewer.tsx` and the `Quote` marker in
  `review-panel.tsx` are reused: see "The documents feature" for how the page jump and highlight work.
  The two long scans in this case have no text layer, so a citation into them jumps to the page
  without a highlight.

Services:

- **Vercel** — production is https://law-di-gras.vercel.app, redeployed on every push to `main`.
  Hobby plan; functions may run 300 seconds. `ANTHROPIC_API_KEY`, `SUPABASE_URL` and
  `SUPABASE_SECRET_KEY` are set there. A changed environment variable needs a redeploy. On this
  plan only commits by project members deploy; one teammate was added, and their first push has not
  been seen to deploy yet.
- **Anthropic** — a spend cap is set in the Console. When it is reached, every call fails with "You
  have reached your specified API usage limits".
- **Supabase** — see "Database".

Local setup needs the same three variables in `.env.local` (see `.env.example`).

## Database

- Supabase project `ocqpdippafieojisieln`, at https://ocqpdippafieojisieln.supabase.co.
- Its tables are in `supabase/schema.sql`: `clio_connection`, `case_files`, `document_digests`,
  `briefs`, `visits`, `shares`, `share_events`. Row-level security is on with no policies, so only
  the secret key can read them. It has one private Storage bucket, `documents`.
- Server code reaches it through `supabase()` in `src/server/supabase.ts`, which uses the secret key
  and so bypasses row-level security. Never use it in browser code.
- To add tables: write the SQL, and have the user run it in the SQL editor at
  https://supabase.com/dashboard/project/ocqpdippafieojisieln/sql/new. This machine cannot run SQL
  itself: `psql` is not installed, the Supabase CLI is not logged in, and the direct database host is
  IPv6-only. Keep the SQL in `supabase/schema.sql` so the schema is on record. (The owner's
  `.env.local` also holds the database password as `SUPABASE_PASSWORD`; nothing in the app reads it.)
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
    layout.tsx          Fonts and providers only.
    (firm)/             The firm's side, with the sidebar: page.tsx (case list),
                        cases/[id]/page.tsx (the brief), cases/[id]/providers/[contact]/ (provider update),
                        playground/ (connection checks).
    p/[token]/          The provider's page. No sidebar; reads only the published update.
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

Features: `cases` (the case file read from Clio), `documents` (the page index and the source
viewer), `brief` (the model-written brief and its screen) and `shares` (provider updates).

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
- What to extract is the `FIELDS` list in `schema.ts`. Today it holds ten example fields for a PI
  medical record (client, date of incident, incident, diagnoses, treatment, charges, total charges,
  gaps in treatment, prior conditions, work impact); replace them with the challenge's. The model
  returns one entry per field (several for a `list` field), each with a value, a supporting quote,
  the page and an optional concern. `tidy` in `server.ts` puts them in `FIELDS` order, adds a blank
  entry for anything not found, and keeps (flagged) any entry under a label that was not asked for.
- The review screen (`document-review.tsx`, `review-panel.tsx`, `source-viewer.tsx`) shows the source
  beside the fields. Selecting a quote jumps the PDF to its page and highlights the passage; a quote
  that is not in the document shows no highlight, which is the reviewer's cue. This relies on desktop
  Chrome's built-in PDF viewer and on the PDF having a text layer. Images and text files are shown
  without page links.
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
  `@/server`, `@/lib` and `@/components`. Today a feature may also import another feature's
  `schema.ts` and the read functions of its `server.ts` (every feature builds on the case file), but
  never its components or prompts.
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
