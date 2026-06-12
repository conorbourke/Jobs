/**
 * Single place to rename the app once the real domain is purchased.
 * Everything (UI, emails, PDFs, metadata) reads from here.
 */
export const APP_NAME = "jobplatform";
export const APP_TAGLINE = "Your job search, organised.";
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
export const SUPPORT_EMAIL = "support@example.com"; // update with real domain
