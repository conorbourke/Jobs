import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { qaFormHtml } from "../pdf/templates";
import { renderHtmlToPdf } from "../pdf/render";
import type { FormAnswer, FormQuestion } from "../types";
import type { Placement } from "./docx";

export interface PdfResult {
  bytes: Uint8Array;
  placements: Placement[];
  warnings: string[];
  originalPageCount: number;
  completedPageCount: number;
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[_*:…]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Complete a PDF application form.
 *  - AcroForm text fields: filled programmatically (highest fidelity).
 *  - Flat PDFs: locate question text positions and overlay answers in the
 *    blank region below/beside; anything low-confidence goes to a clearly
 *    labelled Q&A appendix appended to the document — the original pages are
 *    never altered beyond the overlays.
 */
export async function completePdf(
  originalBytes: Uint8Array,
  questions: FormQuestion[],
  answers: FormAnswer[]
): Promise<PdfResult> {
  const warnings: string[] = [];
  const placements: Placement[] = [];
  const answerById = new Map(answers.map((a) => [a.id, a]));
  const appendix: { question: string; answer: string }[] = [];

  const pdf = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
  const originalPageCount = pdf.getPageCount();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  // --- Route 1: AcroForm fields ---
  const form = pdf.getForm();
  const textFields = form.getFields().filter((f) => f.constructor.name === "PDFTextField");
  const placedIds = new Set<string>();

  if (textFields.length > 0) {
    for (const q of questions) {
      const answer = answerById.get(q.id)?.answer ?? "";
      if (!answer.trim()) continue;
      const qNorm = normalise(q.question);
      const field = textFields.find((f) => {
        const fNorm = normalise(f.getName());
        return (
          fNorm === qNorm ||
          (qNorm.length > 6 && fNorm.includes(qNorm)) ||
          (fNorm.length > 6 && qNorm.includes(fNorm))
        );
      });
      if (field) {
        try {
          form.getTextField(field.getName()).setText(answer);
          placedIds.add(q.id);
          placements.push({ id: q.id, method: "underscore", confidence: 0.9 });
        } catch {
          /* fall through to other routes */
        }
      }
    }
    if (placedIds.size > 0) {
      try {
        form.updateFieldAppearances(font);
      } catch {
        warnings.push("Could not refresh form field appearances.");
      }
    }
  }

  // --- Route 2: flat-PDF overlay using extracted text positions ---
  const remaining = questions.filter(
    (q) => !placedIds.has(q.id) && (answerById.get(q.id)?.answer ?? "").trim()
  );
  if (remaining.length > 0) {
    let items: { text: string; page: number; x: number; y: number; height: number }[] = [];
    try {
      const { getDocumentProxy } = await import("unpdf");
      const proxy = await getDocumentProxy(new Uint8Array(originalBytes));
      for (let p = 1; p <= proxy.numPages; p++) {
        const page = await proxy.getPage(p);
        const content = await page.getTextContent();
        for (const item of content.items as {
          str: string;
          transform: number[];
          height: number;
        }[]) {
          if (item.str?.trim()) {
            items.push({
              text: item.str,
              page: p - 1,
              x: item.transform[4],
              y: item.transform[5],
              height: item.height || 10,
            });
          }
        }
      }
    } catch (err) {
      warnings.push(
        `Text-position extraction failed (${err instanceof Error ? err.message : err}) — unplaced answers go to the appendix.`
      );
      items = [];
    }

    for (const q of remaining) {
      const answer = answerById.get(q.id)!.answer;
      const qNorm = normalise(q.question);
      // Match on the first chunk of the question (text items are fragments).
      const probe = qNorm.slice(0, 24);
      const hit = items.find((it) => normalise(it.text).includes(probe) && probe.length >= 8);

      if (hit) {
        // Is there clear space below the question line?
        const page = pdf.getPage(hit.page);
        const lineBelow = items.filter(
          (it) => it.page === hit.page && it.y < hit.y - 2 && hit.y - it.y < 26
        );
        const spaceBelow = lineBelow.length === 0 && hit.y > 40;
        const oneLine = answer.replace(/\s+/g, " ").trim();
        const fits = font.widthOfTextAtSize(oneLine, 9) < page.getWidth() - hit.x - 36;

        if (spaceBelow && fits) {
          page.drawText(oneLine, {
            x: hit.x,
            y: hit.y - 14,
            size: 9,
            font,
            color: rgb(0.1, 0.1, 0.4),
          });
          placedIds.add(q.id);
          placements.push({ id: q.id, method: "empty_paragraph", confidence: 0.6 });
          continue;
        }
      }
      // Low confidence → appendix, never corrupt the layout.
      appendix.push({ question: q.question, answer });
      placements.push({ id: q.id, method: "appendix", confidence: 0.3 });
    }
  }

  // --- Appendix pages (rendered via the shared HTML→PDF pipeline) ---
  if (appendix.length > 0) {
    try {
      const appendixPdfBytes = await renderHtmlToPdf(
        qaFormHtml({
          title: "Answers appendix",
          subtitle:
            "These answers could not be placed in the original form without risking its layout — copy them in manually.",
          items: appendix,
        })
      );
      const appendixPdf = await PDFDocument.load(appendixPdfBytes);
      const pages = await pdf.copyPages(appendixPdf, appendixPdf.getPageIndices());
      pages.forEach((p) => pdf.addPage(p));
    } catch (err) {
      warnings.push(
        `Could not render the answers appendix: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  const completedPageCount = pdf.getPageCount();
  const bytes = await pdf.save();
  return { bytes, placements, warnings, originalPageCount, completedPageCount };
}
