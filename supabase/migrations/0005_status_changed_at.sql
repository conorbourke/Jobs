-- ----------------------------------------------------------------------------
-- Track when an application's status was last changed, so the Tracker can show
-- the date of the most recent status change (distinct from date_added or a
-- general updated_at). Set by the app whenever the status changes.
-- ----------------------------------------------------------------------------
alter table public.applications
  add column if not exists status_changed_at timestamptz not null default now();

-- Backfill existing rows to a sensible value (submission date if applied,
-- otherwise the row's last-updated timestamp).
update public.applications
  set status_changed_at = coalesce(date_submitted::timestamptz, updated_at);
