# Case Desk

Starter app for the Swans Applied AI Hackathon at Law-Di-Gras: Next.js, Tailwind, shadcn/ui, the Claude
API, and Supabase.

## Setup

```bash
pnpm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY, SUPABASE_URL and SUPABASE_SECRET_KEY
pnpm check-llm               # all five checks should pass
pnpm dev                     # http://localhost:3000
```

On a new Supabase project, also run `pnpm -s script scripts/create-bucket.ts` once to create the
private Storage bucket that uploads go to.

Open a case from the list to review a document: choose a PDF, image or text file and click Extract, or
click **Open sample** to see a 12-page synthetic medical record that was extracted ahead of time. The
review screen needs desktop Chrome, whose PDF viewer does the page jumps and quote highlighting.

`/playground` checks the model and database connections and has a streaming prompt box.

## API routes

| Route | Body | Returns |
|---|---|---|
| `GET /api/health` | — | `{ ok, model, latencyMs }` after a real model call |
| `GET /api/health/db` | — | `{ ok, buckets }` after a real Supabase call |
| `POST /api/llm/stream` | JSON `{ prompt, system? }` | plain-text stream |
| `POST /api/documents/upload-url` | JSON `{ fileName }` | `{ path, uploadUrl }`; PUT the file to `uploadUrl` |
| `POST /api/documents/extract` | JSON `{ path }` | `{ data, model, usage }`, the fields found in the document |

Errors come back as `{ error: { type, message } }`.

## Scripts

| Command | What it does |
|---|---|
| `pnpm check-llm` | Runs every model path against the real API |
| `pnpm -s script scripts/extract-file.ts <file>` | Extracts a local file and prints the JSON; no size or time limit from the server |
| `pnpm -s script scripts/create-bucket.ts` | Creates the Storage bucket (once per Supabase project) |

## Structure

Each product feature lives in `src/features/<name>/` (`schema.ts`, `prompt.ts`, `server.ts`, UI
components). `src/app/` only routes to them, `src/server/` holds the shared Claude and Supabase clients,
and `src/lib/` holds browser-safe helpers. The full map, the steps for adding a feature, the limits for
long documents and the rules are in [CLAUDE.md](CLAUDE.md).
