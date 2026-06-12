import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AiLimitError } from "@/lib/ai";
import { generateCvAndCover } from "@/lib/documents";
import { PdfConfigError } from "@/lib/pdf/render";

/**
 * Generate (or regenerate with notes) the tailored CV + cover letter + email
 * subject/body for an application. Every run is a new version.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    application_id,
    cv_template_id,
    notes,
    regeneration_comment,
    attach_portfolio,
  } = await request.json();
  if (!application_id || !cv_template_id) {
    return NextResponse.json(
      { error: "application_id and cv_template_id are required" },
      { status: 400 }
    );
  }

  // Keep the application's portfolio tickbox in sync with this run.
  await supabase
    .from("applications")
    .update({ attach_portfolio: !!attach_portfolio })
    .eq("id", application_id);

  try {
    const result = await generateCvAndCover({
      supabase,
      userId: user.id,
      applicationId: application_id,
      cvTemplateId: cv_template_id,
      userNotes: notes || undefined,
      regenerationComment: regeneration_comment || undefined,
      attachPortfolio: !!attach_portfolio,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const status = err instanceof AiLimitError ? 429 : err instanceof PdfConfigError ? 503 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status }
    );
  }
}
