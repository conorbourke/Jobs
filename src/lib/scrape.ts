import type { SupabaseClient } from "@supabase/supabase-js";
import { aiJson } from "./ai";

export interface ScrapedJob {
  job_title: string;
  company_name: string;
  location: string;
  salary_text: string;
  description: string;
}

/** Strip a fetched HTML page down to readable text (best effort). */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*/g, "\n\n")
    .trim();
}

/**
 * Best-effort job page scrape: fetch + text-strip + AI extraction.
 * Never throws for content problems — returns whatever could be parsed
 * (empty strings where nothing could).
 */
export async function scrapeJobUrl(
  supabase: SupabaseClient,
  userId: string,
  url: string
): Promise<Partial<ScrapedJob>> {
  let text = "";
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return {};
    text = htmlToText(await res.text()).slice(0, 24000);
  } catch {
    return {};
  }
  if (!text) return {};

  try {
    return await aiJson<ScrapedJob>({
      supabase,
      userId,
      feature: "job_url_scrape",
      system:
        'Extract job posting details from page text. Return JSON: {"job_title":string,"company_name":string,"location":string,"salary_text":string,"description":string}. description = the job description/requirements, cleaned up, max ~800 words. Use "" for anything not present. Never invent values.',
      user: `Page URL: ${url}\n\nPage text:\n${text}`,
    });
  } catch {
    return {};
  }
}

/**
 * Find-or-create a company for the user by name (case-insensitive match —
 * companies stay keyed by their fixed UUID).
 */
export async function matchOrCreateCompany(
  supabase: SupabaseClient,
  userId: string,
  companyName: string
): Promise<string | null> {
  const name = companyName.trim();
  if (!name) return null;
  const { data: existing } = await supabase
    .from("companies")
    .select("id")
    .ilike("name", name)
    .limit(1);
  if (existing && existing.length > 0) return existing[0].id;
  const { data: created } = await supabase
    .from("companies")
    .insert({ user_id: userId, name, tier: "secondary" })
    .select("id")
    .single();
  return created?.id ?? null;
}
