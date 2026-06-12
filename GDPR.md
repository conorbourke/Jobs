# GDPR — Records of Processing (internal)

Operator: Conor Bourke. Scope: UK GDPR. Last reviewed: June 2026.

## What is stored, where, and why

| Data | Where | Purpose | Legal basis | Retention |
|---|---|---|---|---|
| Email, name, hashed password | Supabase Auth (EU region) | Account operation | Contract | Until account deletion |
| Profile (plan, settings, notification email) | Postgres `profiles` | Account operation | Contract | Until account deletion |
| Applications, companies, roles, interviews, pasted emails | Postgres (user tables) | Core service | Contract | Until account deletion |
| CV/cover templates, generated documents, uploaded forms, signature image | Supabase Storage (EU) | Document generation | Contract | Until account deletion |
| AI usage log (feature, model, token counts, cost estimate) | Postgres `ai_usage_log` | Usage display, fair-use limits | Legitimate interest | Until account deletion |
| Feature requests | Postgres `feature_requests` | Product improvement | Legitimate interest | Until account deletion |

No analytics, no tracking cookies. The only cookie is the Supabase auth
session cookie (strictly necessary).

## Processors

- **Supabase** (EU region) — database, auth, file storage.
- **Resend** — transactional email (verification, password reset, interview
  invites with .ics + PDFs). EU sending where available.
- **OpenAI** — AI generation. Only the content needed for the specific
  generation is sent (CV content, job description, pasted email text). API
  data is not used for training per OpenAI API terms.
- **Cloudflare** — hosting and HTML→PDF rendering (Browser Rendering API;
  document HTML transits Cloudflare during rendering).

## Rights implementation

- **Erasure**: Settings → Delete account → typed confirmation → 
  `POST /api/account/delete` removes all Storage objects then hard-deletes
  the auth user; all rows cascade via foreign keys. Immediate and
  irreversible.
- **Portability/access**: Settings → Download my data →
  `GET /api/account/export` returns a zip of JSON for every table plus all
  stored files.
- **Rectification**: all data is user-editable in-app.

## Data minimisation

Sign-up collects only email + chosen name. No additional personal data is
requested anywhere in the product.

## Breach process

Supabase/Cloudflare/Resend dashboards monitored; in case of a personal data
breach, assess scope, notify the ICO within 72 hours where required, and
notify affected users without undue delay.
