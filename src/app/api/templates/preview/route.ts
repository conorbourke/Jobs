import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cvHtml } from "@/lib/pdf/templates";
import { renderHtmlToPdf, PdfConfigError } from "@/lib/pdf/render";
import { EMPTY_CV, type CvContent } from "@/lib/cv-schema";

/**
 * Render a CV template's structured content to a PDF for on-page preview.
 * Uses the same cvHtml + Browser Rendering pipeline as generation, so the
 * preview is byte-for-byte what a generated CV in this layout looks like.
 * Accepts the live editor content so unsaved edits can be previewed.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const content = { ...EMPTY_CV, ...(body.content ?? {}) } as CvContent;

  try {
    const pdf = await renderHtmlToPdf(cvHtml(content));
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="cv-preview.pdf"',
      },
    });
  } catch (err) {
    const status = err instanceof PdfConfigError ? 503 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Render failed" },
      { status }
    );
  }
}
