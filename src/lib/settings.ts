import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminSettings } from "./types";

/** Fetch the admin_settings singleton. All caps/limits/pricing come from here. */
export async function getAdminSettings(
  supabase: SupabaseClient
): Promise<AdminSettings> {
  const { data, error } = await supabase
    .from("admin_settings")
    .select("*")
    .eq("id", 1)
    .single();
  if (error || !data) throw new Error("admin_settings missing: " + error?.message);
  return data as AdminSettings;
}
