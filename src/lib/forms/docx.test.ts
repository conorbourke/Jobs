import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { completeDocx } from "./docx";
import type { FormAnswer, FormQuestion } from "../types";

const DOC_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:t>Why do you want this role?</w:t></w:r></w:p>
<w:p></w:p>
<w:p><w:r><w:t>Full name: _____</w:t></w:r></w:p>
<w:tbl><w:tr>
<w:tc><w:p><w:r><w:t>Notice period</w:t></w:r></w:p></w:tc>
<w:tc><w:p></w:p></w:tc>
</w:tr></w:tbl>
<w:sectPr/></w:body></w:document>`;

async function makeDocx(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("word/document.xml", DOC_XML);
  return zip.generateAsync({ type: "uint8array" });
}

async function readDocXml(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  return zip.file("word/document.xml")!.async("string");
}

const questions: FormQuestion[] = [
  { id: "q1", question: "Why do you want this role?", confidence: 1 },
  { id: "q2", question: "Full name", confidence: 1 },
  { id: "q3", question: "Notice period", confidence: 1 },
  { id: "q4", question: "What is your favourite colour?", confidence: 1 },
];
const answers: FormAnswer[] = [
  { id: "q1", answer: "Because I love ops.\nAnd systems.", confidence: 0.9 },
  { id: "q2", answer: "Conor Bourke", confidence: 0.95 },
  { id: "q3", answer: "4 weeks", confidence: 0.9 },
  { id: "q4", answer: "Blue", confidence: 0.5 },
];

describe("completeDocx — layout preservation", () => {
  it("chooses the right placement strategy per question", async () => {
    const result = await completeDocx(await makeDocx(), questions, answers);
    const byId = Object.fromEntries(result.placements.map((p) => [p.id, p.method]));
    expect(byId.q1).toBe("empty_paragraph"); // blank line after the question
    expect(byId.q2).toBe("underscore"); // underscore blank in the question line
    expect(byId.q3).toBe("empty_paragraph"); // adjacent empty table cell
    expect(byId.q4).toBe("appendix"); // not found in the form
  });

  it("inserts every answer and never drops the original questions", async () => {
    const result = await completeDocx(await makeDocx(), questions, answers);
    const xml = await readDocXml(result.bytes);
    for (const q of questions) expect(xml).toContain(q.question.replace("?", ""));
    expect(xml).toContain("Conor Bourke");
    expect(xml).toContain("4 weeks");
    expect(xml).toContain("Because I love ops.");
    expect(xml).toContain("Blue");
  });

  it("never reduces the paragraph count and reports no integrity warnings", async () => {
    const original = await makeDocx();
    const originalParas = (await readDocXml(original)).match(/<w:p\b/g)?.length ?? 0;
    const result = await completeDocx(original, questions, answers);
    const completedParas = (await readDocXml(result.bytes)).match(/<w:p\b/g)?.length ?? 0;
    expect(completedParas).toBeGreaterThanOrEqual(originalParas);
    expect(result.warnings).toHaveLength(0);
  });

  it("routes unmatched questions into a clearly-labelled appendix", async () => {
    const result = await completeDocx(await makeDocx(), questions, answers);
    const xml = await readDocXml(result.bytes);
    expect(xml).toContain("Answers appendix");
    expect(xml).toContain("What is your favourite colour?");
  });
});
