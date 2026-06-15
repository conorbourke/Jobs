import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AiLimitError } from "@/lib/ai";
import { generateCompanyBrief, generateInterviewPrep } from "@/lib/documents";
import { PdfConfigError } from "@/lib/pdf/render";

/** Generate a company & role brief or interview prep PDF for an application. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { application_id, type } = await request.json();
  if (!application_id || !["company_brief", "interview_prep"].includes(type)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const doc =
      type === "company_brief"
        ? await generateCompanyBrief(supabase, user.id, application_id)
        : await generateInterviewPrep(supabase, user.id, application_id);
    return NextResponse.json({ ok: true, document: doc });
  } catch (err) {
    const status = err instanceof AiLimitError ? 429 : err instanceof PdfConfigError ? 503 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status }
    );
  }
}
