/**
 * Extract plain text from an uploaded PDF / Word / text file. Shared by the
 * job-description paste-in (/api/extract-text) and job attachments
 * (/api/attachments). Throws UnsupportedFileError for unknown types.
 */
export class UnsupportedFileError extends Error {
  constructor(message = "Unsupported file type — use PDF, .docx or .txt") {
    super(message);
    this.name = "UnsupportedFileError";
  }
}

export async function extractFileText(
  filename: string,
  bytes: Uint8Array
): Promise<string> {
  const name = filename.toLowerCase();

  if (name.endsWith(".pdf")) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return (text as string).trim();
  }
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return result.value.trim();
  }
  if (name.endsWith(".txt")) {
    return new TextDecoder().decode(bytes).trim();
  }
  throw new UnsupportedFileError();
}
