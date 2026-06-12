import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Public: is sign-up currently open? (admin_settings.signup_open) */
export async function GET() {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("admin_settings")
      .select("signup_open")
      .eq("id", 1)
      .single();
    return NextResponse.json({ open: data?.signup_open ?? true });
  } catch {
    return NextResponse.json({ open: true });
  }
}
