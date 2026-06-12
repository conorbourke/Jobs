import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_NAME } from "@/config";
import {
  downloadDocumentBytes,
  generateCompanyBrief,
  generateInterviewPrep,
} from "./documents";
import { sendEmail, type EmailAttachment } from "./email";
import { buildIcs } from "./ics";
import { formatDateTime } from "./labels";
import type {
  Application,
  Company,
  GeneratedDocument,
  Interview,
  Profile,
} from "./types";

export interface ScheduleOutcome {
  briefs_generated: boolean;
  ics_sent: boolean;
  warnings: string[];
}

/**
 * Post-scheduling pipeline (§6): generate the company brief + interview prep
 * PDFs (if not already generated for this stage), then email the user a
 * METHOD:REQUEST .ics invite with both PDFs attached, and stamp ics_sent_at.
 * Each step is best-effort: a failure is reported as a warning, never an
 * exception — scheduling itself must always succeed.
 */
export async function processScheduledInterview(
  supabase: SupabaseClient,
  userId: string,
  interview: Interview
): Promise<ScheduleOutcome> {
  const warnings: string[] = [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single<Profile>();
  const settings = profile?.settings ?? {};
  const autoBriefs = settings.auto_briefs_on_schedule !== false;
  const icsEnabled = settings.ics_enabled !== false;

  const { data: application } = await supabase
    .from("applications")
    .select("*")
    .eq("id", interview.application_id)
    .single<Application>();
  if (!application) return { briefs_generated: false, ics_sent: false, warnings: ["Application missing"] };

  let company: Company | null = null;
  if (application.company_id) {
    const { data } = await supabase
      .from("companies")
      .select("*")
      .eq("id", application.company_id)
      .single<Company>();
    company = data;
  }

  // 1. Briefs — reuse existing versions if generated since the last interview
  // was scheduled (i.e. "for this stage"); otherwise generate fresh.
  let brief: GeneratedDocument | null = null;
  let prep: GeneratedDocument | null = null;
  if (autoBriefs) {
    const { data: existingDocs } = await supabase
      .from("generated_documents")
      .select("*")
      .eq("application_id", application.id)
      .in("type", ["company_brief", "interview_prep"])
      .gt("created_at", interviewStageCutoff(interview))
      .order("version", { ascending: false })
      .returns<GeneratedDocument[]>();
    brief = existingDocs?.find((d) => d.type === "company_brief") ?? null;
    prep = existingDocs?.find((d) => d.type === "interview_prep") ?? null;

    try {
      if (!brief) brief = await generateCompanyBrief(supabase, userId, application.id);
    } catch (err) {
      warnings.push(`Company brief generation failed: ${msg(err)}`);
    }
    try {
      if (!prep) prep = await generateInterviewPrep(supabase, userId, application.id);
    } catch (err) {
      warnings.push(`Interview prep generation failed: ${msg(err)}`);
    }
    if (brief || prep) {
      await supabase
        .from("interviews")
        .update({ briefs_generated: true })
        .eq("id", interview.id);
    }
  }

  // 2. .ics invite email with PDFs attached.
  let icsSent = false;
  const toEmail = profile?.notification_email;
  if (icsEnabled && toEmail) {
    try {
      const summary = `Interview: ${application.job_title}${company ? ` at ${company.name}` : ""}`;
      const ics = buildIcs({
        uid: `${interview.id}@${APP_NAME}`,
        start: new Date(interview.scheduled_at),
        summary,
        description: [
          interview.type ? `Type: ${interview.type}` : "",
          application.job_url ? `Job: ${application.job_url}` : "",
          `Managed in ${APP_NAME}`,
        ]
          .filter(Boolean)
          .join("\n"),
        location: interview.location_text ?? undefined,
        attendeeEmail: toEmail,
        attendeeName: profile?.name || toEmail,
      });

      const attachments: EmailAttachment[] = [
        {
          filename: "invite.ics",
          content: ics,
          contentType: "text/calendar; method=REQUEST; charset=UTF-8",
        },
      ];
      for (const [doc, filename] of [
        [brief, "company-brief.pdf"],
        [prep, "interview-prep.pdf"],
      ] as const) {
        if (doc) {
          try {
            attachments.push({
              filename,
              content: await downloadDocumentBytes(supabase, doc),
              contentType: "application/pdf",
            });
          } catch {
            warnings.push(`Could not attach ${filename}`);
          }
        }
      }

      await sendEmail({
        to: toEmail,
        subject: summary,
        html: `<p>Your interview is scheduled for <strong>${formatDateTime(
          interview.scheduled_at
        )}</strong>${interview.location_text ? ` — ${escapeHtml(interview.location_text)}` : ""}.</p>
<p>The calendar invite is attached${brief || prep ? ", along with your company brief and interview prep pack" : ""}. Good luck!</p>
<p style="color:#999;font-size:12px;">Sent by ${APP_NAME}</p>`,
        attachments,
      });

      await supabase
        .from("interviews")
        .update({ ics_sent_at: new Date().toISOString() })
        .eq("id", interview.id);
      icsSent = true;
    } catch (err) {
      warnings.push(`Invite email failed: ${msg(err)}`);
    }
  } else if (icsEnabled && !toEmail) {
    warnings.push("No notification email set in Settings — invite not sent.");
  }

  return { briefs_generated: !!(brief || prep), ics_sent: icsSent, warnings };
}

/** Documents older than ~30 days before this interview belong to a previous stage. */
function interviewStageCutoff(interview: Interview): string {
  const created = new Date(interview.created_at ?? Date.now());
  created.setDate(created.getDate() - 30);
  return created.toISOString();
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
