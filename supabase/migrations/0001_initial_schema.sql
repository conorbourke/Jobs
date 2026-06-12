-- ============================================================================
-- jobplatform — initial schema
-- Multi-tenant from day one. Every user-owned table carries user_id and is
-- protected by RLS. No user can ever read another user's rows.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper: is the current user a superadmin?
-- SECURITY DEFINER so it can read profiles without tripping profiles' own RLS.
-- ----------------------------------------------------------------------------
create or replace function public.is_superadmin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'superadmin'
  );
$$;

-- ----------------------------------------------------------------------------
-- profiles — extends auth.users
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  role text not null default 'user' check (role in ('user', 'superadmin')),
  plan text not null default 'free' check (plan in ('free', 'trial', 'paid')),
  trial_ends_at timestamptz,
  fees_waived boolean not null default false,
  stripe_customer_id text,
  notification_email text,
  openai_api_key_encrypted text, -- future: per-user OpenAI key (AES-GCM, server-side)
  settings jsonb not null default '{}'::jsonb,
  deactivated boolean not null default false,
  ai_notice_dismissed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: select own or superadmin"
  on public.profiles for select
  using (id = auth.uid() or public.is_superadmin());

create policy "profiles: update own or superadmin"
  on public.profiles for update
  using (id = auth.uid() or public.is_superadmin());

-- No insert/delete policies: rows are created by trigger and deleted by
-- cascade from auth.users (service role bypasses RLS).

-- Prevent privilege/plan escalation: regular users may not change protected
-- columns on their own profile. Superadmins (and the service role) may.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_superadmin() then
    new.role := old.role;
    new.plan := old.plan;
    new.trial_ends_at := old.trial_ends_at;
    new.fees_waived := old.fees_waived;
    new.stripe_customer_id := old.stripe_customer_id;
    new.deactivated := old.deactivated;
  end if;
  return new;
end;
$$;

create trigger protect_profile_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- Auto-create a profile on sign-up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, notification_email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- companies — keyed by fixed UUID, never by name.
-- ----------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  recruitment_url text,
  tier text not null default 'secondary' check (tier in ('primary', 'secondary')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Warn on duplicate import: names unique per user case-insensitively.
create unique index companies_user_name_unique
  on public.companies (user_id, lower(name));
create index companies_user_idx on public.companies (user_id, tier, sort_order);

alter table public.companies enable row level security;
create policy "companies: own rows" on public.companies
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- roles_of_interest — capped per user (cap lives in admin_settings,
-- enforced server-side in the API layer).
-- ----------------------------------------------------------------------------
create table public.roles_of_interest (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index roles_of_interest_user_idx on public.roles_of_interest (user_id, sort_order);

alter table public.roles_of_interest enable row level security;
create policy "roles_of_interest: own rows" on public.roles_of_interest
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- applications
-- ----------------------------------------------------------------------------
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  job_title text not null default '',
  salary_text text,
  location text,
  status text not null default 'draft'
    check (status in ('draft', 'applied', 'screening_call', 'in_person', 'next_scheduled', 'rejected')),
  application_type text not null default 'email'
    check (application_type in ('email', 'web_form')),
  source text not null default 'manual'
    check (source in ('suggested', 'application_form', 'manual')),
  notes text,
  date_added date not null default current_date,
  date_submitted date,
  job_description_text text,
  job_url text,
  attach_portfolio boolean not null default false,
  ai_summary text, -- cached AI summary of the email thread, refreshed on paste
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index applications_user_idx on public.applications (user_id, status);
create index applications_company_idx on public.applications (company_id);

alter table public.applications enable row level security;
create policy "applications: own rows" on public.applications
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- application_emails — pasted correspondence, newest rendered on top.
-- ----------------------------------------------------------------------------
create table public.application_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  direction text not null check (direction in ('from_me', 'from_company')),
  body_text text not null,
  pasted_at timestamptz not null default now()
);

create index application_emails_app_idx on public.application_emails (application_id, pasted_at desc);

alter table public.application_emails enable row level security;
create policy "application_emails: own rows" on public.application_emails
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- interviews
-- ----------------------------------------------------------------------------
create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  scheduled_at timestamptz not null,
  location_text text,
  type text, -- e.g. phone / video / in person
  ics_sent_at timestamptz,
  briefs_generated boolean not null default false,
  created_at timestamptz not null default now()
);

create index interviews_app_idx on public.interviews (application_id, scheduled_at);
create index interviews_user_upcoming_idx on public.interviews (user_id, scheduled_at);

alter table public.interviews enable row level security;
create policy "interviews: own rows" on public.interviews
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- cv_templates — exactly one master per user; role templates derive from it.
-- `content` is the structured CV schema (see src/lib/cv-schema.ts).
-- ----------------------------------------------------------------------------
create table public.cv_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  is_master boolean not null default false,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index cv_templates_one_master_per_user
  on public.cv_templates (user_id) where is_master;
