import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { debugScrapeSources } from "@/lib/scrapesources";
import { buildCandidateProfile } from "@/lib/suitability";
import type { CvContent } from "@/lib/cv-schema";

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

  const [profile, diag] = await Promise.all([
    buildCandidateProfile(supabase, user.id),
    debugScrapeSources(supabase, user.id, { keywords, locations }),
  ]);

  return NextResponse.json({
    browserRenderingConfigured: Boolean(process.env.CLOUDFLARE_API_TOKEN),
    adzunaConfigured: Boolean(
      process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY
    ),
    reedConfigured: Boolean(process.env.REED_API_KEY),
    keywords,
    locations,
    profilePreview: profile.slice(0, 400),
    sources: diag,
  });
}
