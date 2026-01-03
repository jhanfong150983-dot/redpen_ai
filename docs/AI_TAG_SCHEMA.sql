-- AI tag aggregation tables
-- Apply in Supabase SQL editor.

create table if not exists assignment_tag_state (
  owner_id uuid not null,
  assignment_id text not null,
  status text not null default 'idle',
  window_started_at timestamptz,
  last_event_at timestamptz,
  next_run_at timestamptz,
  last_generated_at timestamptz,
  sample_count integer,
  dirty boolean not null default false,
  model text,
  prompt_version text,
  updated_at timestamptz not null default now(),
  primary key (owner_id, assignment_id)
);

create index if not exists assignment_tag_state_status_idx
  on assignment_tag_state (status);

create table if not exists assignment_tag_aggregates (
  owner_id uuid not null,
  assignment_id text not null,
  tag_label text not null,
  tag_count integer not null,
  examples jsonb,
  generated_at timestamptz not null,
  model text,
  prompt_version text,
  updated_at timestamptz not null default now(),
  primary key (owner_id, assignment_id, tag_label)
);

create index if not exists assignment_tag_aggregates_assignment_idx
  on assignment_tag_aggregates (assignment_id);

create table if not exists tag_dictionary (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  label text not null,
  normalized_label text not null,
  status text not null default 'active',
  merged_to_tag_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tag_dictionary_owner_idx
  on tag_dictionary (owner_id);
