# Case Desk

Starter app for the Swans Applied AI Hackathon at Law-Di-Gras: Next.js, Tailwind, shadcn/ui, the Claude
API, and Supabase.

## Setup

```bash
pnpm install
cp .env.example .env.local   # then add ANTHROPIC_API_KEY
pnpm check-llm               # all five checks should pass
pnpm dev                     # http://localhost:3000
```

Open `/playground` to test the model connection, a prompt, streaming, and document extraction from the
browser. `fixtures/sample-collision-report.pdf` is a synthetic document to upload.

## API routes

| Route | Body | Returns |
|---|---|---|
| `GET /api/health` | — | `{ ok, model, latencyMs }` after a real model call |
| `GET /api/health/db` | — | `{ ok, buckets }` after a real Supabase call |
| `POST /api/llm/complete` | JSON `{ prompt, system? }` | `{ text, model, usage }` |
| `POST /api/llm/stream` | JSON `{ prompt, system? }` | plain-text stream |
| `POST /api/documents/extract` | form-data `file`, `instructions?` | `{ data }` matching `DocumentSummary` |

Errors come back as `{ error: { type, message } }`.

## Structure

Each product feature lives in `src/features/<name>/` (`schema.ts`, `prompt.ts`, `server.ts`, UI
components). `src/app/` only routes to them, `src/server/` holds the shared Claude and Supabase clients,
and `src/lib/` holds browser-safe helpers. The full map, the steps for adding a feature, and the rules
are in [CLAUDE.md](CLAUDE.md).
