/**
 * Single place to rename the app once the real domain is purchased.
 * Everything (UI, emails, PDFs, metadata) reads from here.
 */
export const APP_NAME = "jobplatform";
export const APP_TAGLINE = "Your job search, organised.";
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
export const SUPPORT_EMAIL = "support@example.com"; // update with real domain

/**
 * Public Supabase config. These are PUBLIC values — the publishable/anon key
 * is exposed to the browser by design, and Row Level Security protects data.
 * Committed as build fallbacks so the deploy works without relying on
 * build-time env vars (NEXT_PUBLIC_* are inlined at build, which is brittle on
 * hosted CI). If the env vars are set, they take precedence.
 */
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://isjfyizrguzpanumospy.supabase.co";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_WwL-v6diq02uho6mR0vf8A_wR9qrPPX";
