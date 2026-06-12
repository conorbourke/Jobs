import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminSettings } from "@/lib/settings";
import type { CoverTemplate, CvTemplate } from "@/lib/types";
import { TemplatesClient } from "./templates-client";

export const metadata = { title: "CV Templates" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: templates }, { data: cover }, settings] = await Promise.all([
    supabase
      .from("cv_templates")
      .select("*")
      .order("is_master", { ascending: false })
      .order("created_at")
      .returns<CvTemplate[]>(),
    supabase.from("cover_templates").select("*").maybeSingle<CoverTemplate>(),
    getAdminSettings(supabase),
  ]);

  return (
    <TemplatesClient
      userId={user.id}
      templates={templates ?? []}
      cover={cover}
      maxTemplates={settings.max_cv_templates}
    />
  );
}
