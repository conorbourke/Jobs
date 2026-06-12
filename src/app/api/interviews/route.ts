import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Schedule a call/interview. Creates the interview row and promotes the
 * application status. Brief generation + .ics invite (Phase 5) are wired in
 * via lib/scheduling once available.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { application_id, scheduled_at, location_text, type } = await request.json();
  if (!application_id || !scheduled_at || isNaN(Date.parse(scheduled_at))) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { data: application } = await supabase
    .from("applications")
    .select("id, status")
    .eq("id", application_id)
    .single();
  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const { data: interview, error } = await supabase
    .from("interviews")
    .insert({
      user_id: user.id,
      application_id,
      scheduled_at,
      location_text: location_text || null,
      type: type || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // A scheduled next step promotes the application.
  if (["draft", "applied", "screening_call"].includes(application.status)) {
    await supabase
      .from("applications")
      .update({ status: "next_scheduled" })
      .eq("id", application_id);
  }

  return NextResponse.json({ ok: true, interview });
}
