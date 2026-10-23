-- Semester Desk v2 — initial schema.
--
-- Run this once against a fresh Supabase project (SQL editor, or
-- `supabase db push`). Row-level security is enabled on every table in the
-- same migration that creates it: there is never a window in which a table
-- exists without a policy.
--
-- Every table carries the same four columns the sync engine relies on:
--   id          uuid primary key, generated on the client
--   user_id     owner; the only thing RLS checks
--   updated_at  last-write-wins clock, and the pull cursor
--   deleted_at  soft delete, so a tombstone can travel between devices

create extension if not exists "pgcrypto";

-- ── helper: stamp updated_at on every write ────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = greatest(now(), old.updated_at + interval '1 microsecond');
  return new;
end $$;

-- ── the tables ─────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  name text default '',
  institution text default '',
  timezone text default 'Asia/Kolkata',
  term_start date,
  term_end date,
  grading_scheme text default 'cgpa10',
  grade_bands jsonb default '[]'::jsonb,
  attendance_threshold numeric default 0.75,
  daily_capacity_min int default 180,
  quiet_hours jsonb default '["22:30","07:00"]'::jsonb,
  theme text default 'system',
  onboarded boolean default false
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  code text not null,
  name text default '',
  credits numeric default 3,
  colour text default '#3358CC',
  instructor text default '',
  target_grade numeric default 80,
  attendance_threshold numeric default 0.75,
  archived boolean default false
);

create table if not exists public.timetable_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  course_id uuid,
  weekday int not null check (weekday between 0 and 6),
  start text not null,
  "end" text not null,
  room text default '',
  kind text default 'lecture'
);

create table if not exists public.timetable_exceptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  slot_id uuid,
  date date not null,
  kind text not null,
  new_start text,
  new_end text,
  note text default ''
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  course_id uuid,
  slot_id uuid,
  date date not null,
  status text not null
);

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  course_id uuid,
  title text not null,
  weight_pct numeric default 0,
  score numeric,
  max numeric default 100,
  date date
);

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  course_id uuid,
  name text not null,
  order_index int default 0,
  confidence int default 0 check (confidence between 0 and 3),
  est_minutes int default 60,
  exam_critical boolean default false
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  course_id uuid,
  title text not null,
  type text default 'assignment',
  due_at timestamptz,
  weight_pct numeric default 0,
  est_minutes int default 60,
  status text default 'todo',
  notes text default ''
);

create table if not exists public.subtasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  task_id uuid,
  title text not null,
  done boolean default false,
  order_index int default 0
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  parent_type text not null,
  parent_id uuid,
  name text default '',
  storage_path text default '',
  kind text default '',
  size bigint default 0
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  course_id uuid,
  topic_id uuid,
  task_id uuid,
  date date not null,
  kind text default 'study',
  planned_min int default 0,
  actual_min int default 0,
  status text default 'planned',
  auto boolean default false
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  course_id uuid,
  topic_id uuid,
  front text not null,
  back text not null,
  ease numeric default 2.5,
  interval int default 0,
  reps int default 0,
  due_at timestamptz default now(),
  lapses int default 0,
  suspended boolean default false,
  is_formula boolean default false
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  card_id uuid,
  at timestamptz not null default now(),
  grade int not null,
  prev_interval int default 0,
  next_interval int default 0
);

create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  course_id uuid,
  task_id uuid,
  started timestamptz not null default now(),
  ended timestamptz,
  minutes int default 0,
  interruptions int default 0
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  course_id uuid,
  topic_id uuid,
  title text default '',
  body_md text default '',
  pinned boolean default false
);

create table if not exists public.note_versions (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  note_id uuid,
  body_md text default '',
  at timestamptz not null default now(),
  source text default 'local'
);

-- Career and money: created now so phase 5 is a UI change, not a migration.

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  org text not null,
  role text default '',
  kind text default 'internship',
  stage text default 'sourced',
  deadline timestamptz,
  link text default '',
  note text default ''
);

create table if not exists public.application_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  application_id uuid,
  at timestamptz default now(),
  kind text default '',
  note text default ''
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  name text not null,
  org text default '',
  email text default '',
  last_touch timestamptz,
  follow_up_at timestamptz,
  note text default ''
);

create table if not exists public.resume_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  kind text default 'experience',
  title text default '',
  org text default '',
  start date,
  "end" date,
  bullets jsonb default '[]'::jsonb
);

create table if not exists public.resume_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  name text default '',
  item_ids jsonb default '[]'::jsonb,
  target_role text default ''
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  at timestamptz not null default now(),
  amount numeric not null,
  category text default '',
  method text default 'upi',
  note text default ''
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  month text not null,
  category text not null,
  limit_amount numeric default 0
);

create table if not exists public.recurring (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  name text not null,
  amount numeric default 0,
  cadence text default 'monthly',
  next_at timestamptz
);

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  name text not null,
  cadence text default 'daily',
  target numeric default 1,
  colour text default '#3358CC'
);

create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  habit_id uuid,
  date date not null,
  value numeric default 1
);

create table if not exists public.ai_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  course_id uuid,
  title text default '',
  task_type text default 'tutor'
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  thread_id uuid,
  role text not null,
  content text default '',
  tokens_in int default 0,
  tokens_out int default 0,
  cost_inr numeric default 0
);

create table if not exists public.notification_prefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  channel text not null,
  enabled boolean default true,
  config jsonb default '{}'::jsonb
);

-- ── RLS + indexes + touch trigger, applied uniformly ───────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','courses','timetable_slots','timetable_exceptions','attendance',
    'assessments','topics','tasks','subtasks','attachments','sessions','cards',
    'reviews','focus_sessions','notes','note_versions','applications',
    'application_events','contacts','resume_items','resume_versions',
    'transactions','budgets','recurring','habits','habit_logs','ai_threads',
    'ai_messages','notification_prefs'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);

    -- drop-then-create so the whole migration can be re-run safely; Postgres
    -- has no CREATE POLICY IF NOT EXISTS
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format($f$
      create policy %I on public.%I
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id)
    $f$, t || '_owner', t);

    -- the sync pull is always "rows for me changed since a cursor"
    execute format('create index if not exists %I on public.%I (user_id, updated_at)',
                   t || '_user_updated_idx', t);

    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format($f$
      create trigger %I before update on public.%I
      for each row execute function public.touch_updated_at()
    $f$, t || '_touch', t);
  end loop;
end $$;
