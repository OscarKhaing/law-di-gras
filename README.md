# Case Desk

Built for the Swans Applied AI Hackathon at Law-Di-Gras, 2026-10-02.

Case Desk reads one personal injury matter live from Clio Manage and turns it into two things:

- **A brief for the firm.** A case opens on an overview that reads in about ninety seconds: what is
  pressing, where the case stands, what is new since you last looked, what it is worth against the
  coverage behind it, and the ten moments that matter. The rest of the case is one click away in a
  menu beside it: what to do, the money, the timeline, the medical picture, the red flags and the
  full file. Every line opens the note, email, call, task or page of a document it came from.
- **Work, not only reading.**
  - *Who to chase.* Everyone the firm is waiting on, the one left longest first, with a follow-up
    drafted from that thread alone, to edit and copy. Nothing is sent.
  - *Settlement breakdown.* Try a figure and see the fee, costs, liens and what is left for the
    client, against the coverage limit. Pure arithmetic on the figures in the file.
  - *Bills by provider,* summed from Clio and checked against the specials figure.
  - *Treatment on record.* Every dated visit per provider on one strip, with the stretches the firm
    holds no records for.
  - *Worklists.* The sidebar says which cases have overdue tasks, are waiting on a provider or the
    other side, are near their policy limits, or have a limitation date coming.
  - *Reading as* attorney or case manager reorders the case; a handoff sheet prints it on a page.
- **An update for a treating provider.** The attorney checks a drafted update line by line, decides
  what leaves the firm, and publishes it to a private link. The firm sees when the provider's office
  opened it, and the provider can answer what the firm asked for and attach the records.

Clio is only read. Nothing is ever written to it.

## How it works

```
Clio Manage (read only)
   |  syncCase: about a dozen GETs, documents copied once per version
   v
case file  ---------->  page index of every document   (claude-haiku-4-5, once per document version)
   |                         |
   +-----------+-------------+
               v
            the brief   (one claude-opus-5-5 call, stored against the case file's fingerprint)
               |
   firm's screens            provider update (claude-sonnet-5-5 draft, attorney-approved)
                                   |
                              /p/<token>   reads only what was published
```

1. **Read.** `syncCase` (`src/features/cases/server.ts`) reads the matter, its custom fields,
   contacts, notes, communications, tasks, calendar entries, expenses and documents through
   `src/server/clio.ts`, which can only make GET requests. Everything becomes one flat list of
   entries, each with a short stable ref such as `N12` or `D9`. A fingerprint built from Clio's own
   etags says whether anything changed.
2. **Index the documents.** Each document is split into parts of at most 25 pages and a model notes,
   for every page, what it is, who it is from, its date and up to four facts (`src/features/documents`).
   This runs once per document version.
3. **Write the brief.** One structured call over the whole file and the page index
   (`src/features/brief`). The model must cite a ref for everything it says. Code then checks that
   every cited entry exists and that every quote is really in its source, and marks any that are not.
4. **Open a case.** The screens read the stored case file and brief. Opening a case calls neither
   Clio nor a model, so it costs nothing and takes no time. "Check Clio" re-reads the matter; the
   brief is rewritten only when the fingerprint has moved.
5. **Computed in code, not by a model:** what is overdue and coming up, the last time anyone spoke to
   the client, what the firm has spent, what is new since the reader last opened the case, and the
   cost of reading the case.
6. **Work from it.** The chase list drafts a follow-up with `claude-sonnet-5-5` from the one thread
   it concerns. The settlement breakdown, bills by provider, treatment on record and the sidebar's
   worklists are computed in code from the stored case file, brief and page index.
7. **Share with a provider.** The drafting model sees an allowlist built in code: that provider's own
   tasks, messages and appointments, the stage of the case, and what the firm holds from them. It
   never sees internal notes, custom fields, valuation or the brief's red flags. Publishing stores
   only the lines the attorney switched on. The provider's page (`/p/<token>`) looks the update up by
   the hash of its token and can read nothing else.

