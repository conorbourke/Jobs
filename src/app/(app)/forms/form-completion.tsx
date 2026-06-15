"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Application,
  FormAnswer,
  FormSubmission,
  FormVerification,
} from "@/lib/types";

/**
 * Form completion flow: extract questions (URL / pasted / file upload) →
 * AI answers → per-question review with confidence indicators and manual
 * edit boxes → render with verification + side-by-side preview → download.
 */
export function FormCompletion({
  application,
  initialSubmission,
}: {
  application: Application;
  initialSubmission: FormSubmission | null;
}) {
  const [submission, setSubmission] = useState(initialSubmission);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50/60 p-5">
      <h3 className="text-sm font-semibold text-neutral-800">Form completion</h3>
      {error && (
        <p className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}{" "}
          <button className="underline" onClick={() => setError(null)}>dismiss</button>
        </p>
      )}

      {!submission ? (
        <ExtractStep
          applicationId={application.id}
          onExtracted={setSubmission}
          onError={setError}
        />
      ) : (
        <AnswerStep
          submission={submission}
          onUpdate={setSubmission}
          onReset={() => setSubmission(null)}
          onError={setError}
        />
      )}
    </section>
  );
}

/* ------------------------------ extraction ------------------------------ */

function ExtractStep({
  applicationId,
  onExtracted,
  onError,
}: {
  applicationId: string;
  onExtracted: (s: FormSubmission) => void;
  onError: (e: string) => void;
}) {
  const [mode, setMode] = useState<"upload" | "url" | "paste">("upload");
  const [url, setUrl] = useState("");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);

  async function extract(payload: BodyInit, isForm: boolean) {
    setBusy(true);
    const res = await fetch("/api/forms/extract", {
      method: "POST",
      ...(isForm ? {} : { headers: { "Content-Type": "application/json" } }),
      body: payload,
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      onError(json.error ?? "Extraction failed");
      return;
    }
    onExtracted(json.submission);
  }

  return (
    <div className="mt-3">
      <div className="flex gap-1 rounded-lg bg-neutral-200/60 p-1 text-xs font-medium">
        {(
          [
            ["upload", "Upload Word/PDF form"],
            ["url", "Form URL"],
            ["paste", "Paste questions"],
          ] as const
        ).map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)}
            className={`flex-1 rounded-md px-3 py-1.5 transition-colors ${
              mode === m ? "bg-white shadow-sm" : "text-neutral-500 hover:text-neutral-800"
            }`}>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        {mode === "upload" && (
          <div>
            <input
              type="file"
              accept=".pdf,.docx"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const fd = new FormData();
                fd.append("application_id", applicationId);
                fd.append("file", file);
                extract(fd, true);
              }}
              className="block text-sm text-neutral-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium"
            />
            <p className="mt-2 text-xs text-neutral-400">
              .docx output preserves the original layout exactly; PDF forms are
              filled via form fields or careful overlay, with an appendix
              fallback rather than ever corrupting the layout.
            </p>
          </div>
        )}
        {mode === "url" && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              extract(JSON.stringify({ application_id: applicationId, method: "url", url }), false);
            }}
          >
            <input className="input" type="url" required placeholder="https://…"
              value={url} onChange={(e) => setUrl(e.target.value)} />
            <button type="submit" disabled={busy} className="btn-primary shrink-0">
              {busy ? "Extracting…" : "Extract questions"}
            </button>
          </form>
        )}
        {mode === "paste" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              extract(
                JSON.stringify({
                  application_id: applicationId,
                  method: "pasted_questions",
                  text: pasted,
                }),
                false
              );
            }}
          >
            <textarea className="input min-h-32" required placeholder="Paste the form questions here…"
              value={pasted} onChange={(e) => setPasted(e.target.value)} />
            <button type="submit" disabled={busy} className="btn-primary mt-2">
              {busy ? "Extracting…" : "Extract questions"}
            </button>
          </form>
        )}
        {busy && <p className="mt-2 text-xs text-neutral-400">Working — this can take a moment…</p>}
      </div>
    </div>
  );
}

/* ------------------------- answers, verify, render ------------------------- */

function ConfidenceDot({ value }: { value: number }) {
  const colour = value >= 0.75 ? "bg-green-500" : value >= 0.45 ? "bg-amber-500" : "bg-red-500";
  const label = value >= 0.75 ? "high" : value >= 0.45 ? "medium" : "low";
  return (
    <span className="inline-flex items-center gap-1 text-xs text-neutral-500"
      title={`Confidence: ${Math.round(value * 100)}%`}>
      <span className={`h-2 w-2 rounded-full ${colour}`} />
      {label}
    </span>
  );
}

