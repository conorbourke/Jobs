import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const name = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    if (name.endsWith(".pdf")) {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(bytes);
      const { text } = await extractText(pdf, { mergePages: true });
      return NextResponse.json({ text: (text as string).trim() });
    }
    if (name.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({
        buffer: Buffer.from(bytes),
      });
      return NextResponse.json({ text: result.value.trim() });
    }
    if (name.endsWith(".txt")) {
      return NextResponse.json({ text: new TextDecoder().decode(bytes).trim() });
    }
    return NextResponse.json(
      { error: "Unsupported file type — use PDF, .docx or .txt" },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Extraction failed: ${err instanceof Error ? err.message : err}` },
      { status: 500 }
    );
  }
}
