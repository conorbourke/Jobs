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

import { CLOUDFLARE_ACCOUNT_ID } from "@/config";

export class PdfConfigError extends Error {
  constructor() {
    super(
      "PDF rendering is not configured. Set the CLOUDFLARE_API_TOKEN secret (Browser Rendering permission) on the Worker."
    );
    this.name = "PdfConfigError";
  }
}

/** Cloudflare Browser Rendering is rate-limited (esp. on the free tier). */
export class PdfRateLimitError extends Error {
  constructor() {
    super(
      "The PDF service is busy right now (Cloudflare Browser Rendering rate limit). Please wait a minute and try again."
    );
    this.name = "PdfRateLimitError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function renderHtmlToPdf(html: string): Promise<Uint8Array> {
  const accountId = CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) throw new PdfConfigError();

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/pdf`;
  const body = JSON.stringify({
    html,
    pdfOptions: {
      format: "a4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    },
  });

  // Browser Rendering trips rate limits easily on the free tier, and each
  // generation renders two PDFs (CV + cover). Retry transient 429/5xx with
  // exponential backoff so a momentary limit doesn't fail the whole run.
  const MAX_ATTEMPTS = 4;
  let lastStatus = 0;
  let lastBody = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
    });
    if (res.ok) return new Uint8Array(await res.arrayBuffer());

    lastStatus = res.status;
    lastBody = (await res.text().catch(() => "")).slice(0, 500);

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === MAX_ATTEMPTS) break;
    await sleep(Math.min(2000 * 2 ** (attempt - 1), 8000)); // 2s, 4s, 8s
  }

  if (lastStatus === 429) throw new PdfRateLimitError();
  throw new Error(`Browser Rendering API failed (${lastStatus}): ${lastBody}`);
}
