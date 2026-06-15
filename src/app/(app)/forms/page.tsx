import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Application, Company, CvTemplate, FormSubmission } from "@/lib/types";
import { FormsClient } from "./forms-client";

export const metadata = { title: "Application Forms" };
export const dynamic = "force-dynamic";

export default async function FormsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: drafts }, { data: companies }, { data: templates }, { data: submissions }] =
    await Promise.all([
      supabase
        .from("applications")
        .select("*")
        .eq("status", "draft")
        .eq("source", "application_form")
        .order("created_at", { ascending: false })
        .returns<Application[]>(),
      supabase.from("companies").select("*").order("name").returns<Company[]>(),
      supabase
        .from("cv_templates")
        .select("*")
        .order("is_master", { ascending: false })
        .order("created_at")
        .returns<CvTemplate[]>(),
      supabase
        .from("form_submissions")
        .select("*")
        .order("created_at", { ascending: false })
        .returns<FormSubmission[]>(),
    ]);

  // Latest submission per application.
  const latestByApp = new Map<string, FormSubmission>();
  for (const s of submissions ?? []) {
    if (!latestByApp.has(s.application_id)) latestByApp.set(s.application_id, s);
  }

  return (
    <FormsClient
      drafts={drafts ?? []}
      companies={companies ?? []}
      cvTemplates={templates ?? []}
      submissions={Object.fromEntries(latestByApp)}
    />
  );
}
