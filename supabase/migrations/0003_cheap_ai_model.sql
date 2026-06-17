-- ============================================================================
-- Two-tier AI model routing: a cheaper model for non-writing features.
-- The premium model stays in default_ai_model (CV + cover letter writing);
-- this column powers summaries, briefs, interview prep, form answers, scraping.
-- ============================================================================
alter table public.admin_settings
  add column if not exists cheap_ai_model text not null
  default 'claude-sonnet-4-6';
