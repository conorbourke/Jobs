import JSZip from "jszip";
import type { FormAnswer, FormQuestion } from "../types";

/**
 * Complete a .docx application form while preserving its layout.
 *
 * Strategy (defensive — never restructure):
 *  1. Question paragraph contains an underscore blank (___): replace the
 *     blank with the answer inside the existing run.
 *  2. The next paragraph in the document stream is empty (covers both blank
 *     lines after questions and adjacent empty table cells): insert the
 *     answer as a run inside that existing empty paragraph.
 *  3. Otherwise: insert ONE new paragraph immediately after the question.
 *  4. Question not found in the document: the answer goes to a clearly
 *     labelled "Answers appendix" at the end instead of corrupting layout.
 *
 * Existing nodes are never deleted or reordered.
 */

export interface Placement {
  id: string;
  method: "underscore" | "empty_paragraph" | "inserted_paragraph" | "appendix";
  confidence: number;
}

export interface DocxResult {
  bytes: Uint8Array;
  placements: Placement[];
  warnings: string[];
}

interface Para {
  start: number;
  end: number; // exclusive
  xml: string;
  text: string;
}

const PARA_RE = /<w:p\b[^>]*(?:\/>|>[\s\S]*?<\/w:p>)/g;

function paraText(xml: string): string {
  const texts = [...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]);
  return unescapeXml(texts.join(""));
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[_*:…]/g, " ").replace(/\s+/g, " ").trim();
}

/** Answer text as runs; newlines become explicit <w:br/>. */
function answerRun(answer: string): string {
  const parts = answer.split("\n").map((line) => `<w:t xml:space="preserve">${escapeXml(line)}</w:t>`);
  return `<w:r>${parts.join("<w:br/>")}</w:r>`;
}

function answerParagraph(answer: string): string {
  return `<w:p>${answerRun(answer)}</w:p>`;
}

export async function completeDocx(
  originalBytes: Uint8Array,
  questions: FormQuestion[],
  answers: FormAnswer[]
): Promise<DocxResult> {
  const zip = await JSZip.loadAsync(originalBytes);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("Not a valid .docx (word/document.xml missing)");
  let xml = await docFile.async("string");

  const paras: Para[] = [];
  for (const m of xml.matchAll(PARA_RE)) {
    paras.push({
      start: m.index!,
      end: m.index! + m[0].length,
      xml: m[0],
      text: paraText(m[0]),
    });
  }

  const answerById = new Map(answers.map((a) => [a.id, a]));
  const usedParas = new Set<number>();
  const placements: Placement[] = [];
  const warnings: string[] = [];
  // Edits collected then applied back-to-front so indices stay valid.
  const edits: { pos: number; remove: number; insert: string }[] = [];
  const appendix: { question: string; answer: string }[] = [];

  for (const q of questions) {
    const answer = answerById.get(q.id)?.answer ?? "";
    if (!answer.trim()) {
      placements.push({ id: q.id, method: "appendix", confidence: 0 });
      continue;
    }
    const qNorm = normalise(q.question);

    // Find the best unused paragraph containing the question text.
    let matchIdx = -1;
    let matchQuality = 0;
    for (let i = 0; i < paras.length; i++) {
      if (usedParas.has(i)) continue;
      const pNorm = normalise(paras[i].text);
      if (!pNorm) continue;
      if (pNorm === qNorm) {
        matchIdx = i;
        matchQuality = 1;
        break;
      }
      if (matchQuality < 0.8 && pNorm.includes(qNorm) && qNorm.length > 8) {
        matchIdx = i;
        matchQuality = 0.8;
      } else if (matchQuality < 0.6 && qNorm.includes(pNorm) && pNorm.length > 12) {
        matchIdx = i;
        matchQuality = 0.6;
      }
    }

    if (matchIdx === -1) {
      appendix.push({ question: q.question, answer });
      placements.push({ id: q.id, method: "appendix", confidence: 0.3 });
      continue;
    }
    usedParas.add(matchIdx);
    const para = paras[matchIdx];

    // 1. Underscore blank inside the question paragraph itself.
    const underscoreMatch = para.xml.match(/(<w:t[^>]*>)([^<]*?)(_{3,})([^<]*?)(<\/w:t>)/);
    if (underscoreMatch && underscoreMatch.index !== undefined) {
      const replaced =
        underscoreMatch[1] +
        underscoreMatch[2] +
        escapeXml(answer.replace(/\n/g, " ")) +
        underscoreMatch[4] +
        underscoreMatch[5];
      edits.push({
        pos: para.start + underscoreMatch.index,
        remove: underscoreMatch[0].length,
        insert: replaced,
      });
      placements.push({
        id: q.id,
        method: "underscore",
        confidence: Math.min(0.95, 0.9 * matchQuality + 0.1),
      });
      continue;
    }

    // 2. Next paragraph in the stream is empty (blank line or empty table cell).
    const next = paras[matchIdx + 1];
    if (next && !usedParas.has(matchIdx + 1) && next.text.trim() === "" && !next.xml.endsWith("/>")) {
      usedParas.add(matchIdx + 1);
      const closeIdx = next.xml.lastIndexOf("</w:p>");
      edits.push({
        pos: next.start + closeIdx,
        remove: 0,
        insert: answerRun(answer),
      });
      placements.push({
        id: q.id,
        method: "empty_paragraph",
        confidence: Math.min(0.9, 0.85 * matchQuality + 0.1),
      });
      continue;
    }

    // 3. Insert one new paragraph straight after the question.
    edits.push({ pos: para.end, remove: 0, insert: answerParagraph(answer) });
    placements.push({
      id: q.id,
      method: "inserted_paragraph",
      confidence: 0.65 * matchQuality,
    });
  }

  // Appendix for anything that couldn't be located.
  if (appendix.length > 0) {
    const heading = `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Answers appendix (questions not located in the form)</w:t></w:r></w:p>`;
    const items = appendix
      .map(
        (item) =>
          `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(item.question)}</w:t></w:r></w:p>${answerParagraph(item.answer)}`
      )
      .join("");
    const sectPrIdx = xml.lastIndexOf("<w:sectPr");
    const bodyCloseIdx = xml.lastIndexOf("</w:body>");
    const insertAt = sectPrIdx > -1 ? sectPrIdx : bodyCloseIdx;
    if (insertAt > -1) {
      edits.push({ pos: insertAt, remove: 0, insert: heading + items });
    } else {
      warnings.push("Could not append unplaced answers — document body close tag not found.");
    }
  }

  edits.sort((a, b) => b.pos - a.pos);
  for (const e of edits) {
    xml = xml.slice(0, e.pos) + e.insert + xml.slice(e.pos + e.remove);
  }

  zip.file("word/document.xml", xml);
  const bytes = await zip.generateAsync({ type: "uint8array" });

  // Structural verification: every original question still present, paragraph
  // count never shrinks.
  const completedParas = [...xml.matchAll(PARA_RE)];
  if (completedParas.length < paras.length) {
    warnings.push("Paragraph count decreased — manual review recommended.");
  }
  const completedText = normalise(completedParas.map((m) => paraText(m[0])).join(" "));
  for (const q of questions) {
    const qn = normalise(q.question);
    if (qn.length > 8 && !completedText.includes(qn)) {
      const placed = placements.find((p) => p.id === q.id);
      if (placed && placed.method !== "appendix") {
        warnings.push(`Question text may have been altered: "${q.question.slice(0, 60)}"`);
      }
    }
  }

  return { bytes, placements, warnings };
}
