import { Resend } from "resend";
import { APP_NAME } from "@/config";

export interface EmailAttachment {
  filename: string;
  content: Uint8Array | string; // bytes or string content
  contentType?: string;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");
  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM ?? `${APP_NAME} <onboarding@resend.dev>`;

  const { error } = await resend.emails.send({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    attachments: opts.attachments?.map((a) => ({
      filename: a.filename,
      content: typeof a.content === "string" ? a.content : Buffer.from(a.content),
      contentType: a.contentType,
    })),
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}
