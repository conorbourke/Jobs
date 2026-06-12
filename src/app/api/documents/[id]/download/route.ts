import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { GeneratedDocument } from "@/lib/types";

/** Download a generated document via a short-lived signed URL. */
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

  // RLS scopes this to the owner.
  const { data: doc } = await supabase
    .from("generated_documents")
    .select("*")
    .eq("id", id)
    .single<GeneratedDocument>();
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: signed, error } = await supabase.storage
    .from("generated")
    .createSignedUrl(doc.storage_path, 60, { download: true });
  if (error || !signed) {
    return NextResponse.json({ error: error?.message ?? "Sign failed" }, { status: 500 });
  }
  return NextResponse.redirect(signed.signedUrl);
}
