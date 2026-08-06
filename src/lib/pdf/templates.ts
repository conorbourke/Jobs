import type { CvContent } from "../cv-schema";

/**
 * HTML templates for every PDF the platform produces. The AI never touches
 * layout — it only supplies content rendered into these fixed templates, so
 * a tailored CV is pixel-identical in layout to the master template.
 */

const BASE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,400;0,700;1,400;1,700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; }
  body {
    font-family: 'Lato', 'Helvetica Neue', 'Segoe UI', Arial, sans-serif;
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

// Split "email · phone · Location · linkedin.com/in/x" into its parts.
function parseContactLine(line: string): {
  email: string;
  phone: string;
  link: string;
  location: string;
} {
  const parts = line.split(/[·•|]/).map((s) => s.trim()).filter(Boolean);
  let email = "";
  let phone = "";
  let link = "";
  const rest: string[] = [];
  for (const p of parts) {
    if (!email && /@/.test(p)) email = p;
    else if (!link && /(linkedin|https?:\/\/|www\.|\.com\/)/i.test(p)) link = p;
    else if (!phone && /\+?\d[\d\s()-]{6,}\d/.test(p)) phone = p;
    else rest.push(p);
  }
  return { email, phone, link, location: rest.join(" · ") };
}

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

const CV_CSS = `
  .page { padding: 0 18mm; }
  h1, h2, h3 { font-weight: 700; }
  .cv-name { text-align: center; font-size: 16pt; font-weight: 700; margin-bottom: 2pt; }
  .cv-contact { text-align: center; font-size: 10pt; margin: 0; }
  .cv-summary { text-align: center; margin: 9pt 0 0; }
  .cv-rule { border: 0; border-top: 1px solid #cfcfcf; margin: 11pt 0; }
  .cv-section { text-align: center; font-weight: 700; font-size: 11.5pt; margin: 2pt 0 9pt; }
  .cv-job { margin-bottom: 4pt; page-break-inside: avoid; }
  .cv-job-title { font-weight: 700; }
  .cv-job-dates { font-style: italic; color: #333; margin: 0 0 5pt; }
  .cv-sublabel { font-weight: 700; margin: 7pt 0 4pt; }
  .cv-list { padding-left: 16pt; margin: 0 0 6pt; }
  .cv-list li { margin-bottom: 3pt; }
  .cv-edu { text-align: center; margin-bottom: 6pt; }
  .cv-edu .q { font-weight: 700; }
  .cv-cert { text-align: center; margin: 0 0 2pt; }
`;

export function cvHtml(cv: CvContent): string {
  const c = parseContactLine(cv.contact_line);
  const contactLines = [c.email, c.link].filter(Boolean);

  const experience = cv.experience
    .map((exp, i) => {
      // Keep each role's sections tight: at most 4 responsibilities and 2 achievements.
      const responsibilities = exp.responsibilities.slice(0, 4);
      const achievements = (exp.achievements ?? []).slice(0, 2);
      return `
      <div class="cv-job">
        <p class="cv-job-title">${esc(exp.role_title)} | ${esc(exp.company)}</p>
        <p class="cv-job-dates">${esc(exp.dates)}</p>
        <ul class="cv-list">${responsibilities.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
        ${
          achievements.length
            ? `<p class="cv-sublabel">Key Achievements:</p><ul class="cv-list">${achievements
                .map((a) => `<li>${esc(a)}</li>`)
                .join("")}</ul>`
            : ""
        }
      </div>
      ${i < cv.experience.length - 1 ? `<hr class="cv-rule">` : ""}`;
    })
    .join("");

  const body = `
    <p class="cv-name">${esc(cv.full_name)}</p>
    ${contactLines.map((l) => `<p class="cv-contact">${esc(l)}</p>`).join("")}

    ${cv.about_me ? `<p class="cv-summary">${esc(cv.about_me)}</p>` : ""}

    <hr class="cv-rule">

    ${cv.experience.length ? `<p class="cv-section">Professional Experience</p>${experience}` : ""}

    ${
      cv.education.length
        ? `<hr class="cv-rule"><p class="cv-section">Education</p>` +
          cv.education
            .map(
              (ed) => `
      <div class="cv-edu">
        <p class="q" style="margin:0;">${esc(ed.qualification)}</p>
        <p style="margin:0;">${esc(ed.institution)}${ed.dates ? `, ${esc(ed.dates)}` : ""}</p>
      </div>`
            )
            .join("")
        : ""
    }

    ${
      cv.licenses.length
        ? `<hr class="cv-rule"><p class="cv-section">Technical Skills and Qualifications</p>` +
          cv.licenses.map((l) => `<p class="cv-cert">${esc(l)}</p>`).join("")
        : ""
    }
  `;
  return page(`CV — ${cv.full_name}`, body, CV_CSS);
}

/* ---------------------------- Cover letter ---------------------------- */

const COVER_CSS = `
  .page { padding: 0 18mm; }
  .cl-head { text-align: right; margin-bottom: 18mm; }
  .cl-head p { margin: 0; }
  .cl-salutation { margin-bottom: 5mm; }
  .cl-body p { margin-bottom: 4mm; text-align: justify; }
  .cl-signoff { margin-top: 7mm; }
  .cl-signoff p { margin: 0; }
  .cl-name { font-weight: 700; }
`;

export function coverLetterHtml(opts: {
  bodyText: string; // AI-tailored body paragraphs only (no salutation/sign-off)
  senderName: string;
  addressLines?: string[]; // postal address lines under the name (right block)
  senderEmail?: string | null;
  senderPhone?: string | null;
  date: string; // e.g. "24 June 2026"
  salutation: string; // e.g. "Dear Hiring Manager,"
  signatureDataUrl?: string | null;
}): string {
  const paragraphs = opts.bodyText
    .split(/\n{2,}/)
    .map((p) => esc(p.trim()).replace(/\n/g, "<br>"))
    .filter(Boolean)
    .map((p) => `<p>${p}</p>`)
    .join("");
  const headLines = [opts.senderName, ...(opts.addressLines ?? []), opts.date]
    .filter(Boolean)
    .map((l) => `<p>${esc(l)}</p>`)
    .join("");
  const contact = [opts.senderEmail, opts.senderPhone]
    .filter(Boolean)
    .map((c) => `<p>${esc(c!)}</p>`)
    .join("");
  const body = `
    <div class="cl-head">${headLines}</div>
    <p class="cl-salutation">${esc(opts.salutation)}</p>
    <div class="cl-body">${paragraphs}</div>
    <div class="cl-signoff">
      <p>Warm regards,</p>
      <p class="cl-name">${esc(opts.senderName)}</p>
      ${
        opts.signatureDataUrl
          ? `<img src="${opts.signatureDataUrl}" alt="signature" style="max-height:20mm;max-width:55mm;display:block;margin:1mm 0 2mm;">`
          : `<div style="height:8mm;"></div>`
      }
      ${contact}
    </div>`;
  return page(`Cover letter — ${opts.senderName}`, body, COVER_CSS);
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
