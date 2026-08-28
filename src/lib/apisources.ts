import { htmlToText } from "./scrape";
import type { RawJob, SourceQuery } from "./jobsources";

/**
 * Free, keyless job APIs that respond to server-side requests (unlike
 * LinkedIn/Indeed, which block datacenter IPs). These need no signup, so they
 * work out of the box and give the Recommended tab a reliable baseline:
 *   - The Muse    — real city + remote roles, location-filterable
 *   - Remotive    — remote roles, keyword-searchable
 *   - Arbeitnow   — EU job board feed (incl. remote)
 * Every fetch is defensive: any error / unexpected shape yields [] for that
 * source rather than throwing.
 */

function tokens(keywords: string[]): string[] {
  const stop = new Set(["and", "the", "of", "for", "a", "to", "in", "manager", "senior", "junior"]);
  const t = new Set<string>();
  for (const k of keywords) {
    for (const w of k.toLowerCase().split(/[^a-z0-9]+/)) {
      if (w.length > 2 && !stop.has(w)) t.add(w);
    }
  }
  return Array.from(t);
}

/** Loose relevance: does the title/desc mention any keyword token? */
function matchesKeywords(text: string, toks: string[]): boolean {
  if (toks.length === 0) return true;
  const lower = text.toLowerCase();
  return toks.some((t) => lower.includes(t));
}

/** The Muse — https://www.themuse.com/developers/api/v2 (no key for basic use). */
export async function fetchThemuseJobs(q: SourceQuery): Promise<RawJob[]> {
  const out: RawJob[] = [];
  const locations = q.locations.length ? q.locations : ["Dublin"];
  for (let page = 0; page < 2; page++) {
    const params = new URLSearchParams({ page: String(page) });
    for (const loc of locations) params.append("location", loc);
    try {
      const res = await fetch(
        `https://www.themuse.com/api/public/jobs?${params}`,
        { signal: AbortSignal.timeout(15000) }
      );
      if (!res.ok) break;
      const json = (await res.json()) as {
        results?: Array<{
          id?: number;
          name?: string;
          contents?: string;
          publication_date?: string;
          company?: { name?: string };
          locations?: Array<{ name?: string }>;
          refs?: { landing_page?: string };
        }>;
      };
      const results = json.results ?? [];
      if (results.length === 0) break;
      for (const r of results) {
        if (!r.id || !r.name) continue;
        out.push({
          source: "themuse",
          external_id: String(r.id),
          title: r.name,
          company_name: r.company?.name ?? null,
          location: r.locations?.map((l) => l.name).filter(Boolean).join(", ") || null,
          salary_text: null,
          url: r.refs?.landing_page ?? null,
          description: r.contents ? htmlToText(r.contents).slice(0, 2000) : null,
          posted_at: r.publication_date ?? null,
        });
      }
    } catch {
      break;
    }
  }
  return out;
}

/** Remotive — https://remotive.com/api/remote-jobs?search= (no key, remote roles). */
export async function fetchRemotiveJobs(q: SourceQuery): Promise<RawJob[]> {
  const out: RawJob[] = [];
  const seen = new Set<string>();
  for (const kw of q.keywords.slice(0, 3)) {
    try {
      const res = await fetch(
        `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(kw)}&limit=25`,
        { signal: AbortSignal.timeout(15000) }
      );
      if (!res.ok) continue;
      const json = (await res.json()) as {
        jobs?: Array<{
          id?: number;
          url?: string;
          title?: string;
          company_name?: string;
          candidate_required_location?: string;
          salary?: string;
          description?: string;
          publication_date?: string;
        }>;
      };
      for (const j of json.jobs ?? []) {
        if (!j.id || !j.title || seen.has(String(j.id))) continue;
        seen.add(String(j.id));
        out.push({
          source: "remotive",
          external_id: String(j.id),
          title: j.title,
          company_name: j.company_name ?? null,
          location: j.candidate_required_location || "Remote",
          salary_text: j.salary || null,
          url: j.url ?? null,
          description: j.description ? htmlToText(j.description).slice(0, 2000) : null,
          posted_at: j.publication_date ?? null,
        });
      }
    } catch {
      // next keyword
    }
  }
  return out;
}

/** Arbeitnow — https://www.arbeitnow.com/api/job-board-api (no key, EU feed). */
export async function fetchArbeitnowJobs(q: SourceQuery): Promise<RawJob[]> {
  const toks = tokens(q.keywords);
  const out: RawJob[] = [];
  try {
    const res = await fetch("https://www.arbeitnow.com/api/job-board-api", {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: Array<{
        slug?: string;
        company_name?: string;
        title?: string;
        description?: string;
        remote?: boolean;
        url?: string;
        location?: string;
        created_at?: number;
      }>;
    };
    for (const j of json.data ?? []) {
      if (!j.slug || !j.title) continue;
      // The feed is broad (Germany-heavy) — keep only keyword-relevant roles.
      if (!matchesKeywords(`${j.title} ${j.location ?? ""}`, toks)) continue;
      out.push({
        source: "arbeitnow",
        external_id: j.slug,
        title: j.title,
        company_name: j.company_name ?? null,
        location: j.location || (j.remote ? "Remote" : null),
        salary_text: null,
        url: j.url ?? null,
        description: j.description ? htmlToText(j.description).slice(0, 2000) : null,
        posted_at: j.created_at ? new Date(j.created_at * 1000).toISOString() : null,
      });
    }
  } catch {
    return [];
  }
  return out;
}

/** All keyless API sources, deduped within this batch. */
export async function fetchFreeApiSources(q: SourceQuery): Promise<RawJob[]> {
  const batches = await Promise.all([
    fetchThemuseJobs(q),
    fetchRemotiveJobs(q),
    fetchArbeitnowJobs(q),
  ]);
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
