import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildCandidateProfile, scoreJobs, type JobToScore } from "@/lib/suitability";

/**
 * Score New Jobs drafts for suitability (low/medium/high) against the user's
 * master CV + application history. Body: { applicationIds?: string[] }. With no
 * ids, scores every draft that doesn't yet have a suitability. Best-effort:
 * scoring failures leave the rows unscored rather than erroring the page.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const ids: string[] | undefined = Array.isArray(body.applicationIds)
    ? body.applicationIds
    : undefined;

  let q = supabase
    .from("applications")
    .select("id, job_title, location, job_description_text, companies(name)")
    .eq("user_id", user.id)
    .eq("status", "draft");
  q = ids && ids.length ? q.in("id", ids) : q.is("suitability", null);

  const { data: drafts } = await q.returns<
    {
      id: string;
      job_title: string;
      location: string | null;
      job_description_text: string | null;
      companies: { name: string } | null;
    }[]
  >();

  if (!drafts || drafts.length === 0) {
    return NextResponse.json({ ok: true, scored: 0 });
  }

  const profile = await buildCandidateProfile(supabase, user.id);
  const toScore: JobToScore[] = drafts
    .filter((d) => d.job_title || d.job_description_text)
    .map((d) => ({
      ref: d.id,
      title: d.job_title || "Untitled role",
      company: d.companies?.name ?? null,
      location: d.location,
      description: d.job_description_text,
    }));

  const scores = await scoreJobs(supabase, user.id, profile, toScore);
  for (const s of scores) {
    await supabase
      .from("applications")
      .update({ suitability: s.suitability, suitability_reason: s.reason })
      .eq("id", s.ref)
      .eq("user_id", user.id);
  }

  return NextResponse.json({ ok: true, scored: scores.length });
}
