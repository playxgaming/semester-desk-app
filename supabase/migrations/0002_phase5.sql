-- Phase 5 — career and money.
--
-- The tables themselves already exist from 0001; what phase 5 added is the
-- document tracking on an application: which CV you actually sent, where the
-- SOP stands, and whether the recommendation has landed. Run this after 0001.

alter table public.applications
  add column if not exists resume_version_id uuid,
  add column if not exists sop_status text not null default 'none',
  add column if not exists lor_status text not null default 'none';

alter table public.applications
  drop constraint if exists applications_sop_status_check,
  add constraint applications_sop_status_check
    check (sop_status in ('none', 'draft', 'sent'));

alter table public.applications
  drop constraint if exists applications_lor_status_check,
  add constraint applications_lor_status_check
    check (lor_status in ('none', 'requested', 'received'));

-- attachments can now hang off an application too
comment on column public.attachments.parent_type is
  'one of: task, note, course, application';

-- the two queries phase 5 actually runs: the pipeline board, and this
-- month's transactions by category
create index if not exists applications_stage_idx
  on public.applications (user_id, stage, deadline);

create index if not exists transactions_month_idx
  on public.transactions (user_id, at desc, category);

create index if not exists habit_logs_habit_date_idx
  on public.habit_logs (user_id, habit_id, date);
