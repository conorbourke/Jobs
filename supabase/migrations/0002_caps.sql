-- ============================================================================
-- Server-side cap enforcement. Caps live in admin_settings (never hardcoded);
-- triggers make them impossible to bypass regardless of which client inserts.
-- ============================================================================

create or replace function public.enforce_row_caps()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap integer;
  current_count integer;
begin
  if tg_table_name = 'companies' then
    select max_companies into cap from public.admin_settings where id = 1;
    select count(*) into current_count from public.companies where user_id = new.user_id;
    if current_count >= cap then
      raise exception 'Company limit reached (max %)', cap;
    end if;
  elsif tg_table_name = 'roles_of_interest' then
    select max_roles into cap from public.admin_settings where id = 1;
    select count(*) into current_count from public.roles_of_interest where user_id = new.user_id;
    if current_count >= cap then
      raise exception 'Roles of interest limit reached (max %)', cap;
    end if;
  elsif tg_table_name = 'cv_templates' then
    select max_cv_templates into cap from public.admin_settings where id = 1;
    select count(*) into current_count from public.cv_templates where user_id = new.user_id;
    if current_count >= cap then
      raise exception 'CV template limit reached (max %)', cap;
    end if;
  end if;
  return new;
end;
$$;

create trigger enforce_company_cap before insert on public.companies
  for each row execute function public.enforce_row_caps();
create trigger enforce_roles_cap before insert on public.roles_of_interest
  for each row execute function public.enforce_row_caps();
create trigger enforce_cv_templates_cap before insert on public.cv_templates
  for each row execute function public.enforce_row_caps();
