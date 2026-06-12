import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { matchOrCreateCompany, scrapeJobUrl } from "@/lib/scrape";

/**
 * Paste a job URL → create a draft application pre-filled with whatever the
 * best-effort scrape extracted. Scrape failure never blocks: a blank draft
 * with the URL set is always created.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { url, source } = await request.json();
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "A valid http(s) URL is required" }, { status: 400 });
  }

  const scraped = await scrapeJobUrl(supabase, user.id, url);
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
      job_url: url,
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
