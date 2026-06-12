import { APP_NAME, SUPPORT_EMAIL } from "@/config";

export const metadata = { title: "Terms of Service" };

// DRAFT — mark for legal review before launch.
export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16 leading-relaxed text-neutral-700 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:text-neutral-900 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-neutral-900 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
      <h1>Terms of Service</h1>
      <p><em>Last updated: June 2026 · Draft pending legal review</em></p>

      <h2>The service</h2>
      <p>
        {APP_NAME} helps you organise job applications and generate documents
        with AI assistance. The service is currently free; donations are
        welcome but never required. We may introduce paid plans in future with
        clear advance notice — existing data will never be held hostage.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must provide a valid email address and keep your password secure.</li>
        <li>You are responsible for the content you store; it must be yours to store.</li>
        <li>We may suspend accounts used for abuse, scraping at scale, or unlawful content.</li>
      </ul>

      <h2>AI-generated content</h2>
      <p>
        AI outputs (CVs, cover letters, form answers, briefs) are drafts.
        Review everything before sending it to an employer — you are
        responsible for the accuracy of documents you submit.
      </p>

      <h2>Fair use</h2>
      <p>
        AI generation may be subject to reasonable limits to keep the service
        free. Current limits, if any, are shown in Settings.
      </p>

      <h2>Liability</h2>
      <p>
        The service is provided “as is”. To the maximum extent permitted by
        law, we are not liable for lost opportunities, lost data beyond our
        reasonable control, or indirect losses. Nothing in these terms limits
        liability that cannot lawfully be limited.
      </p>

      <h2>Ending your account</h2>
      <p>
        You can delete your account at any time from Settings; deletion is
        immediate and irreversible.
      </p>

      <h2>Contact</h2>
      <p>{SUPPORT_EMAIL}</p>
    </article>
  );
}
