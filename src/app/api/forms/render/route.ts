import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { completeDocx, type Placement } from "@/lib/forms/docx";
import { completePdf } from "@/lib/forms/pdf";
import { storeDocument } from "@/lib/documents";
import { renderHtmlToPdf } from "@/lib/pdf/render";
import { qaFormHtml } from "@/lib/pdf/templates";
import type { FormSubmission, FormVerification } from "@/lib/types";

/**
 * Render the completed form from the current answers (after AI generation
 * and/or per-question manual edits). Runs the structural verification check
 * and stores versioned output documents:
 *  - docx upload  → completed .docx (layout preserved) + PDF twin
 *  - pdf upload   → completed PDF (AcroForm fill / overlay / appendix)
 *  - url / pasted → clean Q&A PDF
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { submission_id, generation_notes } = await request.json();
  const { data: submission } = await supabase
    .from("form_submissions")
    .select("*")
    .eq("id", submission_id)
    .single<FormSubmission>();
  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!submission.answers?.length) {
    return NextResponse.json({ error: "Generate answers first" }, { status: 400 });
  }

  const { data: application } = await supabase
    .from("applications")
    .select("id, job_title")
    .eq("id", submission.application_id)
    .single();
  if (!application) return NextResponse.json({ error: "Application missing" }, { status: 404 });

  try {
    const verification: FormVerification = { warnings: [] };
    const outputPaths: { pdf?: string; docx?: string } = {};
    let placements: Placement[] = [];

    if (submission.input_method === "file_upload" && submission.original_file_path) {
      const { data: original } = await supabase.storage
        .from("uploads")
        .download(submission.original_file_path);
      if (!original) throw new Error("Original form file missing from storage");
      const originalBytes = new Uint8Array(await original.arrayBuffer());
      const isDocx = submission.original_file_path.toLowerCase().endsWith(".docx");

      if (isDocx) {
        const result = await completeDocx(
          originalBytes,
          submission.questions,
          submission.answers
        );
        placements = result.placements;
        verification.warnings!.push(...result.warnings);

        const docxDoc = await storeDocument({
          supabase,
          userId: user.id,
          applicationId: application.id,
          type: "completed_form_docx",
          bytes: result.bytes,
          ext: "docx",
          notes: generation_notes ?? null,
        });
        outputPaths.docx = docxDoc.id;

        // PDF twin via mammoth HTML conversion (close approximation — the
        // .docx is the canonical layout-preserving artifact, see README).
        try {
          const mammoth = await import("mammoth");
          const { value: html } = await mammoth.convertToHtml({
            buffer: Buffer.from(result.bytes),
          });
          const pdfBytes = await renderHtmlToPdf(
            `<!doctype html><html><head><meta charset="utf-8"><style>
              body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.45;padding:18mm 16mm;}
              table{border-collapse:collapse;width:100%;} td,th{border:1px solid #999;padding:4pt;}
            </style></head><body>${html}</body></html>`
          );
          const pdfDoc = await storeDocument({
            supabase,
            userId: user.id,
            applicationId: application.id,
            type: "completed_form_pdf",
            bytes: pdfBytes,
            ext: "pdf",
            notes: generation_notes ?? null,
          });
          outputPaths.pdf = pdfDoc.id;
        } catch (err) {
          verification.warnings!.push(
            `PDF twin rendering failed (the completed .docx is still available): ${msg(err)}`
          );
        }
        verification.questions_intact = !verification.warnings!.some((w) =>
          w.startsWith("Question text may have been altered")
        );
      } else {
        const result = await completePdf(
          originalBytes,
          submission.questions,
          submission.answers
        );
        placements = result.placements;
        verification.warnings!.push(...result.warnings);
        verification.original_page_count = result.originalPageCount;
        verification.completed_page_count = result.completedPageCount;
        verification.questions_intact = true; // overlays never remove content

        const pdfDoc = await storeDocument({
          supabase,
          userId: user.id,
          applicationId: application.id,
          type: "completed_form_pdf",
          bytes: result.bytes,
          ext: "pdf",
          notes: generation_notes ?? null,
        });
        outputPaths.pdf = pdfDoc.id;
      }
    } else {
      // URL / pasted questions → clean Q&A PDF.
      const answerById = new Map(submission.answers.map((a) => [a.id, a.answer]));
      const pdfBytes = await renderHtmlToPdf(
        qaFormHtml({
          title: `Application form answers — ${application.job_title}`,
          subtitle: "Generated answers in a consistent Q&A format.",
          items: submission.questions.map((q) => ({
            question: q.question,
            answer: answerById.get(q.id) ?? "",
          })),
        })
      );
      const pdfDoc = await storeDocument({
        supabase,
        userId: user.id,
        applicationId: application.id,
        type: "completed_form_pdf",
        bytes: pdfBytes,
        ext: "pdf",
        notes: generation_notes ?? null,
      });
      outputPaths.pdf = pdfDoc.id;
      placements = submission.answers.map((a) => ({
        id: a.id,
        method: "empty_paragraph" as const,
        confidence: a.confidence,
      }));
      verification.questions_intact = true;
    }

    // Fold placement confidence into the stored answers (placement * content).
    const placementById = new Map(placements.map((p) => [p.id, p]));
    const answers = submission.answers.map((a) => ({
      ...a,
      confidence: a.edited
        ? Math.max(a.confidence, placementById.get(a.id)?.confidence ?? 0.5)
        : Math.min(a.confidence, placementById.get(a.id)?.confidence ?? a.confidence),
    }));

    await supabase
      .from("form_submissions")
      .update({ answers, verification, output_paths: outputPaths })
      .eq("id", submission_id);

    return NextResponse.json({
      ok: true,
      verification,
      output_paths: outputPaths,
      answers,
      placements,
    });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 500 });
  }
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
