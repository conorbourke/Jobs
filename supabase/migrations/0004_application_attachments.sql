-- ----------------------------------------------------------------------------
-- application_attachments — supporting docs that accompany a job ad
-- (job description / personal specification PDFs or Word files). Up to 3 per
-- application (enforced in the API). Files live in the existing `uploads`
-- bucket under <user_id>/attachments/<application_id>/...; extracted_text is
-- folded into the AI job context for CV/cover/brief generation.
-- ----------------------------------------------------------------------------
create table public.application_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  storage_path text not null,
  filename text not null,
  extracted_text text,
  created_at timestamptz not null default now()
);

create index application_attachments_app_idx on public.application_attachments (application_id);

alter table public.application_attachments enable row level security;
create policy "application_attachments: own rows" on public.application_attachments
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
