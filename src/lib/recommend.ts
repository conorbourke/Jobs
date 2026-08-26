import type { SupabaseClient } from "@supabase/supabase-js";
import type { CvContent } from "./cv-schema";
import {
  anySourceConfigured,
  fetchAllSources,
  type RawJob,
  type SourceQuery,
} from "./jobsources";
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
}

const DEFAULT_LOCATIONS = ["Dublin", "Belfast", "London"];
const MAX_KEYWORDS = 5;
const SCORE_CHUNK = 12;
const MAX_INSERT = 40;

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
    return { configured: false, fetched: 0, scored: 0, inserted: 0 };
  }

  const query = await deriveQuery(supabase, userId);
  const raw = await fetchAllSources(query);
  if (raw.length === 0) {
    return { configured: true, fetched: 0, scored: 0, inserted: 0 };
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
    return { configured: true, fetched: raw.length, scored: 0, inserted: 0 };
  }

  // Score against the candidate profile, in chunks.
  const profile = await buildCandidateProfile(supabase, userId);
  const scoreByRef = new Map<string, { suitability: string; score: number; reason: string }>();
  for (let i = 0; i < fresh.length; i += SCORE_CHUNK) {
    const chunk = fresh.slice(i, i + SCORE_CHUNK);
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

  // Keep medium/high matches, best first, capped.
  const rows = fresh
    .map((j) => {
      const s = scoreByRef.get(`${j.source}:${j.external_id}`);
      return { job: j, s };
    })
    .filter((r) => r.s && r.s.suitability !== "low")
    .sort((a, b) => (b.s!.score ?? 0) - (a.s!.score ?? 0))
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
      suitability: s!.suitability,
      suitability_reason: s!.reason,
      score: s!.score,
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
  };
}
