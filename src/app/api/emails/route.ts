import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiComplete, AiLimitError } from "@/lib/ai";
import type { ApplicationEmail, Profile } from "@/lib/types";

/**
 * Paste an email into an application's thread. Regenerates the cached AI
 * summary of the whole thread (if the user has summaries enabled) and pins
 * it on the application.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { application_id, direction, body_text } = await request.json();
  if (!application_id || !["from_me", "from_company"].includes(direction) || !body_text?.trim()) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // RLS guarantees the application belongs to this user.
  const { data: application } = await supabase
    .from("applications")
    .select("id, job_title")
    .eq("id", application_id)
    .single();
  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const { error: insertError } = await supabase.from("application_emails").insert({
    user_id: user.id,
    application_id,
    direction,
    body_text: body_text.trim(),
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  // Refresh the thread summary unless disabled in user settings.
  const { data: profile } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", user.id)
    .single<Pick<Profile, "settings">>();
  if (profile?.settings?.email_summary_enabled === false) {
    return NextResponse.json({ ok: true });
  }

  try {
    const { data: thread } = await supabase
      .from("application_emails")
      .select("*")
      .eq("application_id", application_id)
      .order("pasted_at", { ascending: true })
      .returns<ApplicationEmail[]>();

    const threadText = (thread ?? [])
      .map(
        (e) =>
          `--- ${e.direction === "from_me" ? "ME" : "COMPANY"} (${e.pasted_at}) ---\n${e.body_text}`
      )
      .join("\n\n");

    const summary = await aiComplete({
      supabase,
      userId: user.id,
      feature: "email_summary",
      system:
        "You summarise job application email threads. Produce a concise summary (max ~120 words): current state of the conversation, any commitments or dates mentioned, and the single next action for the candidate. Plain text, no markdown headings.",
      user: `Job: ${application.job_title}\n\nThread (oldest first):\n\n${threadText}`,
      maxOutputTokens: 400,
    });

    await supabase
      .from("applications")
      .update({ ai_summary: summary })
      .eq("id", application_id);

    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    // Email was saved; summary failure is non-fatal.
    const message =
      err instanceof AiLimitError ? err.message : "Summary generation failed";
    return NextResponse.json({ ok: true, summary_error: message });
  }
}
