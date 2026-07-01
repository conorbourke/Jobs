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

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Fetch a page's readable text, best-effort. Prefers Cloudflare Browser
 * Rendering (a real headless browser that runs JavaScript and presents a
 * proper browser fingerprint) — it gets through JS-heavy job boards and many
 * bot walls a plain server fetch cannot. Falls back to a direct fetch when
 * Browser Rendering isn't configured or fails. Returns "" if nothing readable
 * could be retrieved.
 */
export async function fetchReadableText(url: string): Promise<string> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;

  if (accountId && token) {
    const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering`;
    const auth = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    // /markdown returns clean, already-stripped content — ideal for the model.
    try {
      const res = await fetch(`${base}/markdown`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) {
        const json = (await res.json()) as { result?: string };
        if (json.result?.trim()) return json.result.slice(0, 24000);
      }
    } catch {
      // fall through to /content
    }
    // /content returns fully-rendered HTML — strip it ourselves.
    try {
      const res = await fetch(`${base}/content`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) {
        const json = (await res.json()) as { result?: string };
        const text = htmlToText(json.result ?? "");
        if (text.trim()) return text.slice(0, 24000);
      }
    } catch {
      // fall through to plain fetch
    }
  }

  // Plain fetch fallback (works for simple, non-JS, non-walled pages).
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const text = htmlToText(await res.text());
      if (text.trim()) return text.slice(0, 24000);
    }
  } catch {
    // give up
  }
  return "";
}

/**
 * Best-effort job page scrape: fetch (a real browser where possible) + AI
 * reconstruction of the posting. Never throws for content problems — returns
 * whatever could be parsed (empty strings where nothing could).
 */
export async function scrapeJobUrl(
  supabase: SupabaseClient,
  userId: string,
  url: string
): Promise<Partial<ScrapedJob>> {
  const text = await fetchReadableText(url);
  if (!text) return {};

  try {
    return await aiJson<ScrapedJob>({
      supabase,
      userId,
      feature: "job_url_scrape",
      system:
        'You read the text/markdown of a job posting page and reconstruct the posting. Return JSON: {"job_title":string,"company_name":string,"location":string,"salary_text":string,"description":string}. "description" is a clean, faithful write-up of the role — what the company does, responsibilities, requirements and anything notable — in ~150-400 words, based only on the page. Ignore site navigation, cookie banners, and unrelated job listings. Use "" for any field genuinely not present. Never invent details that are not on the page.',
      user: `Page URL: ${url}\n\nPage content:\n${text}`,
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
