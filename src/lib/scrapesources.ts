import type { SupabaseClient } from "@supabase/supabase-js";
import { aiJson } from "./ai";
import { fetchReadableText } from "./scrape";
import type { RawJob, SourceQuery } from "./jobsources";

/**
 * HTML-scrape job sources: LinkedIn, Indeed and jobs.ie. Unlike the API sources
 * (Adzuna/Reed) these have no official feed, so we fetch each search-results
 * page through Cloudflare Browser Rendering (a real headless browser — the best
 * chance of getting past JS walls and bot checks) and let the cheap model
 * extract the job list from whatever rendered.
 *
 * Reality check: LinkedIn and Indeed actively block automated access from
 * datacenter IPs and their ToS prohibits scraping. This is best-effort — a
 * blocked page simply yields zero jobs for that run rather than erroring.
 * jobs.ie is the most reliable of the three. Requires CLOUDFLARE_API_TOKEN
 * (Browser Rendering); if that's missing these sources are skipped.
 */

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** A stable per-posting id so re-runs dedupe correctly. */
function stableId(url: string | undefined, title: string, company: string): string {
  if (url) {
    try {
      const u = new URL(url);
      // LinkedIn/Indeed embed a long numeric job id in the path — best key.
      const m = u.pathname.match(/(\d{7,})/);
      if (m) return m[1];
      return (u.host + u.pathname).slice(0, 180);
    } catch {
      // fall through
    }
  }
  return `${norm(title)}-${norm(company)}`.slice(0, 180) || "unknown";
}

interface ExtractedItem {
  title?: string;
  company?: string;
  location?: string;
  url?: string;
  snippet?: string;
}

const EXTRACT_SYSTEM = `You are given the rendered text/markdown of a job-board SEARCH RESULTS page. Extract the individual job postings listed on it.

Return ONLY a JSON array, one object per posting, each:
{"title": string, "company": string, "location": string, "url": string, "snippet": string}

Rules:
- "url" must be the absolute link to that specific posting (resolve relative links against the given base URL).
- Ignore adverts, filters, navigation, "people also searched", saved-search prompts and cookie banners.
- Only include real, distinct job postings actually shown on this page. Never invent postings or fields — use "" when a field genuinely isn't shown.
- If the page shows no job postings (blocked, empty, a login wall), return [].`;

async function extractList(
  supabase: SupabaseClient,
  userId: string,
  source: string,
  baseUrl: string,
  pageText: string
): Promise<RawJob[]> {
  if (!pageText.trim()) return [];
  let items: ExtractedItem[];
  try {
    items = await aiJson<ExtractedItem[]>({
      supabase,
      userId,
      feature: "job_list_scrape",
      system: EXTRACT_SYSTEM,
      user: `Base URL: ${baseUrl}\n\nPage content:\n${pageText.slice(0, 22000)}`,
      maxOutputTokens: 2500,
    });
  } catch {
    return [];
  }
  if (!Array.isArray(items)) return [];

  const out: RawJob[] = [];
  for (const it of items) {
    const title = (it.title ?? "").trim();
    if (!title) continue;
    const company = (it.company ?? "").trim();
    const url = (it.url ?? "").trim() || null;
    out.push({
      source,
      external_id: stableId(url ?? undefined, title, company),
      title,
      company_name: company || null,
      location: (it.location ?? "").trim() || null,
      salary_text: null,
      url,
      description: (it.snippet ?? "").trim() || null,
      posted_at: null,
    });
  }
  return out;
}

// ---- Per-site search URL builders -----------------------------------------

function linkedinUrl(kw: string, loc: string): string {
  const p = new URLSearchParams({
    keywords: kw,
    location: loc,
    f_TPR: "r1209600", // posted in the last 14 days
    start: "0",
  });
  // Public guest endpoint — returns a job-card list without login.
  return `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${p}`;
}

function indeedUrl(kw: string, loc: string): string {
  const host = /(^|\W)(uk|england|scotland|wales|london)(\W|$)/i.test(loc)
    ? "uk.indeed.com"
    : "ie.indeed.com";
  const p = new URLSearchParams({ q: kw, l: loc, fromage: "14" });
  return `https://${host}/jobs?${p}`;
}

function jobsIeUrl(kw: string, loc: string): string {
  const p = new URLSearchParams({ keywords: kw, location: loc });
  return `https://www.jobs.ie/jobs?${p}`;
}

function niJobFinderUrl(kw: string, loc: string): string {
  // NIJobfinder — Northern Ireland board. Keyword + location search.
  const p = new URLSearchParams({ keywords: kw, location: loc });
  return `https://www.nijobfinder.co.uk/jobs/search?${p}`;
}

/** Run async workers over items with limited concurrency. */
async function pool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export interface ScrapeDiag {
  source: string;
  url: string;
  chars: number; // readable text retrieved (0 = blocked/empty)
  items: number; // postings the model extracted
  sample: string; // first slice of retrieved text, to eyeball what came back
}

/**
 * Diagnostic: fetch one search page per source and report what came back
 * (bytes retrieved + postings extracted + a text sample). Lets us tell a
 * blocked/empty fetch apart from an extraction miss or a wrong URL.
 */
export async function debugScrapeSources(
  supabase: SupabaseClient,
  userId: string,
  q: SourceQuery
): Promise<ScrapeDiag[]> {
  const kw = q.keywords[0] ?? "operations manager";
  const loc = q.locations[0] ?? "Dublin";
  const targets = [
    { source: "linkedin", url: linkedinUrl(kw, loc) },
    { source: "indeed", url: indeedUrl(kw, loc) },
    { source: "jobs.ie", url: jobsIeUrl(kw, loc) },
    { source: "nijobfinder", url: niJobFinderUrl(kw, loc) },
  ];
  const out: ScrapeDiag[] = [];
  for (const t of targets) {
    const text = await fetchReadableText(t.url);
    const jobs = await extractList(supabase, userId, t.source, t.url, text);
    out.push({
      source: t.source,
      url: t.url,
      chars: text.length,
      items: jobs.length,
      sample: text.slice(0, 300).replace(/\s+/g, " ").trim(),
    });
  }
  return out;
}

/**
 * Fetch + extract jobs from the HTML-scrape sources. Kept deliberately small
 * (top keywords/locations only) to stay within Browser Rendering rate limits
 * and the request time budget.
 */
export async function fetchScrapeSources(
  supabase: SupabaseClient,
  userId: string,
  q: SourceQuery
): Promise<RawJob[]> {
  if (!process.env.CLOUDFLARE_API_TOKEN) return [];

  const keywords = q.keywords.slice(0, 2);
  const locations = (q.locations.length ? q.locations : ["Ireland"]).slice(0, 2);

  const targets: { source: string; url: string }[] = [];
  for (const kw of keywords) {
    for (const loc of locations) {
      targets.push({ source: "linkedin", url: linkedinUrl(kw, loc) });
      targets.push({ source: "indeed", url: indeedUrl(kw, loc) });
      targets.push({ source: "jobs.ie", url: jobsIeUrl(kw, loc) });
      targets.push({ source: "nijobfinder", url: niJobFinderUrl(kw, loc) });
    }
  }

  // Small concurrency: Browser Rendering rate-limits parallel calls.
  const batches = await pool(targets, 3, async (t) => {
    const text = await fetchReadableText(t.url);
    return extractList(supabase, userId, t.source, t.url, text);
  });
  return batches.flat();
}
