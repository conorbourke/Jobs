import type { SupabaseClient } from "@supabase/supabase-js";
import { aiJson } from "./ai";
import { mergeWithMaster, type CvContent } from "./cv-schema";
import { renderHtmlToPdf } from "./pdf/render";
import {
  briefHtml,
  coverLetterHtml,
  cvHtml,
  type BriefSection,
} from "./pdf/templates";
import type {
  Application,
  Company,
  CoverTemplate,
  CvTemplate,
  DocumentType,
  GeneratedDocument,
} from "./types";

/* --------------------------- versioned storage --------------------------- */

/**
 * Store a generated document as a NEW version — documents are never
 * overwritten; every regeneration adds a row.
 */
export async function storeDocument(opts: {
  supabase: SupabaseClient;
  userId: string;
  applicationId: string;
  type: DocumentType;
  bytes: Uint8Array;
  ext: "pdf" | "docx";
  notes?: string | null;
  meta?: Record<string, unknown>;
}): Promise<GeneratedDocument> {
  const { supabase, userId, applicationId, type } = opts;

  const { data: latest } = await supabase
    .from("generated_documents")
    .select("version")
    .eq("application_id", applicationId)
    .eq("type", type)
    .order("version", { ascending: false })
    .limit(1);
  const version = (latest?.[0]?.version ?? 0) + 1;

  const contentType =
    opts.ext === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const path = `${userId}/${applicationId}/${type}-v${version}.${opts.ext}`;

  const { error: uploadError } = await supabase.storage
    .from("generated")
    .upload(path, opts.bytes.slice().buffer as ArrayBuffer, { contentType });
  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  const { data: doc, error } = await supabase
    .from("generated_documents")
    .insert({
      user_id: userId,
      application_id: applicationId,
      type,
      version,
      storage_path: path,
      generation_notes: opts.notes ?? null,
      meta: opts.meta ?? {},
    })
    .select()
    .single();
  if (error) throw new Error(`Document insert failed: ${error.message}`);
  return doc as GeneratedDocument;
}

export async function downloadDocumentBytes(
  supabase: SupabaseClient,
  doc: GeneratedDocument
): Promise<Uint8Array> {
  const { data, error } = await supabase.storage
    .from("generated")
    .download(doc.storage_path);
  if (error || !data) throw new Error(`Download failed: ${error?.message}`);
  return new Uint8Array(await data.arrayBuffer());
}

/* ----------------------------- brief / prep ----------------------------- */

interface AppContext {
  application: Application;
  company: Company | null;
}

async function loadAppContext(
  supabase: SupabaseClient,
  applicationId: string
): Promise<AppContext> {
  const { data: application } = await supabase
    .from("applications")
    .select("*")
    .eq("id", applicationId)
    .single<Application>();
  if (!application) throw new Error("Application not found");
  let company: Company | null = null;
  if (application.company_id) {
    const { data } = await supabase
      .from("companies")
      .select("*")
      .eq("id", application.company_id)
      .single<Company>();
    company = data;
  }
  return { application, company };
}

