import { APP_NAME, SUPPORT_EMAIL } from "@/config";

export const metadata = { title: "Privacy Policy" };

// DRAFT — mark for legal review before launch.
export default function PrivacyPage() {
  return (
    <article className="prose-sm mx-auto max-w-3xl px-6 py-16 leading-relaxed text-neutral-700 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:text-neutral-900 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-neutral-900 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
      <h1>Privacy Policy</h1>
      <p><em>Last updated: June 2026 · Draft pending legal review</em></p>

      <h2>Who we are</h2>
      <p>
        {APP_NAME} is a job application management tool. For data protection
        purposes the controller is the operator of {APP_NAME}, contactable at{" "}
        {SUPPORT_EMAIL}.
      </p>

      <h2>What we collect and why</h2>
      <ul>
        <li><strong>Account data</strong> — your email address and chosen name, to operate your account (legal basis: contract).</li>
        <li><strong>Content you add</strong> — applications, companies, CV content, cover letters, pasted emails, uploaded forms and generated documents. Stored solely to provide the service to you (contract).</li>
        <li><strong>AI usage records</strong> — feature, model, token counts and cost estimates for each AI generation, to show you your usage and to operate fair limits (legitimate interest).</li>
      </ul>
      <p>
        We practise data minimisation: nothing beyond the above is collected.
        No analytics or tracking cookies are used — only the strictly-necessary
        session cookie that keeps you signed in.
      </p>

      <h2>AI processing</h2>
      <p>
        When you use an AI feature, the relevant content (e.g. your CV and a
        job description) is sent to our AI provider (OpenAI) to generate the
        output you requested. It is not used to train models under our
        agreement with the provider.
      </p>

      <h2>Where your data lives</h2>
      <p>
        Data is stored with Supabase in the EU region. Transactional email is
        sent via Resend using EU sending where available.
      </p>

      <h2>Retention</h2>
      <p>
        Your data is kept while your account exists. Deleting your account
        permanently removes all your data, including stored files, immediately.
      </p>

      <h2>Your rights (UK GDPR)</h2>
      <ul>
        <li><strong>Access / portability</strong> — Settings → Download my data exports everything as JSON plus your files.</li>
        <li><strong>Erasure</strong> — Settings → Delete account hard-deletes your account and all associated data.</li>
        <li>Rectification, restriction and objection — contact {SUPPORT_EMAIL}.</li>
        <li>You may complain to the ICO (ico.org.uk).</li>
      </ul>

      <h2>Contact</h2>
      <p>{SUPPORT_EMAIL}</p>
    </article>
  );
}
