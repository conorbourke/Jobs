import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminSettings } from "@/lib/settings";
import { AdminSettingsClient } from "./admin-settings-client";

export const metadata = { title: "Admin Settings" };
export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "superadmin") redirect("/dashboard");

  const settings = await getAdminSettings(supabase);
  return <AdminSettingsClient settings={settings} />;
}
