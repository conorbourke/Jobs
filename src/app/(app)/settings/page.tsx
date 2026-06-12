import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminSettings } from "@/lib/settings";
import type { Profile, RoleOfInterest } from "@/lib/types";
import { SettingsClient } from "./settings-client";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: roles }, settings] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single<Profile>(),
    supabase
      .from("roles_of_interest")
      .select("*")
      .order("sort_order")
      .returns<RoleOfInterest[]>(),
    getAdminSettings(supabase),
  ]);

  if (!profile) redirect("/login");

  return (
    <SettingsClient
      profile={profile}
      roles={roles ?? []}
      maxRoles={settings.max_roles}
      maxCompanies={settings.max_companies}
      aiModel={settings.default_ai_model}
      donationUrl={settings.donation_url}
      aiLimit={settings.ai_monthly_generation_limit}
    />
  );
}
