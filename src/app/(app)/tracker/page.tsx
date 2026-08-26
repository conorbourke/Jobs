import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sortTrackerRows, type TrackerRow } from "@/lib/sort";
import type { Application, Company, CvTemplate, Interview } from "@/lib/types";
import { TrackerClient } from "./tracker-client";

export const metadata = { title: "Tracker" };
export const dynamic = "force-dynamic";

export default async function TrackerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: applications },
    { data: companies },
    { data: interviews },
    { data: templates },
  ] = await Promise.all([
    supabase.from("applications").select("*").returns<Application[]>(),
    supabase.from("companies").select("*").order("name").returns<Company[]>(),
    supabase
      .from("interviews")
      .select("*")
      .order("scheduled_at")
      .returns<Interview[]>(),
    supabase
      .from("cv_templates")
      .select("*")
      .order("is_master", { ascending: false })
      .order("created_at")
      .returns<CvTemplate[]>(),
  ]);

  const companyNames = new Map((companies ?? []).map((c) => [c.id, c.name]));
  const now = Date.now();
  const nextInterview = new Map<string, string>();
  for (const iv of interviews ?? []) {
    const t = new Date(iv.scheduled_at).getTime();
    if (t >= now && !nextInterview.has(iv.application_id)) {
      nextInterview.set(iv.application_id, iv.scheduled_at);
    }
  }

  const rows: TrackerRow[] = (applications ?? []).map((a) => ({
    ...a,
    company_name: a.company_id ? companyNames.get(a.company_id) ?? null : null,
    next_interview_at: nextInterview.get(a.id) ?? null,
  }));

  // Unknown deadline first, then soonest deadline; newest added as a tiebreak.
  const notApplied = rows
    .filter((r) => r.status === "draft")
    .sort((a, b) => {
      if (!a.due_date && !b.due_date) return b.date_added.localeCompare(a.date_added);
      if (!a.due_date) return -1;
      if (!b.due_date) return 1;
      return a.due_date.localeCompare(b.due_date);
    });
  const applied = sortTrackerRows(
    rows.filter((r) => r.status !== "rejected" && r.status !== "draft")
  );
  const rejected = rows
    .filter((r) => r.status === "rejected")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  // For each company, the roles already applied to (any non-draft application).
  // Used to flag a not-applied draft when you've applied to the same company
  // before on a different role.
  const priorRolesByCompany: Record<string, string[]> = {};
  for (const r of rows) {
    if (r.status === "draft" || !r.company_id) continue;
    (priorRolesByCompany[r.company_id] ??= []).push(r.job_title || "Untitled role");
  }

  return (
    <TrackerClient
      notApplied={notApplied}
      applied={applied}
      rejected={rejected}
      companies={companies ?? []}
      cvTemplates={templates ?? []}
      priorRolesByCompany={priorRolesByCompany}
    />
  );
}