create index cv_templates_user_idx on public.cv_templates (user_id, created_at);

alter table public.cv_templates enable row level security;
create policy "cv_templates: own rows" on public.cv_templates
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- cover_templates — one per user. Merge fields: {{name}} {{company}} {{role}} {{date}}.
-- ----------------------------------------------------------------------------
create table public.cover_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  body text not null default '',
  signature_image_path text, -- Supabase Storage path (jpg/png)
  updated_at timestamptz not null default now()
);

alter table public.cover_templates enable row level security;
create policy "cover_templates: own rows" on public.cover_templates
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- generated_documents — versioned, never overwritten.
-- ----------------------------------------------------------------------------
create table public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  type text not null check (type in
    ('cv', 'cover_letter', 'company_brief', 'interview_prep', 'completed_form_pdf', 'completed_form_docx')),
  version integer not null default 1,
  storage_path text not null,
  generation_notes text, -- user's regeneration comments
  meta jsonb not null default '{}'::jsonb, -- email subject/body for cv+cover runs, etc.
  created_at timestamptz not null default now(),
  unique (application_id, type, version)
);

create index generated_documents_app_idx on public.generated_documents (application_id, type, version desc);

alter table public.generated_documents enable row level security;
create policy "generated_documents: own rows" on public.generated_documents
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- form_submissions — application form completion runs.
-- ----------------------------------------------------------------------------
create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  input_method text not null check (input_method in ('url', 'pasted_questions', 'file_upload')),
  original_file_path text,
  questions jsonb not null default '[]'::jsonb, -- [{id, question, confidence}]
  answers jsonb not null default '[]'::jsonb,   -- [{id, answer, confidence, edited}]
  verification jsonb not null default '{}'::jsonb, -- page counts, structure checks
  output_paths jsonb not null default '{}'::jsonb, -- {pdf, docx}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index form_submissions_app_idx on public.form_submissions (application_id, created_at desc);

alter table public.form_submissions enable row level security;
create policy "form_submissions: own rows" on public.form_submissions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- ai_usage_log — powers Dashboard AI usage. Insert-only for users.
-- ----------------------------------------------------------------------------
create table public.ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null, -- e.g. cv_generation, email_summary, form_answers
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_estimate numeric(10, 6) not null default 0,
  created_at timestamptz not null default now()
);

create index ai_usage_log_user_idx on public.ai_usage_log (user_id, created_at desc);

alter table public.ai_usage_log enable row level security;
create policy "ai_usage_log: select own or superadmin" on public.ai_usage_log
  for select using (user_id = auth.uid() or public.is_superadmin());
create policy "ai_usage_log: insert own" on public.ai_usage_log
  for insert with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- admin_settings — singleton row (id = 1). All caps/pricing/limits live here;
-- nothing is hardcoded in the app.
-- ----------------------------------------------------------------------------
create table public.admin_settings (
  id integer primary key default 1 check (id = 1),
  price_monthly_gbp numeric(8, 2) not null default 5.00,
  trial_days integer not null default 14,
  max_companies integer not null default 500,
  max_roles integer not null default 50,
  max_cv_templates integer not null default 10,
  default_ai_model text not null default 'gpt-5',
  ai_monthly_generation_limit integer, -- null = unlimited
  donation_url text not null default 'https://buymeacoffee.com/',
  signup_open boolean not null default true,
  billing_enabled boolean not null default false,
  -- price per 1M tokens used for cost estimates, keyed by model
  model_prices jsonb not null default '{"gpt-5": {"input": 10, "output": 30}}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.admin_settings (id) values (1);

alter table public.admin_settings enable row level security;
create policy "admin_settings: readable by authenticated" on public.admin_settings
  for select using (auth.role() = 'authenticated');
create policy "admin_settings: superadmin update" on public.admin_settings
  for update using (public.is_superadmin());

-- ----------------------------------------------------------------------------
-- feature_requests
-- ----------------------------------------------------------------------------
create table public.feature_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.feature_requests enable row level security;
create policy "feature_requests: insert own" on public.feature_requests
  for insert with check (user_id = auth.uid());
create policy "feature_requests: select own or superadmin" on public.feature_requests
  for select using (user_id = auth.uid() or public.is_superadmin());

-- ----------------------------------------------------------------------------
-- updated_at maintenance
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.applications
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.cv_templates
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.cover_templates
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.form_submissions
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.admin_settings
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Storage buckets. All private; objects are namespaced by user id:
--   <bucket>/<user_id>/...  — policies enforce the first path segment.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('signatures', 'signatures', false),
  ('uploads', 'uploads', false),
  ('generated', 'generated', false)
on conflict (id) do nothing;

create policy "storage: users manage own folder"
  on storage.objects for all
  using (
    bucket_id in ('signatures', 'uploads', 'generated')
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id in ('signatures', 'uploads', 'generated')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
