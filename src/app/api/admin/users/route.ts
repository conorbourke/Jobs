import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Superadmin user management: waive fees, extend trial, deactivate. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { user_id, action } = await request.json();
  if (!user_id || !action) {
    return NextResponse.json({ error: "user_id and action required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user_id)
    .single();
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  let patch: Record<string, unknown>;
  switch (action) {
    case "toggle_fees_waived":
      patch = { fees_waived: !target.fees_waived };
      break;
    case "extend_trial": {
      const base = target.trial_ends_at ? new Date(target.trial_ends_at) : new Date();
      const extended = new Date(Math.max(base.getTime(), Date.now()));
      extended.setDate(extended.getDate() + 14);
      patch = { trial_ends_at: extended.toISOString(), plan: "trial" };
      break;
    }
    case "toggle_deactivated":
      if (user_id === user.id) {
        return NextResponse.json({ error: "You cannot deactivate yourself" }, { status: 400 });
      }
      patch = { deactivated: !target.deactivated };
      break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { error } = await admin.from("profiles").update(patch).eq("id", user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
