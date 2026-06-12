import Link from "next/link";
import { APP_NAME, APP_TAGLINE } from "@/config";

const FEATURES = [
  {
    title: "One tracker for everything",
    body: "Every application, status, email thread and interview in a single sorted list — upcoming interviews always float to the top.",
    icon: "📋",
  },
  {
    title: "AI-tailored CVs & cover letters",
    body: "Paste a job description and get a CV tailored to it — in the exact layout of your master template, never a rewrite of your history.",
    icon: "✨",
  },
  {
    title: "Form filling that respects layout",
    body: "Upload a Word or PDF application form and get it back completed, with a verification preview before you download.",
    icon: "📄",
  },
  {
    title: "Interview prep on autopilot",
    body: "Schedule an interview and instantly receive a calendar invite plus a company brief and prep pack by email.",
    icon: "📅",
  },
];

const STEPS = [
  { n: "1", title: "Add your master CV", body: "Build it once in the structured editor. Role templates derive from it." },
  { n: "2", title: "Paste a job", body: "A URL or description becomes a draft application with a tailored CV, cover letter and email in one click." },
  { n: "3", title: "Track to offer", body: "Statuses, email threads, briefs and calendar invites keep every application moving." },
];

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-5xl px-6">
      {/* Hero */}
      <section className="py-24 text-center">
        <h1 className="mx-auto max-w-2xl text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl">
          {APP_TAGLINE}
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-neutral-600">
          {APP_NAME} tracks your applications, tailors your CV and cover letter
          to every job with AI, and preps you for every interview. Easy to use,
          free to try.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/signup" className="btn-primary px-6 py-3 text-base">
            Get started — it&apos;s free
          </Link>
          <Link href="/login" className="btn-secondary px-6 py-3 text-base">
            Sign in
          </Link>
        </div>
        <p className="mt-4 text-sm text-neutral-400">
          No card required. If it helps you land the job, you can buy us a coffee.
        </p>
      </section>

      {/* Features */}
      <section className="grid gap-6 pb-24 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.title} className="card p-6">
            <div className="text-2xl">{f.icon}</div>
            <h3 className="mt-3 font-semibold text-neutral-900">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">{f.body}</p>
          </div>
        ))}
      </section>

      {/* How it works */}
      <section className="pb-24">
        <h2 className="text-center text-2xl font-semibold tracking-tight">How it works</h2>
        <div className="mt-10 grid gap-8 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-accent-600 font-semibold text-white">
                {s.n}
              </div>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-neutral-600">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-14 text-center">
          <Link href="/signup" className="btn-primary px-6 py-3 text-base">
            Start tracking your search
          </Link>
        </div>
      </section>
    </div>
  );
}
