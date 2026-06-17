# jobplatform

A job application admin system: one tracker for every application, AI-tailored
CVs and cover letters from your master template, company/interview brief PDFs,
calendar invites when interviews are scheduled, and AI completion of
application forms that preserves the original layout.

Multi-tenant from day one (Supabase RLS isolates every user), free with a
donation link, with the data model ready for a future £5/month plan.

> **Renaming:** the app name is a single constant in `src/config.ts`
> (`APP_NAME`) plus the worker name in `wrangler.jsonc`. Change those two when
> the real domain is purchased.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router, TypeScript) |
| Hosting | Cloudflare Workers via **`@opennextjs/cloudflare`** |
| DB / Auth | Supabase (Postgres + RLS, email/password auth only) |
| Storage | Supabase Storage (`signatures`, `uploads`, `generated` buckets) |
| Email | Resend (.ics invites, verification, reset) |
| AI | Anthropic (Claude) API — server-side only, platform key |
| PDFs | Cloudflare **Browser Rendering REST API** (HTML/CSS → PDF) |

### Why `@opennextjs/cloudflare` (not `@cloudflare/next-on-pages`)

`@cloudflare/next-on-pages` is in maintenance mode and limited to the edge
runtime. The OpenNext Cloudflare adapter is the path Cloudflare itself now
recommends: it runs the full Node.js runtime on Workers (`nodejs_compat`),
supports the App Router features this app uses (route handlers with Node
APIs, `Buffer`, streaming), and deploys to Workers with static assets — the
successor to the Pages model.

### Why the Browser Rendering REST API for PDFs

Puppeteer cannot run inside Pages/Workers. Requirements: render real HTML/CSS
(that is what guarantees an AI-tailored CV is pixel-identical in layout to its
template — the AI fills a structured schema and the same HTML template renders
both), and be callable from a Worker. The Browser Rendering REST API
(`POST /accounts/:id/browser-rendering/pdf`) does exactly that with a plain
`fetch`, works identically in local dev and production, and needs no binding.

**Constraints:** it's an external HTTP call (≈1–3 s per document), subject to
Cloudflare account rate limits, and requires `CLOUDFLARE_ACCOUNT_ID` +
`CLOUDFLARE_API_TOKEN` (Browser Rendering permission). All document types
(CV, cover letter, company brief, interview prep, completed-form Q&A) go
through the one render service in `src/lib/pdf/render.ts`.

**docx → PDF caveat:** completed Word forms are returned as `.docx` with the
original layout preserved (XML-level edits, never restructured). The PDF
twin is rendered from an HTML conversion (mammoth) of the completed docx, so
its layout is a close approximation — the `.docx` is the canonical
layout-preserving artifact. True docx→PDF fidelity would need a LibreOffice
service, which cannot run on Workers.

## Setup

### 1. Supabase

1. Create a project in an **EU region** (GDPR requirement).
2. Run the migrations in order against the project
   (`supabase db push`, or paste `supabase/migrations/*.sql` into the SQL editor).
   They create all tables, RLS policies, cap-enforcement triggers and the
   three private storage buckets.
3. Auth → Providers: keep **Email** only; enable "Confirm email".
4. Auth → URL configuration: set site URL and add
   `https://<your-domain>/auth/confirm` to redirect URLs.
5. Copy the project URL, anon key and service-role key into env vars.

### 2. Environment

Copy `.env.example` → `.env.local` for dev. For production set the same
values as Worker secrets/vars (see comments in `wrangler.jsonc`):

```sh
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put RESEND_API_KEY
wrangler secret put CLOUDFLARE_API_TOKEN
wrangler secret put ENCRYPTION_KEY   # openssl rand -base64 32
```

### 3. Run / deploy

```sh
npm run dev      # local dev
npm run preview  # build + run in workerd locally
npm run deploy   # build + deploy to Cloudflare Workers
```

### 4. Make yourself superadmin

