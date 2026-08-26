import type { SupabaseClient } from "@supabase/supabase-js";
import { aiJson } from "./ai";
import type { CvContent } from "./cv-schema";
import type { Suitability } from "./types";

/**
 * Suitability scoring. A single "candidate profile" (built from the master CV
 * plus the roles the user has already applied for) is scored against one or
 * more job postings by the cheap model, returning low / medium / high plus a
 * one-line reason. Shared by the New Jobs suitability badge and the daily
 * Recommended-jobs run.
 */

export interface JobToScore {
  ref: string; // caller's key (application id, or a recommendation external id)
  title: string;
  company?: string | null;
  location?: string | null;
  description?: string | null;
}

export interface JobScore {
  ref: string;
  suitability: Suitability;
  score: number; // 0..100, for ordering
  reason: string; // short, candidate-facing
}

const VALID: Suitability[] = ["low", "medium", "high"];

/**
 * Assemble a compact text profile of the candidate: what they can do (master
 * CV) and what they've been targeting (applied/target roles). No AI call — this
 * is fed straight into the scoring prompt as the "who this person is" context.
 */
export async function buildCandidateProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
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

  const parts: string[] = [];
  const cv = master?.content as CvContent | undefined;
  if (cv) {
    if (cv.role_title) parts.push(`Headline role: ${cv.role_title}`);
    if (cv.about_me) parts.push(`Summary: ${cv.about_me}`);
    if (cv.experience?.length) {
      const roles = cv.experience
        .map((e) => `${e.role_title} at ${e.company} (${e.dates})`)
        .join("; ");
      parts.push(`Experience: ${roles}`);
    }
    if (cv.education?.length) {
      const edu = cv.education
        .map((e) => `${e.qualification}, ${e.institution}`)
        .join("; ");
      parts.push(`Education: ${edu}`);
    }
    if (cv.licenses?.length) {
      parts.push(`Qualifications: ${cv.licenses.slice(0, 12).join("; ")}`);
    }
  }

  const applied = Array.from(
    new Set((apps ?? []).map((a) => a.job_title).filter(Boolean))
  );
  if (applied.length) {
    parts.push(`Roles already applied for: ${applied.join("; ")}`);
  }
  const locations = Array.from(
    new Set((apps ?? []).map((a) => a.location).filter(Boolean))
  );
  if (locations.length) {
    parts.push(`Locations of interest: ${locations.join("; ")}`);
  }

  return parts.join("\n") || "No profile information available yet.";
}

const SYSTEM = `You assess how well a candidate fits each job posting, from the candidate's point of view (would this be a strong application for them?).

Judge on: relevance of their experience and seniority to the role, sector/skill overlap, and location fit. Be honest and calibrated — most jobs are a medium fit; reserve "high" for genuinely strong matches and "low" for clear mismatches.

Return ONLY a JSON array, one object per job in the same order, each:
{"ref": string (echo the job's ref), "suitability": "low"|"medium"|"high", "score": integer 0-100, "reason": string (one short sentence, max ~18 words, addressed to the candidate)}

Do not add any prose outside the JSON.`;

/** Score a batch of jobs against a prebuilt candidate profile (one AI call). */
export async function scoreJobs(
  supabase: SupabaseClient,
  userId: string,
  profile: string,
  jobs: JobToScore[]
): Promise<JobScore[]> {
  if (jobs.length === 0) return [];

  const jobsText = jobs
    .map((j, i) => {
      const desc = (j.description ?? "").slice(0, 1200);
      return `--- Job ${i + 1} (ref: ${j.ref}) ---
Title: ${j.title}
Company: ${j.company ?? "—"}
Location: ${j.location ?? "—"}
Description: ${desc || "(none provided)"}`;
    })
    .join("\n\n");

  let raw: JobScore[];
  try {
    raw = await aiJson<JobScore[]>({
      supabase,
      userId,
      feature: "job_suitability",
      system: SYSTEM,
      user: `CANDIDATE PROFILE:\n${profile}\n\nJOBS TO ASSESS:\n${jobsText}`,
      maxOutputTokens: 1500,
    });
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];

  const byRef = new Map(jobs.map((j) => [j.ref, j]));
  return raw
    .filter((r) => r && byRef.has(r.ref) && VALID.includes(r.suitability))
    .map((r) => ({
      ref: r.ref,
      suitability: r.suitability,
      score:
        typeof r.score === "number"
          ? Math.max(0, Math.min(100, Math.round(r.score)))
          : r.suitability === "high"
            ? 80
            : r.suitability === "medium"
              ? 55
              : 25,
      reason: String(r.reason ?? "").slice(0, 200),
    }));
}
