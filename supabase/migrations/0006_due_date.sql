-- ----------------------------------------------------------------------------
-- Application deadline (the date by which the application must be submitted).
-- Used to order drafts in New Jobs / Tracker: unknown (null) first, then
-- soonest deadline. Nullable — not every posting states one.
-- ----------------------------------------------------------------------------
alter table public.applications
  add column if not exists due_date date;