Nothing about any case is in the code: no names, dates or amounts. Point it at another matter in the
connected Clio account and it reads that one.

## Tech stack

- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui on Base UI
- Claude through the Anthropic API (`@anthropic-ai/sdk`), structured output with Zod schemas
- Supabase: Postgres for what we store, Storage for copies of the documents
- Vercel for hosting
- `pdf-lib` for splitting long PDFs and pulling the client's photo out of their ID

## Where data lives outside Clio

One Supabase project. Tables are in [`supabase/schema.sql`](supabase/schema.sql); row-level security
is on with no policies, so only the server's secret key can read them.

| Table | Holds |
|---|---|
| `clio_connection` | The OAuth tokens for the connected Clio account |
| `case_files` | Each matter as last read from Clio, with its fingerprint |
| `document_digests` | The page index, one row per part of a document |
| `briefs` | The brief written for each state of a case |
| `visits` | When each reader opened a case, for "since you last opened" |
| `shares`, `share_events` | Updates published to providers; opens and replies |

Copies of the matter's documents are in a private Storage bucket and are shown through signed URLs
that expire after an hour.

## Models and cost

| Step | Model | When it runs |
|---|---|---|
| Page index of the documents | `claude-haiku-4-5` | Once per document version |
| The brief | `claude-opus-5-5` | Once per state of the case in Clio |
| Draft of a provider update | `claude-sonnet-5-5` | When the attorney asks for one |

Measured on the hackathon matter (218 entries, 31 documents, 361 pages):

| Step | Tokens in | Tokens out | Cost |
|---|---|---|---|
| Page index | 808,090 | 45,065 | about $1.03 |
| The brief | 90,586 | 18,951 | about $0.74 |
| **Reading the case once** | | | **about $1.80** |

Rewriting the brief after a change in Clio costs about $0.75; the documents are not indexed again
unless they changed. Opening a case costs nothing. The page shows these figures from the token counts
stored with each step.

## Run it

```bash
pnpm install
cp .env.example .env.local     # Anthropic key, Supabase URL and secret key, Clio app ID and secret
```

1. Create a Supabase project, run [`supabase/schema.sql`](supabase/schema.sql) in its SQL editor, and
   run `pnpm -s script scripts/create-bucket.ts` once. `pnpm -s script scripts/check-db.ts` confirms
   the tables.
2. Create a Clio developer app at https://developers.clio.com/apps with **read** permission on
   Matters, Contacts, Custom fields, Documents, Communications, Tasks, Calendars, Activities and
   Users, and the redirect URI `http://127.0.0.1:3000/api/clio/callback`.
3. `pnpm dev`, open http://127.0.0.1:3000, press **Connect Clio** and allow access.
4. Open a case and press **Read this case**. The same steps can be run from a terminal:

```bash
pnpm -s script scripts/sync-case.ts          # read the matter from Clio
pnpm -s script scripts/index-documents.ts    # index its documents
pnpm -s script scripts/build-brief.ts        # write the brief and report how its evidence checked out
```

Quote highlighting in documents relies on desktop Chrome's built-in PDF viewer.

## What is not done

- **No sign-in on the firm's side.** Anyone who can reach the app can read the case, so it is meant to
  be run locally or behind the firm's own access control. The provider's page is the only part built
  to be opened by someone outside the firm.
- **Quotes from scanned pages are checked against the page index,** not against the image, because a
  scan has no text to compare with. The page opens at the right place but the passage is not marked.
- A provider's reply, and any file they attach, is stored in our database and storage and shown to
  the firm. It is not written back to Clio, by the rules of the hackathon.
- "Reading as" attorney or case manager changes the order of a case's parts, not what anyone may
  see. The one enforced boundary is between the firm and a provider.
- The settlement breakdown is an illustration: the fee percentage is typed by the attorney because
  the file holds no fee agreement, and provider charges are what was billed, not balances owed.
- A drafted follow-up is copied by the user into their own email; the app sends nothing.
- The provider is not notified when an update changes; they see it the next time they open the link.
