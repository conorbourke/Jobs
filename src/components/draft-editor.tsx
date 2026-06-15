"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Application,
  Company,
  CvTemplate,
  GeneratedDocument,
} from "@/lib/types";

export interface CvCoverOutput {
  cvDocId: string;
  coverDocId: string;
  emailSubject: string;
  emailBody: string;
}

/**
 * Draft application editor shared by Suggested Jobs and Application Forms:
 * all fields, JD paste/upload, CV+cover generation with template dropdown,
 * notes, portfolio tickbox, regenerate-with-comment, and submit-to-tracker.
 */
export function DraftEditor({
  application,
  companies,
  cvTemplates,
  onChanged,
  onClose,
  children,
}: {
  application: Application;
  companies: Company[];
  cvTemplates: CvTemplate[];
  onChanged: () => void;
  onClose?: () => void;
  children?: React.ReactNode; // extra sections (form completion on Forms tab)
}) {
  const [app, setApp] = useState(application);
  const [saved, setSaved] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveFields(extra: Partial<Application> = {}) {
    const supabase = createClient();
    const merged = { ...app, ...extra };
    const { error } = await supabase
      .from("applications")
      .update({
        job_title: merged.job_title,
        company_id: merged.company_id,
        salary_text: merged.salary_text,
        location: merged.location,
        notes: merged.notes,
        job_url: merged.job_url,
        job_description_text: merged.job_description_text,
        attach_portfolio: merged.attach_portfolio,
        application_type: merged.application_type,
        status: merged.status,
        date_submitted: merged.date_submitted,
      })
      .eq("id", app.id);
    if (error) {
      setError(error.message);
      return false;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onChanged();
    return true;
  }

  async function markSubmitted() {
    const today = new Date().toISOString().slice(0, 10);
    setApp({ ...app, status: "applied", date_submitted: today });
    await saveFields({ status: "applied", date_submitted: today });
  }

  async function onJdFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/extract-text", { method: "POST", body: fd });
    const json = await res.json();
    setExtracting(false);
    if (!res.ok) {
      setError(json.error ?? "Extraction failed");
      return;
    }
    setApp({ ...app, job_description_text: json.text });
  }

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-start justify-between">
        <h2 className="text-base font-semibold">
          {app.job_title || "New draft application"}
        </h2>
        <div className="flex items-center gap-2">
          {app.status === "draft" ? (
            <button onClick={markSubmitted} className="btn-primary">
              Mark submitted → Tracker
            </button>
          ) : (
            <span className="badge bg-green-50 text-green-700">Submitted</span>
          )}
          {onClose && (
            <button onClick={onClose} className="btn-ghost px-2 py-1 text-lg leading-none">
              ×
            </button>
          )}
        </div>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Job title</label>
          <input className="input" value={app.job_title}
            onChange={(e) => setApp({ ...app, job_title: e.target.value })} />
        </div>
        <div>
          <label className="label">Company</label>
          <select className="input" value={app.company_id ?? ""}
            onChange={(e) => setApp({ ...app, company_id: e.target.value || null })}>
            <option value="">—</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Salary</label>
          <input className="input" value={app.salary_text ?? ""}
            onChange={(e) => setApp({ ...app, salary_text: e.target.value })} />
        </div>
        <div>
          <label className="label">Location</label>
          <input className="input" value={app.location ?? ""}
            onChange={(e) => setApp({ ...app, location: e.target.value })} />
        </div>
        <div>
          <label className="label">Job URL</label>
          <input className="input" value={app.job_url ?? ""}
            onChange={(e) => setApp({ ...app, job_url: e.target.value })} />
        </div>
        <div>
          <label className="label">Application type</label>
          <select className="input" value={app.application_type}
            onChange={(e) =>
              setApp({ ...app, application_type: e.target.value as "email" | "web_form" })
            }>
            <option value="email">Email</option>
            <option value="web_form">Web form</option>
          </select>
        </div>
      </div>

      <div className="mt-3">
        <label className="label">Notes</label>
        <textarea className="input min-h-16" value={app.notes ?? ""}
          onChange={(e) => setApp({ ...app, notes: e.target.value })} />
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between">
          <label className="label">Job description (paste, or upload PDF/Word)</label>
          <label className="cursor-pointer text-xs font-medium text-accent-600 hover:underline">
            {extracting ? "Extracting…" : "Upload file"}
            <input type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={onJdFile} />
          </label>
        </div>
        <textarea className="input min-h-32" value={app.job_description_text ?? ""}
          onChange={(e) => setApp({ ...app, job_description_text: e.target.value })} />
      </div>

      <button onClick={() => saveFields()} className="btn-secondary mt-3">
        {saved ? "Saved ✓" : "Save draft"}
      </button>

      <GenerationSection
        app={app}
        cvTemplates={cvTemplates}
        onBeforeGenerate={() => saveFields()}
        onPortfolioChange={(v) => setApp({ ...app, attach_portfolio: v })}
      />

      {children}
    </div>
  );
}

