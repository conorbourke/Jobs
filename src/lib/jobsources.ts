/**
 * Job-board discovery via official APIs that permit programmatic access
 * (Adzuna, Reed). The LinkedIn/Indeed/jobs.ie HTML-scrape sources live in
 * scrapesources.ts. Each source is optional: if its API keys aren't configured
 * it's silently skipped, so the feature degrades to whatever's available.
 *
 * Keys (Cloudflare secrets / env — NOT committed):
 *   ADZUNA_APP_ID, ADZUNA_APP_KEY   (free: https://developer.adzuna.com)
 *   REED_API_KEY                    (free: https://www.reed.co.uk/developers)
 */

export interface RawJob {
  source: string;
  external_id: string;
  title: string;
  company_name: string | null;
  location: string | null;
  salary_text: string | null;
  url: string | null;
  description: string | null;
  posted_at: string | null;
}

export interface SourceQuery {
  keywords: string[]; // role keywords, e.g. ["operations manager", "events manager"]
  locations: string[]; // free-text places, e.g. ["Dublin", "Belfast", "London"]
  countries?: string[]; // Adzuna country codes, default ["gb", "ie"]
  perQuery?: number; // results per keyword/location combo (default 20)
}

function money(min?: number | null, max?: number | null, symbol = "£"): string | null {
  const f = (n: number) => `${symbol}${Math.round(n).toLocaleString("en-GB")}`;
  if (min && max) return min === max ? f(min) : `${f(min)} – ${f(max)}`;
  if (min) return `From ${f(min)}`;
  if (max) return `Up to ${f(max)}`;
  return null;
}

/** Adzuna — covers GB, IE and more, with structured salary + descriptions. */
export async function fetchAdzunaJobs(q: SourceQuery): Promise<RawJob[]> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) return [];

  const countries = q.countries?.length ? q.countries : ["gb", "ie"];
  const perQuery = q.perQuery ?? 20;
  const out: RawJob[] = [];

  for (const country of countries) {
    const symbol = country === "ie" ? "€" : "£";
    for (const what of q.keywords) {
      for (const where of q.locations.length ? q.locations : [""]) {
        const params = new URLSearchParams({
          app_id: appId,
          app_key: appKey,
          results_per_page: String(perQuery),
          what: what,
          "content-type": "application/json",
          max_days_old: "14",
          sort_by: "date",
        });
        if (where) params.set("where", where);
        const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params}`;
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
          if (!res.ok) continue;
          const json = (await res.json()) as {
            results?: Array<{
              id?: string | number;
              title?: string;
              company?: { display_name?: string };
              location?: { display_name?: string };
              description?: string;
              redirect_url?: string;
              salary_min?: number;
              salary_max?: number;
              created?: string;
            }>;
          };
          for (const r of json.results ?? []) {
            if (!r.id || !r.title) continue;
            out.push({
              source: "adzuna",
              external_id: String(r.id),
              title: r.title,
              company_name: r.company?.display_name ?? null,
              location: r.location?.display_name ?? null,
              salary_text: money(r.salary_min, r.salary_max, symbol),
              url: r.redirect_url ?? null,
              description: r.description ?? null,
              posted_at: r.created ?? null,
            });
          }
        } catch {
          // skip this query on network/parse error
        }
      }
    }
  }
  return out;
}

/** Reed (UK) — Basic auth with the API key as the username, empty password. */
export async function fetchReedJobs(q: SourceQuery): Promise<RawJob[]> {
  const key = process.env.REED_API_KEY;
  if (!key) return [];

  const perQuery = q.perQuery ?? 20;
  const auth = "Basic " + Buffer.from(`${key}:`).toString("base64");
  const out: RawJob[] = [];

  for (const keywords of q.keywords) {
    for (const locationName of q.locations.length ? q.locations : [""]) {
      const params = new URLSearchParams({
        keywords,
        resultsToTake: String(perQuery),
      });
      if (locationName) params.set("locationName", locationName);
      const url = `https://www.reed.co.uk/api/1.0/search?${params}`;
      try {
        const res = await fetch(url, {
          headers: { Authorization: auth },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) continue;
        const json = (await res.json()) as {
          results?: Array<{
            jobId?: number;
            jobTitle?: string;
            employerName?: string;
            locationName?: string;
            minimumSalary?: number;
            maximumSalary?: number;
            jobUrl?: string;
            jobDescription?: string;
            date?: string;
          }>;
        };
        for (const r of json.results ?? []) {
          if (!r.jobId || !r.jobTitle) continue;
          out.push({
            source: "reed",
            external_id: String(r.jobId),
            title: r.jobTitle,
            company_name: r.employerName ?? null,
            location: r.locationName ?? null,
            salary_text: money(r.minimumSalary, r.maximumSalary, "£"),
            url: r.jobUrl ?? null,
            description: r.jobDescription ?? null,
            posted_at: r.date ?? null,
          });
        }
      } catch {
        // skip
      }
    }
  }
  return out;
}

/** True when at least one source is available (API keys, or Browser Rendering
 * for the LinkedIn/Indeed/jobs.ie scrape sources). */
export function anySourceConfigured(): boolean {
  return Boolean(
    (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY) ||
      process.env.REED_API_KEY ||
      process.env.CLOUDFLARE_API_TOKEN
  );
}

/** Fetch from every configured source and dedupe within this batch. */
export async function fetchAllSources(q: SourceQuery): Promise<RawJob[]> {
  const batches = await Promise.all([fetchAdzunaJobs(q), fetchReedJobs(q)]);
  const seen = new Set<string>();
  const merged: RawJob[] = [];
  for (const job of batches.flat()) {
    const key = `${job.source}:${job.external_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(job);
  }
  return merged;
}
