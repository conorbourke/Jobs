/**
 * Shared HTML/CSS → PDF render service.
 *
 * Pipeline choice (documented in README): Cloudflare Browser Rendering REST
 * API. It is Workers-compatible (no Puppeteer binary on Pages), renders real
 * HTML/CSS — which is what guarantees tailored CVs are pixel-identical in
 * layout to their templates — and needs only an account ID + API token.
 *
 * Every document type (CV, cover letter, brief, interview prep, completed
 * form Q&A) is just a template + data passed through this one function.
 */

export class PdfConfigError extends Error {
  constructor() {
    super(
      "PDF rendering is not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (Browser Rendering permission)."
    );
    this.name = "PdfConfigError";
  }
}

export async function renderHtmlToPdf(html: string): Promise<Uint8Array> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) throw new PdfConfigError();

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/pdf`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        html,
        pdfOptions: {
          format: "a4",
          printBackground: true,
          margin: { top: "0", bottom: "0", left: "0", right: "0" },
        },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Browser Rendering API failed (${res.status}): ${body.slice(0, 500)}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}