function AnswerStep({
  submission,
  onUpdate,
  onReset,
  onError,
}: {
  submission: FormSubmission;
  onUpdate: (s: FormSubmission) => void;
  onReset: () => void;
  onError: (e: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const [regenComment, setRegenComment] = useState("");
  const [busy, setBusy] = useState<"answers" | "render" | null>(null);
  const [answers, setAnswers] = useState<FormAnswer[]>(submission.answers ?? []);
  const [verification, setVerification] = useState<FormVerification | null>(
    Object.keys(submission.verification ?? {}).length ? submission.verification : null
  );
  const [outputs, setOutputs] = useState(submission.output_paths ?? {});
  const [showPreview, setShowPreview] = useState(false);

  const hasAnswers = answers.length > 0;

  async function generateAnswers(regeneration: boolean) {
    setBusy("answers");
    const res = await fetch("/api/forms/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submission_id: submission.id,
        notes,
        regeneration_comment: regeneration ? regenComment : undefined,
      }),
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) {
      onError(json.error ?? "Answer generation failed");
      return;
    }
    setAnswers(json.answers);
    setRegenComment("");
    onUpdate({ ...submission, answers: json.answers });
  }

  async function saveEdits() {
    await createClient()
      .from("form_submissions")
      .update({ answers })
      .eq("id", submission.id);
    onUpdate({ ...submission, answers });
  }

  async function render() {
    setBusy("render");
    await saveEdits();
    const res = await fetch("/api/forms/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submission_id: submission.id,
        generation_notes: regenComment || null,
      }),
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) {
      onError(json.error ?? "Render failed");
      return;
    }
    setVerification(json.verification);
    setOutputs(json.output_paths);
    setAnswers(json.answers);
    setShowPreview(true);
    onUpdate({
      ...submission,
      answers: json.answers,
      verification: json.verification,
      output_paths: json.output_paths,
    });
  }

  function setAnswer(id: string, text: string) {
    setAnswers(
      answers.map((a) =>
        a.id === id ? { ...a, answer: text, edited: true, confidence: 1 } : a
      )
    );
  }

  return (
    <div className="mt-3 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-600">
          <strong>{submission.questions.length}</strong> questions extracted
          {submission.input_method === "file_upload" ? " from the uploaded form" : ""}.
        </p>
        <button onClick={onReset} className="text-xs text-neutral-400 hover:text-neutral-700">
          Start over with a different form
        </button>
      </div>

      {!hasAnswers ? (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="label">Specific information the AI should use (optional)</label>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. notice period is 4 weeks, salary expectation £40k" />
          </div>
          <button onClick={() => generateAnswers(false)} disabled={busy !== null}
            className="btn-primary shrink-0">
            {busy === "answers" ? "Answering…" : "Generate answers"}
          </button>
        </div>
      ) : (
        <>
          {/* Per-question review with confidence + manual edit boxes */}
          <ul className="space-y-3">
            {submission.questions.map((q) => {
              const a = answers.find((x) => x.id === q.id);
              return (
                <li key={q.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-neutral-800">{q.question}</p>
                    {a && <ConfidenceDot value={a.confidence} />}
                  </div>
                  <textarea
                    className="input mt-2 min-h-[3.5rem] text-sm"
                    value={a?.answer ?? ""}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                  />
                  {a?.answer.includes("[TO FILL") && (
                    <p className="mt-1 text-xs text-amber-700">
                      Contains a placeholder — fill in the real value before submitting.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={render} disabled={busy !== null} className="btn-primary">
              {busy === "render" ? "Rendering…" : outputs.pdf ? "Re-render completed form" : "Render completed form"}
            </button>
            <button onClick={saveEdits} disabled={busy !== null} className="btn-secondary">
              Save edits
            </button>
            <div className="flex flex-1 gap-2">
              <input className="input" placeholder="Regenerate answers — what should change?"
                value={regenComment} onChange={(e) => setRegenComment(e.target.value)} />
              <button onClick={() => generateAnswers(true)}
                disabled={busy !== null || !regenComment.trim()}
                className="btn-secondary shrink-0">
                Regenerate
              </button>
            </div>
          </div>

          {/* Verification + downloads */}
          {verification && (
            <div className="rounded-lg border border-neutral-200 bg-white p-4">
              <h4 className="text-sm font-semibold">Verification</h4>
              <ul className="mt-2 space-y-1 text-sm">
                {verification.original_page_count !== undefined && (
                  <li className={
                    verification.completed_page_count! >= verification.original_page_count
                      ? "text-green-700" : "text-red-700"
                  }>
                    {verification.completed_page_count! >= verification.original_page_count ? "✓" : "✗"}{" "}
                    Pages: {verification.original_page_count} →{" "}
                    {verification.completed_page_count}
                    {verification.completed_page_count! > verification.original_page_count &&
                      " (answers appendix added)"}
                  </li>
                )}
                <li className={verification.questions_intact ? "text-green-700" : "text-red-700"}>
                  {verification.questions_intact ? "✓" : "✗"} Original question text intact
                </li>
                {(verification.warnings ?? []).map((w, i) => (
                  <li key={i} className="text-amber-700">⚠ {w}</li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                {outputs.pdf && (
                  <a href={`/api/documents/${outputs.pdf}/download`} className="btn-secondary">
                    ⬇ Completed form (PDF)
                  </a>
                )}
                {outputs.docx && (
                  <a href={`/api/documents/${outputs.docx}/download`} className="btn-secondary">
                    ⬇ Completed form (Word)
                  </a>
                )}
                {submission.original_file_path && (
                  <button onClick={() => setShowPreview(!showPreview)} className="btn-secondary">
                    {showPreview ? "Hide" : "Show"} side-by-side preview
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Side-by-side preview: original vs completed */}
          {showPreview && outputs.pdf && submission.original_file_path && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="label">Original</p>
                <iframe
                  src={`/api/forms/${submission.id}/original`}
                  className="h-96 w-full rounded-lg border border-neutral-200 bg-white"
                  title="Original form"
                />
              </div>
              <div>
                <p className="label">Completed</p>
                <iframe
                  src={`/api/documents/${outputs.pdf}/download?inline=1`}
                  className="h-96 w-full rounded-lg border border-neutral-200 bg-white"
                  title="Completed form"
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
