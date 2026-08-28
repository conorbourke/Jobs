import type { SupabaseClient } from "@supabase/supabase-js";
import type { CvContent } from "./cv-schema";
import {
  anySourceConfigured,
  fetchAllSources,
  type RawJob,
  type SourceQuery,
} from "./jobsources";
import { fetchScrapeSources } from "./scrapesources";
import { fetchFreeApiSources } from "./apisources";
import {
  buildCandidateProfile,
  scoreJobs,
  type JobToScore,
} from "./suitability";

/**
 * Daily recommended-jobs run for one user: derive search terms from what they
 * do (master CV) and what they've applied for, pull fresh postings from the
 * configured job-board APIs, drop anything already seen or already applied to,
 * score the rest against their profile, and store the good ones (medium/high)
 * for review in the Recommended tab.
 */

export interface RecommendRunResult {
  configured: boolean; // were any job sources set up?
  fetched: number; // raw postings returned by sources
  scored: number; // survived dedup and were scored
  inserted: number; // stored as new recommendations
  bySource: Record<string, number>; // raw postings per source (diagnostic)
}

const DEFAULT_LOCATIONS = ["Dublin", "Belfast", "London"];
const MAX_KEYWORDS = 5;
const SCORE_CHUNK = 12;
const MAX_SCORE = 60; // cap postings scored per run (cost + time budget)
const MAX_INSERT = 50;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Build the source query from the user's history + master CV. */
async function deriveQuery(
  supabase: SupabaseClient,
  userId: string
): Promise<SourceQuery> {
  const [{ data: master }, { data: apps }] = await Promise.all([
    supabase
      .from("cv_templates")
      .select("content")
      .eq("user_id", userId)
      .eq("is_master", true)
      .maybeSingle(),
    supabase
      .from("applications")
      .select("job_title, location")
      .eq("user_id", userId)
      .neq("status", "draft"),
  ]);

  const cv = master?.content as CvContent | undefined;

  // Keywords: applied job titles first (most signal), then master headline.
  const titles = (apps ?? []).map((a) => a.job_title).filter(Boolean) as string[];
  const keywordSet = new Map<string, string>(); // norm -> original
  for (const t of titles) {
    const key = norm(t);
    if (key && !keywordSet.has(key)) keywordSet.set(key, t);
  }
  if (cv?.role_title) {
    const key = norm(cv.role_title);
    if (key && !keywordSet.has(key)) keywordSet.set(key, cv.role_title);
  }
  const keywords = Array.from(keywordSet.values()).slice(0, MAX_KEYWORDS);

  // Locations: applied locations, else parse the master contact line, else default.
  const locSet = new Set<string>();
  for (const a of apps ?? []) {
    const loc = (a.location ?? "").split(/[,/|]/)[0]?.trim();
    if (loc) locSet.add(loc);
  }
  if (locSet.size === 0 && cv?.contact_line) {
    for (const part of cv.contact_line.split("·")) {
      const p = part.trim();
      // A location token: a plain place name, not an email / url / phone.
      if (p && !p.includes("@") && !/\d/.test(p) && !p.includes(".")) {
        for (const place of p.split("/")) {
          const pl = place.trim();
          if (pl) locSet.add(pl);
        }
      }
    }
  }
  const locations = locSet.size ? Array.from(locSet).slice(0, 3) : DEFAULT_LOCATIONS;

  return {
    keywords: keywords.length ? keywords : ["operations manager"],
    locations,
    perQuery: 20,
  };
}

