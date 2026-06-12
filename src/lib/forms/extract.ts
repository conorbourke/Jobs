import type { SupabaseClient } from "@supabase/supabase-js";
import { aiJson } from "../ai";
import { htmlToText } from "../scrape";
import type { Application, CvTemplate, FormAnswer, FormQuestion } from "../types";

/* --------------------------- question extraction --------------------------- */

export async function extractQuestionsFromText(
  supabase: SupabaseClient,
  userId: string,
  text: string
): Promise<FormQuestion[]> {
  const { questions } = await aiJson<{ questions: { question: string; confidence: number }[] }>({
    supabase,
    userId,
    feature: "form_question_extraction",
    system:
      'Extract every applicant-facing question/field from this application form text. Return JSON {"questions":[{"question":string,"confidence":number}]}. Include free-text questions and labelled fields (e.g. "Why do you want this role?", "Notice period"). Exclude pure instructions, headings and legal text. confidence 0-1: how sure you are this is a question the applicant must answer. Keep each question\'s wording EXACTLY as it appears (trim whitespace only) — exact wording is used to locate it in the document.',
    user: text.slice(0, 30000),
  });
  return questions.map((q, i) => ({
    id: `q${i + 1}`,
    question: q.question.trim(),
    confidence: clamp01(q.confidence),
  }));
}

export async function extractQuestionsFromUrl(
  supabase: SupabaseClient,
  userId: string,
  url: string
): Promise<FormQuestion[]> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Could not fetch the form page (HTTP ${res.status})`);
  const text = htmlToText(await res.text());
  if (!text) throw new Error("The page had no readable text");
  return extractQuestionsFromText(supabase, userId, text);
}

/* ------------------------------ answering ------------------------------ */

export async function generateAnswers(opts: {
  supabase: SupabaseClient;
  userId: string;
  application: Application;
  questions: FormQuestion[];
  userNotes?: string;
  regenerationComment?: string;
  previousAnswers?: FormAnswer[];
}): Promise<FormAnswer[]> {
  const { supabase, userId } = opts;

  const { data: master } = await supabase
    .from("cv_templates")
    .select("*")
    .eq("is_master", true)
    .maybeSingle<CvTemplate>();

  const regenContext =
    opts.regenerationComment && opts.previousAnswers
      ? `\n\nPREVIOUS ANSWERS (user wants changes):\n${JSON.stringify(opts.previousAnswers)}\nCHANGE REQUEST: ${opts.regenerationComment}`
      : "";

  const { answers } = await aiJson<{
    answers: { id: string; answer: string; confidence: number }[];
  }>({
    supabase,
    userId,
    feature: "form_answers",
    system: `You complete job application forms on behalf of a candidate. Answer ONLY from the candidate's real CV data and notes provided — never invent employment history, qualifications, references, ID numbers, or personal data you don't have. If a question needs information you don't have (e.g. National Insurance number, referee contact details), answer with a clearly-bracketed placeholder like "[TO FILL: National Insurance number]" and set confidence low.

Return JSON {"answers":[{"id":string,"answer":string,"confidence":number}]} — one entry per question id, in the same order. Answers should be concise and form-appropriate (single line for short fields, a paragraph for "why do you want this role" style questions). UK English. confidence 0-1 reflects how well-grounded the answer is in the provided data.`,
    user: `QUESTIONS:\n${JSON.stringify(opts.questions)}\n\nJOB:\n${[
      `Title: ${opts.application.job_title}`,
      opts.application.location ? `Location: ${opts.application.location}` : "",
      opts.application.job_description_text
        ? `Description: ${opts.application.job_description_text.slice(0, 6000)}`
        : "",
    ]
      .filter(Boolean)
      .join("\n")}\n\nCANDIDATE CV (structured):\n${JSON.stringify(master?.content ?? {})}\n${
      opts.userNotes ? `\nCANDIDATE NOTES: ${opts.userNotes}` : ""
    }${regenContext}`,
  });

  // Guarantee one answer per question, aligned by id.
  return opts.questions.map((q) => {
    const a = answers.find((x) => x.id === q.id);
    return {
      id: q.id,
      answer: a?.answer ?? "",
      confidence: clamp01(a?.confidence ?? 0),
    };
  });
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}
