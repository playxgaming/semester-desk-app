-- Optional sync: preserve Tutor turn order when timestamps coincide.
alter table public.ai_messages
  add column if not exists sequence integer check (sequence >= 0);