export async function runRecommendations(
  supabase: SupabaseClient,
  userId: string
): Promise<RecommendRunResult> {
  if (!anySourceConfigured()) {
    return { configured: false, fetched: 0, scored: 0, inserted: 0, bySource: {} };
  }

  const query = await deriveQuery(supabase, userId);

  // Three source groups in parallel, then dedupe across everything:
  //  - keyed APIs (Adzuna/Reed)         — reliable, need signup
  //  - keyless APIs (Muse/Remotive/…)   — reliable, no signup
  //  - HTML scrape (LinkedIn/Indeed/…)  — best-effort, often blocked
  const [apiJobs, freeJobs, scrapeJobs] = await Promise.all([
    fetchAllSources(query),
    fetchFreeApiSources(query),
    fetchScrapeSources(supabase, userId, query),
  ]);
  const seenSource = new Set<string>();
  const raw: RawJob[] = [];
  const bySource: Record<string, number> = {};
  for (const j of [...apiJobs, ...freeJobs, ...scrapeJobs]) {
    const key = `${j.source}:${j.external_id}`;
    if (seenSource.has(key)) continue;
    seenSource.add(key);
    raw.push(j);
    bySource[j.source] = (bySource[j.source] ?? 0) + 1;
  }
  if (raw.length === 0) {
    return { configured: true, fetched: 0, scored: 0, inserted: 0, bySource };
  }

  // Dedup against what we've already recommended and what's already tracked.
  const [{ data: existing }, { data: apps }] = await Promise.all([
    supabase
      .from("recommended_jobs")
      .select("source, external_id")
      .eq("user_id", userId),
    supabase
      .from("applications")
      .select("job_title, company_id, job_url, companies(name)")
      .eq("user_id", userId),
  ]);

  const seenKeys = new Set(
    (existing ?? []).map((e) => `${e.source}:${e.external_id}`)
  );
  const appliedUrls = new Set(
    (apps ?? []).map((a) => a.job_url).filter(Boolean) as string[]
  );
  const appliedTitleCompany = new Set(
    (apps ?? []).map((a) => {
      const company = (a as { companies?: { name?: string } | null }).companies
        ?.name;
      return `${norm(a.job_title)}|${norm(company ?? "")}`;
    })
  );

  const fresh: RawJob[] = [];
  const batchKeys = new Set<string>();
  for (const j of raw) {
    const key = `${j.source}:${j.external_id}`;
    if (seenKeys.has(key) || batchKeys.has(key)) continue;
    if (j.url && appliedUrls.has(j.url)) continue;
    if (appliedTitleCompany.has(`${norm(j.title)}|${norm(j.company_name ?? "")}`))
      continue;
    batchKeys.add(key);
    fresh.push(j);
  }
  if (fresh.length === 0) {
    return { configured: true, fetched: raw.length, scored: 0, inserted: 0, bySource };
  }

  // Cap how many we score per run (cost + time budget), newest-ish first.
  const toRank = fresh.slice(0, MAX_SCORE);

  // Score against the candidate profile, in chunks.
  const profile = await buildCandidateProfile(supabase, userId);
  const scoreByRef = new Map<string, { suitability: string; score: number; reason: string }>();
  for (let i = 0; i < toRank.length; i += SCORE_CHUNK) {
    const chunk = toRank.slice(i, i + SCORE_CHUNK);
    const toScore: JobToScore[] = chunk.map((j) => ({
      ref: `${j.source}:${j.external_id}`,
      title: j.title,
      company: j.company_name,
      location: j.location,
      description: j.description,
    }));
    const scores = await scoreJobs(supabase, userId, profile, toScore);
    for (const s of scores) scoreByRef.set(s.ref, s);
  }

  // Relaxed: keep everything found, best match first. Low matches sink to the
  // bottom; jobs the scorer couldn't rate are kept as "unrated" (null) rather
  // than silently dropped — the tab should never come up empty when jobs exist.
  const rows = toRank
    .map((job) => {
      const s = scoreByRef.get(`${job.source}:${job.external_id}`);
      return { job, s };
    })
    .sort((a, b) => (b.s?.score ?? 45) - (a.s?.score ?? 45))
    .slice(0, MAX_INSERT)
    .map(({ job, s }) => ({
      user_id: userId,
      source: job.source,
      external_id: job.external_id,
      title: job.title,
      company_name: job.company_name,
      location: job.location,
      salary_text: job.salary_text,
      url: job.url,
      description: job.description,
      suitability: s?.suitability ?? null,
      suitability_reason: s?.reason ?? null,
      score: s?.score ?? null,
      posted_at: job.posted_at,
      status: "new" as const,
    }));

  let inserted = 0;
  if (rows.length) {
    const { error, count } = await supabase
      .from("recommended_jobs")
      .upsert(rows, {
        onConflict: "user_id,source,external_id",
        ignoreDuplicates: true,
        count: "exact",
      });
    if (!error) inserted = count ?? rows.length;
  }

  return {
    configured: true,
    fetched: raw.length,
    scored: scoreByRef.size,
    inserted,
    bySource,
  };
}
