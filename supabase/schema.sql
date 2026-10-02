-- Everything Case Desk stores outside Clio. Paste once into the Supabase SQL editor.
-- Clio is only read; these tables hold what was read, what the models made of it, and what was shared.

-- The one Clio connection: tokens from the OAuth exchange.
create table if not exists clio_connection (
  id int primary key default 1 check (id = 1),
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

-- A case as last read from Clio: the CaseFile in src/features/cases/schema.ts.
create table if not exists case_files (
  matter_id bigint primary key,
  file jsonb not null,
  fingerprint text not null,          -- hash of every entry's Clio id and etag
  synced_at timestamptz not null default now()
);

-- What a model read on the pages of a document, one row per part of at most 25 pages.
create table if not exists document_digests (
  document_id bigint not null,
  version text not null,              -- Clio document version id, so a re-upload is read again
  from_page int not null default 1,
  digest jsonb not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  created_at timestamptz not null default now(),
  primary key (document_id, version, from_page)
);

-- The brief written for a case, kept per fingerprint so opening a case never calls a model.
create table if not exists briefs (
  matter_id bigint not null,
  fingerprint text not null,
  brief jsonb not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  created_at timestamptz not null default now(),
  primary key (matter_id, fingerprint)
);

-- When each reader opened a case, for "since you last opened".
create table if not exists visits (
  matter_id bigint not null,
  viewer text not null,
  opened_at timestamptz not null default now()
);
create index if not exists visits_latest on visits (matter_id, viewer, opened_at desc);

-- An update published to one provider. `payload` is all the provider's page can ever read.
create table if not exists shares (
  id uuid primary key default gen_random_uuid(),
  matter_id bigint not null,
  contact_ref text not null,          -- the provider's ref in the case file, e.g. P7
  contact_name text not null,
  token_hash text not null unique,    -- sha256 of the link token; the token itself is never stored
  draft jsonb,                        -- firm side: every drafted line with its switch and sources
  payload jsonb not null,             -- ProviderUpdate in src/features/shares/schema.ts
  created_at timestamptz not null default now(),
  published_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index if not exists shares_matter on shares (matter_id, contact_ref);

-- What happened to a share: the provider opened it, or replied to a request.
create table if not exists share_events (
  id bigint generated always as identity primary key,
  share_id uuid not null references shares (id) on delete cascade,
  kind text not null,                 -- 'opened' | 'replied'
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index if not exists share_events_share on share_events (share_id, at desc);

-- Row-level security with no policies: only the server's secret key can read or write.
alter table clio_connection enable row level security;
alter table case_files enable row level security;
alter table document_digests enable row level security;
alter table briefs enable row level security;
alter table visits enable row level security;
alter table shares enable row level security;
alter table share_events enable row level security;

notify pgrst, 'reload schema';

-- ---- Added 2026-10-02 afternoon: calls placed through Case Desk, and things worked out from a case ----

-- A call placed through Case Desk (Twilio). Its length is the real one Twilio reports.
create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  matter_id bigint not null,
  contact_ref text,                 -- the contact in the case file, when there is one
  contact_name text not null,
  to_number text not null,
  placed_by text not null,
  call_sid text unique,             -- Twilio's id; null for a call that was only logged
  status text not null default 'started',
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  seconds int,                      -- the real length, from Twilio
  transcript jsonb not null default '[]'::jsonb,
  summary text
);
create index if not exists calls_matter on calls (matter_id, started_at desc);

-- Things worked out from a case and kept, such as the date each stage began.
create table if not exists case_extras (
  matter_id bigint not null,
  kind text not null,
  fingerprint text not null,
  value jsonb not null,
  created_at timestamptz not null default now(),
  primary key (matter_id, kind)
);

alter table calls enable row level security;
alter table case_extras enable row level security;

notify pgrst, 'reload schema';
