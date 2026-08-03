import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractFileText, UnsupportedFileError } from "@/lib/extract";
import type { ApplicationAttachment } from "@/lib/types";

const MAX_PER_APPLICATION = 3;

/**
 * Upload a supporting document (job description / personal specification) for
 * an application. multipart/form-data: `file` + `application_id`. Stored in the
 * `uploads` bucket and its text extracted for AI generation. Max 3 per app.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  const applicationId = formData.get("application_id");
  if (!(file instanceof File) || typeof applicationId !== "string") {
    return NextResponse.json(
      { error: "file and application_id are required" },
      { status: 400 }
    );
  }

  // Enforce the per-application cap (RLS scopes this to the user's own rows).
  const { count } = await supabase
    .from("application_attachments")
    .select("id", { count: "exact", head: true })
    .eq("application_id", applicationId);
  if ((count ?? 0) >= MAX_PER_APPLICATION) {
    return NextResponse.json(
      { error: `You can attach at most ${MAX_PER_APPLICATION} documents per job.` },
      { status: 400 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Extract text up front (best-effort — a file we can't read is still stored).
  let extracted: string | null = null;
  try {
    extracted = await extractFileText(file.name, bytes);
  } catch (err) {
    if (err instanceof UnsupportedFileError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    extracted = null; // stored without text; generation just won't use it
  }

  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
  const path = `${user.id}/attachments/${applicationId}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("uploads")
    .upload(path, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("application_attachments")
    .insert({
      user_id: user.id,
      application_id: applicationId,
      storage_path: path,
      filename: file.name,
      extracted_text: extracted,
    })
    .select()
    .single<ApplicationAttachment>();
  if (error) {
    // Roll back the orphaned object so we don't leak storage.
    await supabase.storage.from("uploads").remove([path]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, attachment: data });
}

/** Delete an attachment (its storage object and row). ?id=<attachment_id> */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data: att } = await supabase
    .from("application_attachments")
    .select("storage_path")
    .eq("id", id)
    .single<{ storage_path: string }>();

  if (att) {
    await supabase.storage.from("uploads").remove([att.storage_path]);
  }
  const { error } = await supabase.from("application_attachments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
