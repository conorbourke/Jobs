import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runRecommendations } from "@/lib/recommend";

/**
 * Run the recommended-jobs discovery for the current user on demand
 * ("Refresh now" in the Recommended tab). The same logic runs daily via
 * /api/cron/recommendations for every user.
 */
export const maxDuration = 300;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await runRecommendations(supabase, user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to refresh recommendations" },
      { status: 500 }
    );
  }
}
