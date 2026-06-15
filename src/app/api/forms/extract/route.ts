import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AiLimitError } from "@/lib/ai";
import {
  extractQuestionsFromText,
  extractQuestionsFromUrl,
} from "@/lib/forms/extract";
import type { FormQuestion } from "@/lib/types";

/**
 * Start a form completion run: extract questions from a URL, pasted text,
 * or an uploaded PDF/Word form (multipart). Creates a form_submissions row.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    let applicationId: string;
    let inputMethod: "url" | "pasted_questions" | "file_upload";
    let questions: FormQuestion[];
    let originalFilePath: string | null = null;

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const fd = await request.formData();
      applicationId = String(fd.get("application_id") ?? "");
      const file = fd.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "file required" }, { status: 400 });
      }
      const name = file.name.toLowerCase();
      if (!name.endsWith(".pdf") && !name.endsWith(".docx")) {
        return NextResponse.json(
          { error: "Upload a PDF or .docx form" },
          { status: 400 }
        );
      }
      inputMethod = "file_upload";
      const bytes = new Uint8Array(await file.arrayBuffer());

      // Keep the original for completion + side-by-side preview.
      originalFilePath = `${user.id}/forms/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error: uploadError } = await supabase.storage
        .from("uploads")
        .upload(originalFilePath, bytes.slice().buffer as ArrayBuffer, {
          contentType: file.type || "application/octet-stream",
        });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      let text = "";
      if (name.endsWith(".pdf")) {
        const { extractText, getDocumentProxy } = await import("unpdf");
        const proxy = await getDocumentProxy(bytes);
        const result = await extractText(proxy, { mergePages: true });
        text = result.text as string;
      } else {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
        text = result.value;
      }
      if (!text.trim()) {
        return NextResponse.json(
          { error: "No readable text found in the file (is it a scanned image?)" },
          { status: 400 }
        );
      }
      questions = await extractQuestionsFromText(supabase, user.id, text);
    } else {
      const body = await request.json();
      applicationId = body.application_id;
      if (body.method === "url") {
        inputMethod = "url";
        questions = await extractQuestionsFromUrl(supabase, user.id, body.url);
      } else {
        inputMethod = "pasted_questions";
        if (!body.text?.trim()) {
          return NextResponse.json({ error: "No questions pasted" }, { status: 400 });
        }
        questions = await extractQuestionsFromText(supabase, user.id, body.text);
      }
    }

    if (!applicationId) {
      return NextResponse.json({ error: "application_id required" }, { status: 400 });
    }
    if (questions.length === 0) {
      return NextResponse.json(
        { error: "No questions could be extracted — paste them manually instead." },
        { status: 422 }
      );
    }

    const { data: submission, error } = await supabase
      .from("form_submissions")
      .insert({
        user_id: user.id,
        application_id: applicationId,
        input_method: inputMethod,
        original_file_path: originalFilePath,
        questions,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, submission });
  } catch (err) {
    const status = err instanceof AiLimitError ? 429 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Extraction failed" },
      { status }
    );
  }
}
