import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sortTrackerRows, type TrackerRow } from "@/lib/sort";
import type { Application, Company, Interview } from "@/lib/types";
import { TrackerClient } from "./tracker-client";

export const metadata = { title: "Tracker" };
export const dynamic = "force-dynamic";

export default async function TrackerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: applications }, { data: companies }, { data: interviews }] =
    await Promise.all([
      supabase.from("applications").select("*").returns<Application[]>(),
      supabase.from("companies").select("*").order("name").returns<Company[]>(),
      supabase
        .from("interviews")
        .select("*")
        .order("scheduled_at")
        .returns<Interview[]>(),
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

  const active = sortTrackerRows(rows.filter((r) => r.status !== "rejected"));
  const rejected = rows
    .filter((r) => r.status === "rejected")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  return (
    <TrackerClient
      active={active}
      rejected={rejected}
      companies={companies ?? []}
    />
  );
}