/* --------------------------- CV & cover generation --------------------------- */

function GenerationSection({
  app,
  cvTemplates,
  onBeforeGenerate,
  onPortfolioChange,
}: {
  app: Application;
  cvTemplates: CvTemplate[];
  onBeforeGenerate: () => Promise<boolean>;
  onPortfolioChange: (v: boolean) => void;
}) {
  const master = cvTemplates.find((t) => t.is_master);
  const [templateId, setTemplateId] = useState(master?.id ?? cvTemplates[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<CvCoverOutput | null>(null);
  const [regenComment, setRegenComment] = useState("");

  // Load the latest existing generation so output survives page reloads.
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("generated_documents")
        .select("*")
        .eq("application_id", app.id)
        .in("type", ["cv", "cover_letter"])
        .order("version", { ascending: false });
      const docs = (data as GeneratedDocument[]) ?? [];
      const cv = docs.find((d) => d.type === "cv");
      const cover = docs.find((d) => d.type === "cover_letter");
      if (cv && cover) {
        setOutput({
          cvDocId: cv.id,
          coverDocId: cover.id,
          emailSubject: cv.meta.email_subject ?? "",
          emailBody: cv.meta.email_body ?? "",
        });
      }
    })();
  }, [app.id]);

  async function generate(regeneration: boolean) {
    setBusy(true);
    setError(null);
    const ok = await onBeforeGenerate();
    if (!ok) {
      setBusy(false);
      return;
    }
    const res = await fetch("/api/generate/cv-cover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        application_id: app.id,
        cv_template_id: templateId,
        notes,
        regeneration_comment: regeneration ? regenComment : undefined,
        attach_portfolio: app.attach_portfolio,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Generation failed");
      return;
    }
    setOutput({
      cvDocId: json.cv.id,
      coverDocId: json.cover.id,
      emailSubject: json.email_subject,
      emailBody: json.email_body,
    });
    setRegenComment("");
  }

  if (cvTemplates.length === 0) {
    return (
      <p className="mt-6 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
        Create your master CV in the CV Templates tab to enable generation.
      </p>
    );
  }

  return (
    <section className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50/60 p-5">
      <h3 className="text-sm font-semibold text-neutral-800">Generate CV & cover letter</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">CV template</label>
          <select className="input" value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}>
            {cvTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.is_master ? `${t.label} (master)` : t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Specific information the AI should use</label>
          <input className="input" placeholder="Optional notes…" value={notes}
            onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-neutral-700">
        <input type="checkbox" className="h-4 w-4 accent-indigo-600"
          checked={app.attach_portfolio}
          onChange={(e) => onPortfolioChange(e.target.checked)} />
        Attach portfolio — mention the PDF/slide deck of websites & admin
        systems built in the cover letter and email
      </label>
      <button onClick={() => generate(false)} disabled={busy} className="btn-primary mt-3">
        {busy ? "Generating…" : "Generate CV & Cover Letter"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {output && (
        <div className="mt-5 space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
          <div className="flex flex-wrap gap-2">
            <a href={`/api/documents/${output.cvDocId}/download`} className="btn-secondary">
              ⬇ Tailored CV (PDF)
            </a>
            <a href={`/api/documents/${output.coverDocId}/download`} className="btn-secondary">
              ⬇ Cover letter (PDF)
            </a>
          </div>
          <CopyField label="Email subject" value={output.emailSubject} />
          <CopyField label="Email body" value={output.emailBody} multiline />

          <div className="border-t border-neutral-100 pt-3">
            <label className="label">Regenerate — what needs to change?</label>
            <div className="flex gap-2">
              <input className="input" value={regenComment}
                placeholder="e.g. emphasise leadership more, shorter About Me"
                onChange={(e) => setRegenComment(e.target.value)} />
              <button onClick={() => generate(true)}
                disabled={busy || !regenComment.trim()}
                className="btn-secondary shrink-0">
                {busy ? "…" : "Regenerate"}
              </button>
            </div>
            <p className="mt-1 text-xs text-neutral-400">
              Saves as a new version — earlier versions stay available in the Tracker.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function CopyField({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="label">{label}</label>
        <button onClick={copy} className="text-xs font-medium text-accent-600 hover:underline">
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      {multiline ? (
        <pre className="whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 font-sans text-sm text-neutral-700">
          {value}
        </pre>
      ) : (
        <p className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">{value}</p>
      )}
    </div>
  );
}
