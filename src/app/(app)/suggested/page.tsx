import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Application, Company, CvTemplate } from "@/lib/types";
import { SuggestedClient } from "./suggested-client";

export const metadata = { title: "Suggested Jobs" };
export const dynamic = "force-dynamic";

export default async function SuggestedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: drafts }, { data: companies }, { data: templates }, { data: apps }] =
    await Promise.all([
      supabase
        .from("applications")
        .select("*")
        .eq("status", "draft")
        .neq("source", "application_form")
        .order("created_at", { ascending: false })
        .returns<Application[]>(),
      supabase
        .from("companies")
        .select("*")
        .order("sort_order")
        .returns<Company[]>(),
      supabase
        .from("cv_templates")
        .select("*")
        .order("is_master", { ascending: false })
        .order("created_at")
        .returns<CvTemplate[]>(),
      supabase.from("applications").select("company_id"),
    ]);

  // Past application counts, joined on company UUID.
  const counts: Record<string, number> = {};
  for (const a of apps ?? []) {
    if (a.company_id) counts[a.company_id] = (counts[a.company_id] ?? 0) + 1;
  }

  return (
    <SuggestedClient
      drafts={drafts ?? []}
      companies={companies ?? []}
      cvTemplates={templates ?? []}
      applicationCounts={counts}
    />
  );
}
