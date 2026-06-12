import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { FormSubmission } from "@/lib/types";

/** Signed-URL redirect to the original uploaded form (for side-by-side preview). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: submission } = await supabase
    .from("form_submissions")
    .select("*")
    .eq("id", id)
    .single<FormSubmission>();
  if (!submission?.original_file_path) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: signed, error } = await supabase.storage
    .from("uploads")
    .createSignedUrl(submission.original_file_path, 300);
  if (error || !signed) {
    return NextResponse.json({ error: error?.message ?? "Sign failed" }, { status: 500 });
  }
  return NextResponse.redirect(signed.signedUrl);
}
