import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractFileText, UnsupportedFileError } from "@/lib/extract";

/**
 * Extract plain text from an uploaded PDF or Word document (used for job
 * description uploads). multipart/form-data with a `file` field.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file field required" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    const text = await extractFileText(file.name, bytes);
    return NextResponse.json({ text });
  } catch (err) {
    if (err instanceof UnsupportedFileError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: `Extraction failed: ${err instanceof Error ? err.message : err}` },
      { status: 500 }
    );
  }
}