function contextPrompt(ctx: AppContext): string {
  return [
    `Job title: ${ctx.application.job_title}`,
    `Company: ${ctx.company?.name ?? "Unknown"}`,
    ctx.company?.recruitment_url ? `Company recruitment page: ${ctx.company.recruitment_url}` : "",
    ctx.application.location ? `Location: ${ctx.application.location}` : "",
    ctx.application.salary_text ? `Salary: ${ctx.application.salary_text}` : "",
    ctx.application.job_url ? `Job URL: ${ctx.application.job_url}` : "",
    ctx.application.notes ? `My notes: ${ctx.application.notes}` : "",
    ctx.application.job_description_text
      ? `Job description:\n${ctx.application.job_description_text}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateCompanyBrief(
  supabase: SupabaseClient,
  userId: string,
  applicationId: string
): Promise<GeneratedDocument> {
  const ctx = await loadAppContext(supabase, applicationId);
  const { sections } = await aiJson<{ sections: BriefSection[] }>({
    supabase,
    userId,
    feature: "company_brief",
    system:
      'You write concise company & role briefs for a job candidate. Return JSON: {"sections":[{"heading":string,"paragraphs":[string],"bullets":[string]}]}. Sections to cover: "Company overview" (what they do, size/market position as far as can be inferred — say when you are inferring), "The role" (what the job actually involves), "Why this role fits" (angles the candidate can use), "Key things to verify" (facts to check before interview). Be specific to the provided context; do not invent precise figures.',
    user: contextPrompt(ctx),
  });

  const html = briefHtml({
    title: `Company & role brief — ${ctx.company?.name ?? ctx.application.job_title}`,
    subtitle: `${ctx.application.job_title}${ctx.company ? ` at ${ctx.company.name}` : ""}`,
    sections,
  });
  const pdf = await renderHtmlToPdf(html);
  return storeDocument({
    supabase,
    userId,
    applicationId,
    type: "company_brief",
    bytes: pdf,
    ext: "pdf",
  });
}

export async function generateInterviewPrep(
  supabase: SupabaseClient,
  userId: string,
  applicationId: string
): Promise<GeneratedDocument> {
  const ctx = await loadAppContext(supabase, applicationId);

  // Include the email thread — it often contains interview specifics.
  const { data: emails } = await supabase
    .from("application_emails")
    .select("direction, body_text")
    .eq("application_id", applicationId)
    .order("pasted_at");
  const thread = (emails ?? [])
    .map((e) => `${e.direction === "from_me" ? "ME" : "COMPANY"}: ${e.body_text}`)
    .join("\n---\n");

  const { sections } = await aiJson<{ sections: BriefSection[] }>({
    supabase,
    userId,
    feature: "interview_prep",
    system:
      'You prepare candidates for job interviews. Return JSON: {"sections":[{"heading":string,"paragraphs":[string],"bullets":[string]}]}. Sections: "Likely interview questions" (8-12, tailored to the job description), "Strong answer angles" (how to frame experience for the top 4-5 questions), "Questions to ask them" (5-6 sharp ones), "Logistics & reminders" (anything from the email thread: names, times, format).',
    user: contextPrompt(ctx) + (thread ? `\n\nEmail thread:\n${thread}` : ""),
  });

  const html = briefHtml({
    title: `Interview prep — ${ctx.application.job_title}`,
    subtitle: ctx.company ? `at ${ctx.company.name}` : "",
    sections,
  });
  const pdf = await renderHtmlToPdf(html);
  return storeDocument({
    supabase,
    userId,
    applicationId,
    type: "interview_prep",
    bytes: pdf,
    ext: "pdf",
  });
}

/* --------------------------- CV + cover + email --------------------------- */

export interface CvCoverResult {
  cv: GeneratedDocument;
  cover: GeneratedDocument;
  email_subject: string;
  email_body: string;
}

interface AiCvOutput {
  role_title: string;
  about_me: string;
  licenses: string[];
  experience_overrides: { role_title: string; responsibilities: string[] }[];
  cover_letter_body: string;
  email_subject: string;
  email_body: string;
}

export async function generateCvAndCover(opts: {
  supabase: SupabaseClient;
  userId: string;
  applicationId: string;
  cvTemplateId: string;
  userNotes?: string;
  regenerationComment?: string;
  attachPortfolio: boolean;
}): Promise<CvCoverResult> {
  const { supabase, userId, applicationId } = opts;
  const ctx = await loadAppContext(supabase, applicationId);

  // Selected template (master or role template) + the master for fixed slots.
  const { data: template } = await supabase
    .from("cv_templates")
    .select("*")
    .eq("id", opts.cvTemplateId)
    .single<CvTemplate>();
  if (!template) throw new Error("CV template not found");
  const { data: master } = await supabase
    .from("cv_templates")
    .select("*")
    .eq("is_master", true)
    .single<CvTemplate>();
  if (!master) throw new Error("No master CV template — create one in CV Templates first.");

  const { data: coverTemplate } = await supabase
    .from("cover_templates")
    .select("*")
    .maybeSingle<CoverTemplate>();

  // For regeneration: feed the previous version's content back to the model.
  let previousContext = "";
  if (opts.regenerationComment) {
    const { data: prev } = await supabase
      .from("generated_documents")
      .select("meta")
      .eq("application_id", applicationId)
      .eq("type", "cv")
      .order("version", { ascending: false })
      .limit(1);
    const prevContent = (prev?.[0]?.meta as { cv_content?: CvContent })?.cv_content;
    if (prevContent) {
      previousContext = `\n\nPREVIOUS VERSION (the user wants changes to this):\n${JSON.stringify(prevContent)}\n\nUSER'S CHANGE REQUEST: ${opts.regenerationComment}`;
    } else {
      previousContext = `\n\nUSER'S CHANGE REQUEST: ${opts.regenerationComment}`;
    }
  }

  const portfolioInstruction = opts.attachPortfolio
    ? 'The candidate is attaching a portfolio PDF/slide deck of websites and admin systems they have built. Mention this attachment naturally in BOTH the cover letter and the email body (e.g. "I have also attached a portfolio of websites and admin systems I have built").'
    : "Do NOT mention any portfolio or slide deck anywhere — not in the cover letter, not in the email.";

  const out = await aiJson<AiCvOutput>({
    supabase,
    userId,
    feature: opts.regenerationComment ? "cv_cover_regeneration" : "cv_cover_generation",
    system: `You tailor CVs and cover letters to job descriptions. You NEVER invent employment history, employers, dates, education or qualifications the candidate does not have. You only rewrite the variable sections.

Return JSON exactly:
{
 "role_title": string,                  // headline title tuned to the job
 "about_me": string,                    // 3-5 sentence professional summary tuned to the job
 "licenses": [string],                  // reordered/filtered from the candidate's real licenses & qualifications; never add new ones
 "experience_overrides": [              // SAME length & order as the candidate's experience array
   {"role_title": string, "responsibilities": [string]}  // rephrase/reprioritise real responsibilities for relevance; never fabricate
 ],
 "cover_letter_body": string,           // full cover letter body, paragraphs separated by blank lines; no salutation placeholders other than what the template provides; professional, specific, UK English
 "email_subject": string,               // e.g. "Application for <role> — <name>"
 "email_body": string                   // short email: please find attached CV and cover letter, 3-6 sentences, UK English
}

${portfolioInstruction}`,
    user: `JOB CONTEXT:\n${contextPrompt(ctx)}\n\nCANDIDATE'S SELECTED CV TEMPLATE ("${template.label}"):\n${JSON.stringify(template.content)}\n\nMASTER CV (fixed facts — companies, dates, education are immutable):\n${JSON.stringify(master.content)}\n\n${opts.userNotes ? `SPECIFIC INFORMATION FROM THE CANDIDATE TO USE: ${opts.userNotes}` : ""}${previousContext}`,
  });

  // Structurally enforce fixed slots: merge AI output over the master.
  const cvContent = mergeWithMaster(master.content, {
    role_title: out.role_title,
    about_me: out.about_me,
    licenses: out.licenses,
    experience_overrides: out.experience_overrides,
  });

  // Render CV through the exact same pipeline as the templates themselves.
  const cvPdf = await renderHtmlToPdf(cvHtml(cvContent));

  // Cover letter: apply merge fields from the user's cover template flow.
  // {{body}} marks where the AI-tailored letter goes; without it the tailored
  // body is appended after the template's framing text.
  let coverBody = out.cover_letter_body;
  if (coverTemplate?.body?.trim()) {
    const hasBodyField = /\{\{\s*body\s*\}\}/.test(coverTemplate.body);
    const templateText = hasBodyField
      ? coverTemplate.body
      : coverTemplate.body + "\n\n{{body}}";
    coverBody = applyMergeFields(templateText, {
      name: master.content.full_name,
      company: ctx.company?.name ?? "",
      role: ctx.application.job_title,
      date: new Date().toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
      body: out.cover_letter_body,
    });
  }

  let signatureDataUrl: string | null = null;
  if (coverTemplate?.signature_image_path) {
    const { data: sig } = await supabase.storage
      .from("signatures")
      .download(coverTemplate.signature_image_path);
    if (sig) {
      const buf = Buffer.from(await sig.arrayBuffer());
      const ext = coverTemplate.signature_image_path.split(".").pop()?.toLowerCase();
      const mime = ext === "png" ? "image/png" : "image/jpeg";
      signatureDataUrl = `data:${mime};base64,${buf.toString("base64")}`;
    }
  }

  const coverPdf = await renderHtmlToPdf(
    coverLetterHtml({
      bodyText: coverBody,
      senderName: master.content.full_name,
      signatureDataUrl,
    })
  );

  const sharedMeta = {
    email_subject: out.email_subject,
    email_body: out.email_body,
  };
  const cvDoc = await storeDocument({
    supabase,
    userId,
    applicationId,
    type: "cv",
    bytes: cvPdf,
    ext: "pdf",
    notes: opts.regenerationComment ?? null,
    meta: { ...sharedMeta, cv_content: cvContent, template_label: template.label },
  });
  const coverDoc = await storeDocument({
    supabase,
    userId,
    applicationId,
    type: "cover_letter",
    bytes: coverPdf,
    ext: "pdf",
    notes: opts.regenerationComment ?? null,
    meta: sharedMeta,
  });

  return {
    cv: cvDoc,
    cover: coverDoc,
    email_subject: out.email_subject,
    email_body: out.email_body,
  };
}

function applyMergeFields(
  template: string,
  fields: Record<string, string>
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) =>
    fields[key] !== undefined ? fields[key] : `{{${key}}}`
  );
}
