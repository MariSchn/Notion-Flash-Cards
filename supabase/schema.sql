-- Notion Flashcards schema
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- projects
create table if not exists projects (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  icon            text,
  notion_page_id  text not null unique,
  notion_url      text not null,
  created_at      timestamptz not null default now(),
  last_synced_at  timestamptz
);

-- ---------------------------------------------------------------- sections
-- One row per heading (H1/H2/H3). `notion_block_id` is '__root__' for the
-- implicit section holding toggles that appear before any heading.
create table if not exists sections (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  notion_block_id text not null,
  title           text not null,
  level           smallint not null,
  parent_id       uuid references sections(id) on delete set null,
  position        integer not null,
  unique (project_id, notion_block_id)
);
create index if not exists sections_project_idx on sections(project_id);

-- ------------------------------------------------------------------- cards
-- `question` is a rich-text array, `answer` is a normalized block tree.
-- SRS state lives on the row and survives resyncs (matched by notion_block_id).
create table if not exists cards (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects(id) on delete cascade,
  section_id       uuid references sections(id) on delete set null,
  notion_block_id  text not null,
  question         jsonb not null,
  answer           jsonb not null,
  position         integer not null default 0,
  archived         boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  due_at           timestamptz not null default now(),
  interval_days    real not null default 0,
  ease             real not null default 2.5,
  repetitions      integer not null default 0,
  lapses           integer not null default 0,
  last_reviewed_at timestamptz,

  unique (project_id, notion_block_id)
);
create index if not exists cards_project_idx on cards(project_id) where archived = false;
create index if not exists cards_due_idx on cards(project_id, due_at) where archived = false;
create index if not exists cards_section_idx on cards(section_id);

-- ----------------------------------------------------------------- reviews
create table if not exists reviews (
  id            bigserial primary key,
  card_id       uuid not null references cards(id) on delete cascade,
  project_id    uuid not null references projects(id) on delete cascade,
  grade         smallint not null,
  prev_interval real,
  new_interval  real,
  reviewed_at   timestamptz not null default now()
);
create index if not exists reviews_card_idx on reviews(card_id);
create index if not exists reviews_project_time_idx on reviews(project_id, reviewed_at);

-- The app talks to Supabase with the service_role key from server-side route
-- handlers only, so RLS is enabled with no policies: nothing is reachable with
-- the anon key.
alter table projects enable row level security;
alter table sections enable row level security;
alter table cards    enable row level security;
alter table reviews  enable row level security;
