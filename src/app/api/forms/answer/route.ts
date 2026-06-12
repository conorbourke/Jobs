import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AiLimitError } from "@/lib/ai";
import { generateAnswers } from "@/lib/forms/extract";
import type { Application, FormSubmission } from "@/lib/types";

/** Generate (or regenerate with a comment) AI answers for a form submission. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { submission_id, notes, regeneration_comment } = await request.json();
  const { data: submission } = await supabase
    .from("form_submissions")
    .select("*")
    .eq("id", submission_id)
    .single<FormSubmission>();
  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: application } = await supabase
    .from("applications")
    .select("*")
    .eq("id", submission.application_id)
    .single<Application>();
  if (!application) return NextResponse.json({ error: "Application missing" }, { status: 404 });

  try {
    const answers = await generateAnswers({
      supabase,
      userId: user.id,
      application,
      questions: submission.questions,
      userNotes: notes || undefined,
      regenerationComment: regeneration_comment || undefined,
      previousAnswers: regeneration_comment ? submission.answers : undefined,
    });
    await supabase
      .from("form_submissions")
      .update({ answers })
      .eq("id", submission_id);
    return NextResponse.json({ ok: true, answers });
  } catch (err) {
    const status = err instanceof AiLimitError ? 429 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Answer generation failed" },
      { status }
    );
  }
}