```sql
update public.profiles set role = 'superadmin' where id = '<your-user-uuid>';
```

After that the Users and Admin Settings tabs appear, and further role changes
can be made from the UI.

## Architecture notes

- **AI service layer** (`src/lib/ai.ts`): all calls server-side. If a user
  has `openai_api_key_encrypted` set (legacy column name; holds an Anthropic
  key), their key is used; otherwise the platform `ANTHROPIC_API_KEY`. The
  default model is `claude-opus-4-8` (changeable in Admin Settings). The
  fallback logic ships now; the Settings UI
  for user keys is a later phase. Every call logs feature/model/tokens/cost
  to `ai_usage_log` and respects `admin_settings.ai_monthly_generation_limit`.
- **Caps** (max companies/roles/CV templates) live in `admin_settings` and
  are enforced by DB triggers — unbypassable regardless of client.
- **Companies are keyed by UUID** everywhere. Imports match existing rows by
  name and update them in place so IDs (and application counts) survive
  re-imports. Duplicate names per user are blocked by a unique index.
- **Versioning:** every generated document is a new row/version in
  `generated_documents`; nothing is ever overwritten.
- **GDPR:** see `GDPR.md`. Delete account and data export are fully
  functional (`/api/account/delete`, `/api/account/export`).
- **Billing-ready:** `profiles.plan/trial_ends_at/fees_waived/stripe_customer_id`
  and `admin_settings.billing_enabled` (default off) exist now; Stripe
  integration is a later phase. No billing UI shows while the flag is off.

## Test checklist (per phase)

Phase 1 — foundation:
- [ ] Sign up → verification email → confirm → land on dashboard
- [ ] Password reset round-trip
- [ ] Second user cannot see first user's rows (RLS) — try any table with
      the anon key and the second user's JWT
- [ ] Settings: export zip downloads; delete account removes auth user,
      rows and storage objects
- [ ] Cookie banner shows once; privacy/terms pages render

Phase 2 — tracker:
- [ ] Sort order: app with soonest upcoming interview first, then
      in_person > screening_call > applied, then oldest applied first
- [ ] Rejected section collapsed at the very bottom, expandable
- [ ] Row click opens detail panel; all fields editable and persisted
- [ ] Pasting an email adds it to the thread (newest top) and refreshes the
      pinned AI summary
- [ ] Inline status dropdown works; applied stamps date_submitted

Phase 3 — templates & AI:
- [ ] Exactly one master CV; role templates inherit companies/dates/education
      (edit master → propagates to role templates)
- [ ] Generate CV & cover: PDF layout identical to template; portfolio
      tickbox controls mentions in BOTH cover letter and email
- [ ] Regenerate with comment produces a new version; old versions remain

Phase 4 — suggested jobs:
- [ ] Pasting a job URL creates a pre-filled draft; unparseable page still
      creates a blank draft (never blocks)
- [ ] Company list: counts join on company UUID; import in Settings updates
      existing companies in place (IDs preserved); drag reorder persists
- [ ] Mark submitted → appears in Tracker as applied

Phase 5 — scheduling:
- [ ] Scheduling generates brief + prep PDFs and emails a .ics that renders
      Gmail's add-to-calendar card, with both PDFs attached; ics_sent_at set
- [ ] Toggles in Settings disable briefs/invite independently

Phase 6 — forms:
- [ ] Each input route (URL / pasted / upload) extracts questions
- [ ] .docx round-trip: answers placed without restructuring; verification
      flags any altered question text; appendix for unmatched questions
- [ ] Per-question confidence + edit boxes; re-render uses edits
- [ ] Side-by-side preview displays original vs completed

Phase 7 — dashboard & admin:
- [ ] Applied counts (all time/month/week/today) and pipeline counts correct
- [ ] Weekly chart shows applications vs interviews; 7-day drop-off banner
- [ ] Superadmin-only Users/Admin Settings tabs; user actions work
- [ ] All caps/model/donation URL changes take effect without redeploy
