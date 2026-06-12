import type { CvContent } from "../cv-schema";

/**
 * HTML templates for every PDF the platform produces. The AI never touches
 * layout — it only supplies content rendered into these fixed templates, so
 * a tailored CV is pixel-identical in layout to the master template.
 */

const BASE_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #1a1a1a;
    font-size: 10.5pt;
    line-height: 1.45;
  }
  .page { padding: 18mm 16mm; }
  h1 { font-size: 20pt; font-weight: 600; letter-spacing: -0.01em; }
  h2 {
    font-size: 11pt; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.06em; color: #4f46e5;
    border-bottom: 1px solid #e5e5e5; padding-bottom: 3pt;
    margin: 14pt 0 8pt;
  }
  p { margin-bottom: 6pt; }
  ul { padding-left: 14pt; margin-bottom: 8pt; }
  li { margin-bottom: 3pt; }
  .muted { color: #6b6b6b; }
  .small { font-size: 9pt; }
`;

function esc(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function page(title: string, body: string, extraCss = ""): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${BASE_CSS}${extraCss}</style></head>
<body><div class="page">${body}</div></body></html>`;
}

/* ------------------------------- CV ------------------------------- */

export function cvHtml(cv: CvContent): string {
  const body = `
    <header>
      <h1>${esc(cv.full_name)}</h1>
      <p style="font-size:12pt;color:#4f46e5;font-weight:500;margin-top:2pt;">${esc(cv.role_title)}</p>
      <p class="muted small">${esc(cv.contact_line)}</p>
    </header>

    ${cv.about_me ? `<h2>About Me</h2><p>${esc(cv.about_me)}</p>` : ""}

    ${
      cv.experience.length
        ? `<h2>Experience</h2>` +
          cv.experience
            .map(
              (exp) => `
      <div style="margin-bottom:10pt;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;">
          <strong>${esc(exp.role_title)} · ${esc(exp.company)}</strong>
          <span class="muted small">${esc(exp.dates)}</span>
        </div>
        <ul>${exp.responsibilities.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
      </div>`
            )
            .join("")
        : ""
    }

    ${
      cv.licenses.length
        ? `<h2>Licenses &amp; Qualifications</h2><ul>${cv.licenses
            .map((l) => `<li>${esc(l)}</li>`)
            .join("")}</ul>`
        : ""
    }

    ${
      cv.education.length
        ? `<h2>Education</h2>` +
          cv.education
            .map(
              (ed) => `
      <div style="display:flex;justify-content:space-between;margin-bottom:4pt;">
        <span><strong>${esc(ed.qualification)}</strong> — ${esc(ed.institution)}</span>
        <span class="muted small">${esc(ed.dates)}</span>
      </div>`
            )
            .join("")
        : ""
    }
  `;
  return page(`CV — ${cv.full_name}`, body);
}

/* ---------------------------- Cover letter ---------------------------- */

export function coverLetterHtml(opts: {
  bodyText: string; // merge fields already applied
  senderName: string;
  signatureDataUrl?: string | null;
}): string {
  const paragraphs = opts.bodyText
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const body = `
    <div style="margin-top:6mm;">${paragraphs}</div>
    <div style="margin-top:14mm;">
      ${
        opts.signatureDataUrl
          ? `<img src="${opts.signatureDataUrl}" alt="signature" style="max-height:22mm;max-width:60mm;display:block;margin-bottom:3mm;">`
          : ""
      }
      <p>${esc(opts.senderName)}</p>
    </div>`;
  return page(`Cover letter — ${opts.senderName}`, body);
}

/* ------------------------- Brief / prep (AI text) ------------------------- */

export interface BriefSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

export function briefHtml(opts: {
  title: string;
  subtitle: string;
  sections: BriefSection[];
}): string {
  const body = `
    <h1 style="font-size:16pt;">${esc(opts.title)}</h1>
    <p class="muted" style="margin-top:2pt;">${esc(opts.subtitle)}</p>
    ${opts.sections
      .map(
        (s) => `
      <h2>${esc(s.heading)}</h2>
      ${(s.paragraphs ?? []).map((p) => `<p>${esc(p)}</p>`).join("")}
      ${
        s.bullets?.length
          ? `<ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`
          : ""
      }`
      )
      .join("")}
    <p class="muted small" style="margin-top:12pt;">Generated ${new Date().toLocaleDateString("en-GB")} — verify key facts before the interview.</p>
  `;
  return page(opts.title, body);
}

/* --------------------------- Q&A form output --------------------------- */

export function qaFormHtml(opts: {
  title: string;
  subtitle: string;
  items: { question: string; answer: string }[];
}): string {
  const body = `
    <h1 style="font-size:15pt;">${esc(opts.title)}</h1>
    <p class="muted" style="margin-top:2pt;margin-bottom:10pt;">${esc(opts.subtitle)}</p>
    ${opts.items
      .map(
        (item, i) => `
      <div style="margin-bottom:10pt;page-break-inside:avoid;">
        <p style="font-weight:600;color:#333;">${i + 1}. ${esc(item.question)}</p>
        <p style="margin-left:0;white-space:pre-wrap;">${esc(item.answer)}</p>
      </div>`
      )
      .join("")}
  `;
  return page(opts.title, body);
}
