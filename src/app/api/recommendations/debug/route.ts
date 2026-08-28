import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { debugScrapeSources } from "@/lib/scrapesources";
import { fetchFreeApiSources } from "@/lib/apisources";
import { fetchAllSources } from "@/lib/jobsources";
import { buildCandidateProfile } from "@/lib/suitability";
import type { CvContent } from "@/lib/cv-schema";
import type { RawJob } from "@/lib/jobsources";

/**
 * Diagnostics for the scrape sources. Visit while logged in:
 *   /api/recommendations/debug
 * Reports the derived search terms and, per source, how much text the server
 * could fetch and how many postings were extracted — so we can see whether
 * LinkedIn/Indeed/jobs.ie are reachable from the Worker at all.
 */
export const maxDuration = 120;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: master } = await supabase
    .from("cv_templates")
    .select("content")
    .eq("user_id", user.id)
    .eq("is_master", true)
    .maybeSingle();
  const cv = master?.content as CvContent | undefined;

  const keywords = cv?.role_title ? [cv.role_title] : ["operations manager"];
  const locations = ["Dublin"];

  const query = { keywords, locations };
  const [profile, diag, freeJobs, keyedJobs] = await Promise.all([
    buildCandidateProfile(supabase, user.id),
    debugScrapeSources(supabase, user.id, query),
    fetchFreeApiSources(query),
    fetchAllSources(query),
  ]);

  const countBySource = (jobs: RawJob[]) => {
    const c: Record<string, number> = {};
    for (const j of jobs) c[j.source] = (c[j.source] ?? 0) + 1;
    return c;
  };

  return NextResponse.json({
    browserRenderingConfigured: Boolean(process.env.CLOUDFLARE_API_TOKEN),
    adzunaConfigured: Boolean(
      process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY
    ),
    reedConfigured: Boolean(process.env.REED_API_KEY),
    keywords,
    locations,
    profilePreview: profile.slice(0, 400),
    freeApiSources: countBySource(freeJobs), // themuse / remotive / arbeitnow
    keyedApiSources: countBySource(keyedJobs), // adzuna / reed (if keys set)
    scrapeSources: diag, // linkedin / indeed / jobs.ie / nijobfinder
  });
}
