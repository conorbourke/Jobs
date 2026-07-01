import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  extractJobFromText,
  matchOrCreateCompany,
  scrapeJobUrl,
} from "@/lib/scrape";

/**
 * Create a draft application from either:
 *  - a job URL (best-effort scrape via Browser Rendering → AI reconstruction), or
 *  - pasted job text (reliable path for bot-walled sites like LinkedIn/Indeed).
 * Scrape/extraction failure never blocks: a draft with the URL is still created.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { url, text, source } = await request.json();
  const validUrl = typeof url === "string" && /^https?:\/\//i.test(url);
  const pasted = typeof text === "string" && text.trim().length > 0;

  if (!validUrl && !pasted) {
    return NextResponse.json(
      { error: "Provide a valid http(s) URL or paste the job text." },
      { status: 400 }
    );
  }

  const scraped = pasted
    ? await extractJobFromText(supabase, user.id, text, validUrl ? url : undefined)
    : await scrapeJobUrl(supabase, user.id, url);

  const companyId = scraped.company_name
    ? await matchOrCreateCompany(supabase, user.id, scraped.company_name)
    : null;

  const { data: application, error } = await supabase
    .from("applications")
    .insert({
      user_id: user.id,
      company_id: companyId,
      job_title: scraped.job_title ?? "",
      location: scraped.location || null,
      salary_text: scraped.salary_text || null,
      job_description_text: scraped.description || null,
      job_url: validUrl ? url : null,
      status: "draft",
      source: source === "application_form" ? "application_form" : "suggested",
      application_type: source === "application_form" ? "web_form" : "email",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    ok: true,
    application,
    scraped: Object.keys(scraped).length > 0,
  });
}
