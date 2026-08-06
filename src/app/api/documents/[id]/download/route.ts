import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { GeneratedDocument } from "@/lib/types";

// Human-friendly download names — no version numbers or ids, just the type +
// the candidate's name, e.g. "CV Conor Bourke.pdf".
const TYPE_LABELS: Record<string, string> = {
  cv: "CV",
  cover_letter: "Cover Letter",
  company_brief: "Company Brief",
  interview_prep: "Interview Prep",
  completed_form_pdf: "Application Form",
  completed_form_docx: "Application Form",
};

/** Download a generated document via a short-lived signed URL. ?inline=1 previews instead. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // RLS scopes this to the owner.
  const { data: doc } = await supabase
    .from("generated_documents")
    .select("*")
    .eq("id", id)
    .single<GeneratedDocument>();
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Name shown on the documents, used verbatim in the download filename.
  const { data: master } = await supabase
    .from("cv_templates")
    .select("content")
    .eq("is_master", true)
    .maybeSingle<{ content: { full_name?: string } }>();
  const fullName = master?.content?.full_name?.trim();
  const label = TYPE_LABELS[doc.type] ?? "Document";
  const ext = doc.storage_path.toLowerCase().endsWith(".docx") ? "docx" : "pdf";
  const filename = `${label}${fullName ? ` ${fullName}` : ""}.${ext}`;

  const { data: signed, error } = await supabase.storage
    .from("generated")
    .createSignedUrl(doc.storage_path, 300, inline ? {} : { download: filename });
  if (error || !signed) {
    return NextResponse.json({ error: error?.message ?? "Sign failed" }, { status: 500 });
  }
  return NextResponse.redirect(signed.signedUrl);
}
