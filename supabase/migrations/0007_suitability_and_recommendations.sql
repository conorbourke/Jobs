-- ----------------------------------------------------------------------------
-- Suitability indicator + daily recommended jobs.
--
-- 1. applications.suitability / suitability_reason — a low/medium/high match
--    signal shown on each New Job, scored against the candidate's master CV and
--    the roles they've already applied for.
-- 2. recommended_jobs — postings discovered daily from job-board APIs
--    (Adzuna, Reed, …), scored the same way. The user reviews them in the new
--    Recommended tab and adds the good ones to New Jobs (creating a draft).
-- ----------------------------------------------------------------------------

alter table public.applications
  add column if not exists suitability text
    check (suitability in ('low', 'medium', 'high')),
  add column if not exists suitability_reason text;

create table if not exists public.recommended_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  external_id text not null,
  title text not null,
  company_name text,
  location text,
  salary_text text,
  url text,
  description text,
  suitability text check (suitability in ('low', 'medium', 'high')),
  suitability_reason text,
  score int,
  posted_at timestamptz,
  status text not null default 'new'
    check (status in ('new', 'dismissed', 'added')),
  created_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);

create index if not exists recommended_jobs_user_status_idx
  on public.recommended_jobs (user_id, status, score desc nulls last);

alter table public.recommended_jobs enable row level security;
drop policy if exists "recommended_jobs: own rows" on public.recommended_jobs;
create policy "recommended_jobs: own rows" on public.recommended_jobs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
