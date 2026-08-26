import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runRecommendations } from "@/lib/recommend";
import { anySourceConfigured } from "@/lib/jobsources";

/**
 * Daily recommended-jobs run for every user. Triggered by an external scheduler
 * (GitHub Actions cron) that sends `Authorization: Bearer $CRON_SECRET`. Uses
 * the service-role client so it can run for all users; every query inside the
 * run is still scoped by user_id.
 */
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!anySourceConfigured()) {
    return NextResponse.json({ ok: true, skipped: "no job sources configured" });
  }

  const admin = createAdminClient();
  const { data: profiles } = await admin
    .from("profiles")
    .select("id")
    .eq("deactivated", false);

  let users = 0;
  let inserted = 0;
  for (const p of profiles ?? []) {
    try {
      const r = await runRecommendations(admin, p.id);
      users += 1;
      inserted += r.inserted;
    } catch {
      // one user's failure shouldn't stop the rest
    }
  }

  return NextResponse.json({ ok: true, users, inserted });
}
