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
  manual_locked boolean not null default false,
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

create table if not exists tag_dictionary_state (
  owner_id uuid primary key,
  status text not null default 'idle',
  next_run_at timestamptz,
  last_merged_at timestamptz,
  model text,
  prompt_version text,
  error_message text,
  updated_at timestamptz not null default now()
);

create index if not exists tag_dictionary_state_status_idx
  on tag_dictionary_state (status);

alter table tag_dictionary_state
  add column if not exists error_message text;

create table if not exists domain_tag_aggregates (
  owner_id uuid not null,
  domain text not null,
  tag_label text not null,
  tag_count integer not null,
  assignment_count integer not null,
  sample_count integer,
  generated_at timestamptz not null,
  model text,
  prompt_version text,
  updated_at timestamptz not null default now(),
  primary key (owner_id, domain, tag_label)
);

create index if not exists domain_tag_aggregates_owner_domain_idx
  on domain_tag_aggregates (owner_id, domain);

create table if not exists ability_dictionary (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  label text not null,
  normalized_label text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ability_dictionary_owner_idx
  on ability_dictionary (owner_id);

create table if not exists tag_ability_map (
  owner_id uuid not null,
  tag_id uuid not null,
  ability_id uuid not null,
  confidence real,
  source text not null default 'ai',
  updated_at timestamptz not null default now(),
  primary key (owner_id, tag_id, ability_id)
);

create index if not exists tag_ability_map_owner_idx
  on tag_ability_map (owner_id);

create index if not exists tag_ability_map_tag_idx
  on tag_ability_map (tag_id);

create table if not exists ability_aggregates (
  owner_id uuid not null,
  ability_id uuid not null,
  total_count integer not null,
  assignment_count integer not null,
  domain_count integer not null,
  generated_at timestamptz not null,
  model text,
  prompt_version text,
  updated_at timestamptz not null default now(),
  primary key (owner_id, ability_id)
);

create index if not exists ability_aggregates_owner_idx
  on ability_aggregates (owner_id);
