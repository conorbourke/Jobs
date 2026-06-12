"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Application,
  ApplicationEmail,
  ApplicationStatus,
  Company,
  GeneratedDocument,
  Interview,
} from "@/lib/types";
import { STATUS_LABELS, formatDateTime } from "@/lib/labels";

const DOC_LABELS: Record<string, string> = {
  cv: "CV",
  cover_letter: "Cover letter",
  company_brief: "Company & role brief",
  interview_prep: "Interview prep",
  completed_form_pdf: "Completed form (PDF)",
  completed_form_docx: "Completed form (Word)",
};

export function ApplicationDetail({
  application,
  companies,
  onClose,
  onChanged,
}: {
  application: Application & { company_name?: string | null };
  companies: Company[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [app, setApp] = useState(application);
  const [emails, setEmails] = useState<ApplicationEmail[]>([]);
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [summary, setSummary] = useState(application.ai_summary);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [e, d, i] = await Promise.all([
      supabase
        .from("application_emails")
        .select("*")
        .eq("application_id", application.id)
        .order("pasted_at", { ascending: false }),
      supabase
        .from("generated_documents")
        .select("*")
        .eq("application_id", application.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("interviews")
        .select("*")
        .eq("application_id", application.id)
        .order("scheduled_at", { ascending: false }),
    ]);
    setEmails((e.data as ApplicationEmail[]) ?? []);
    setDocuments((d.data as GeneratedDocument[]) ?? []);
    setInterviews((i.data as Interview[]) ?? []);
  }, [application.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveFields() {
    const supabase = createClient();
    await supabase
      .from("applications")
      .update({
        job_title: app.job_title,
        company_id: app.company_id,
        salary_text: app.salary_text,
        location: app.location,
        status: app.status,
        application_type: app.application_type,
        notes: app.notes,
        job_url: app.job_url,
        job_description_text: app.job_description_text,
        attach_portfolio: app.attach_portfolio,
        date_submitted: app.date_submitted || null,
      })
      .eq("id", app.id);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onChanged();
  }

  return (
    <aside className="card sticky top-8 max-h-[calc(100vh-4rem)] w-[26rem] shrink-0 overflow-y-auto p-5">
      <div className="mb-4 flex items-start justify-between">
        <h2 className="text-base font-semibold leading-tight">
          {app.job_title || "Untitled application"}
        </h2>
        <button onClick={onClose} className="btn-ghost -mr-2 -mt-1 px-2 py-1 text-lg leading-none">
          ×
        </button>
      </div>

      {/* Editable fields */}
      <div className="space-y-3">
        <div>
          <label className="label">Job title</label>
          <input className="input" value={app.job_title}
            onChange={(e) => setApp({ ...app, job_title: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Company</label>
            <select
              className="input"
              value={app.company_id ?? ""}
              onChange={(e) => setApp({ ...app, company_id: e.target.value || null })}
            >
              <option value="">—</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={app.status}
              onChange={(e) => setApp({ ...app, status: e.target.value as ApplicationStatus })}>
              {(Object.keys(STATUS_LABELS) as ApplicationStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
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
            <label className="label">Type</label>
            <select className="input" value={app.application_type}
              onChange={(e) =>
                setApp({ ...app, application_type: e.target.value as "email" | "web_form" })
              }>
              <option value="email">Email</option>
              <option value="web_form">Web form</option>
            </select>
          </div>
          <div>
            <label className="label">Date submitted</label>
            <input type="date" className="input" value={app.date_submitted ?? ""}
              onChange={(e) => setApp({ ...app, date_submitted: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">Job URL</label>
          <input className="input" value={app.job_url ?? ""}
            onChange={(e) => setApp({ ...app, job_url: e.target.value })} />
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea className="input min-h-16" value={app.notes ?? ""}
            onChange={(e) => setApp({ ...app, notes: e.target.value })} />
        </div>
        <div>
          <label className="label">Job description</label>
          <textarea className="input min-h-24" value={app.job_description_text ?? ""}
            onChange={(e) => setApp({ ...app, job_description_text: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" className="h-4 w-4 accent-indigo-600"
            checked={app.attach_portfolio}
            onChange={(e) => setApp({ ...app, attach_portfolio: e.target.checked })} />
          Attach portfolio (PDF/slide deck of websites & admin systems built)
        </label>
        <button onClick={saveFields} className="btn-primary w-full">
          {saved ? "Saved ✓" : "Save changes"}
        </button>
      </div>

      {/* Briefs */}
      <div className="mt-6 grid grid-cols-2 gap-2">
        <GenerateButton
          label="Company & role brief"
          applicationId={app.id}
          type="company_brief"
          onDone={load}
        />
        <GenerateButton
          label="Interview prep"
          applicationId={app.id}
          type="interview_prep"
          onDone={load}
        />
      </div>

      {/* Interviews */}
      {interviews.length > 0 && (
        <section className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-neutral-700">Interviews</h3>
          <ul className="space-y-1.5 text-sm">
            {interviews.map((iv) => (
              <li key={iv.id} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2">
                <span>
                  {formatDateTime(iv.scheduled_at)}
                  {iv.type ? ` · ${iv.type}` : ""}
                  {iv.location_text ? ` · ${iv.location_text}` : ""}
                </span>
                {iv.ics_sent_at && <span title="Invite sent">📨</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Documents */}
      <section className="mt-6">
        <h3 className="mb-2 text-sm font-semibold text-neutral-700">Generated documents</h3>
        {documents.length === 0 ? (
          <p className="text-sm text-neutral-400">None yet.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2">
                <span className="min-w-0 truncate">
                  {DOC_LABELS[doc.type] ?? doc.type}{" "}
                  <span className="text-xs text-neutral-400">v{doc.version}</span>
                  {doc.generation_notes && (
                    <span className="block truncate text-xs text-neutral-400" title={doc.generation_notes}>
                      “{doc.generation_notes}”
                    </span>
                  )}
                </span>
                <a className="shrink-0 text-xs font-medium text-accent-600 hover:underline"
                  href={`/api/documents/${doc.id}/download`}>
                  Download
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Email thread */}
      <EmailThread
        applicationId={app.id}
        emails={emails}
        summary={summary}
        onPasted={(newSummary) => {
          if (newSummary !== undefined) setSummary(newSummary);
          load();
        }}
      />
    </aside>
  );
}

function GenerateButton({
  label,
  applicationId,
  type,
  onDone,
}: {
  label: string;
  applicationId: string;
  type: "company_brief" | "interview_prep";
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/documents/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ application_id: applicationId, type }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Generation failed");
      return;
    }
    onDone();
  }

  return (
    <div>
      <button onClick={generate} disabled={busy} className="btn-secondary w-full text-xs">
        {busy ? "Generating…" : `Generate ${label} (PDF)`}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function EmailThread({
  applicationId,
  emails,
  summary,
  onPasted,
}: {
  applicationId: string;
  emails: ApplicationEmail[];
  summary: string | null;
  onPasted: (summary?: string) => void;
}) {
  const [body, setBody] = useState("");
  const [direction, setDirection] = useState<"from_me" | "from_company">("from_company");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function paste(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ application_id: applicationId, direction, body_text: body }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Failed to save email");
      return;
    }
    const json = await res.json();
    setBody("");
    onPasted(json.summary);
  }

  return (
    <section className="mt-6">
      <h3 className="mb-2 text-sm font-semibold text-neutral-700">Email thread</h3>

      {/* AI summary pinned at the top */}
      {summary && (
        <div className="mb-3 rounded-lg border border-accent-200 bg-accent-50 p-3 text-xs leading-relaxed text-accent-700">
          <p className="mb-1 font-semibold">AI summary</p>
          <p className="whitespace-pre-wrap">{summary}</p>
        </div>
      )}

      {/* Paste box */}
      <form onSubmit={paste} className="space-y-2">
        <textarea
          className="input min-h-20 text-xs"
          placeholder="Paste an email here…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
        />
        <div className="flex items-center justify-between gap-2">
          <div className="flex overflow-hidden rounded-lg border border-neutral-300 text-xs">
            <button type="button"
              onClick={() => setDirection("from_company")}
              className={`px-2.5 py-1.5 ${direction === "from_company" ? "bg-accent-600 text-white" : "bg-white text-neutral-600"}`}>
              From company
            </button>
            <button type="button"
              onClick={() => setDirection("from_me")}
              className={`px-2.5 py-1.5 ${direction === "from_me" ? "bg-accent-600 text-white" : "bg-white text-neutral-600"}`}>
              From me
            </button>
          </div>
          <button type="submit" disabled={busy} className="btn-primary text-xs">
            {busy ? "Saving…" : "Add email"}
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>

      {/* Thread, most recent on top */}
      <ul className="mt-3 space-y-2">
        {emails.map((em) => (
          <li key={em.id}
            className={`rounded-lg border p-3 text-xs leading-relaxed ${
              em.direction === "from_me"
                ? "border-neutral-200 bg-white"
                : "border-neutral-200 bg-neutral-50"
            }`}>
            <p className="mb-1 flex justify-between font-medium text-neutral-500">
              <span>{em.direction === "from_me" ? "Me → company" : "Company → me"}</span>
              <span>{formatDateTime(em.pasted_at)}</span>
            </p>
            <p className="whitespace-pre-wrap text-neutral-700">{em.body_text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
