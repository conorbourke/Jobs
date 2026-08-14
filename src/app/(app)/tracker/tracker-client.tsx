"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { TrackerRow } from "@/lib/sort";
import type { ApplicationStatus, Company, CvTemplate } from "@/lib/types";
import { STATUS_LABELS, STATUS_BADGE_CLASSES, formatDate, formatDateTime } from "@/lib/labels";
import { ApplicationDetail } from "@/components/application-detail";
import { DraftEditor } from "@/components/draft-editor";

const STATUS_OPTIONS = Object.keys(STATUS_LABELS) as ApplicationStatus[];

export function TrackerClient({
  notApplied,
  applied,
  rejected,
  companies,
  cvTemplates,
}: {
  notApplied: TrackerRow[];
  applied: TrackerRow[];
  rejected: TrackerRow[];
  companies: Company[];
  cvTemplates: CvTemplate[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [openDraftId, setOpenDraftId] = useState<string | null>(null);

  const selected =
    applied.find((r) => r.id === selectedId) ??
    rejected.find((r) => r.id === selectedId) ??
    null;

  async function updateStatus(id: string, status: ApplicationStatus) {
    const supabase = createClient();
    const patch: Record<string, unknown> = {
      status,
      status_changed_at: new Date().toISOString(),
    };
    if (status === "applied") {
      patch.date_submitted = new Date().toISOString().slice(0, 10);
    }
    await supabase.from("applications").update(patch).eq("id", id);
    router.refresh();
  }

  async function deleteDraft(id: string) {
    if (!window.confirm("Delete this draft? This can't be undone.")) return;
    const supabase = createClient();
    await supabase.from("applications").delete().eq("id", id);
    if (openDraftId === id) setOpenDraftId(null);
    router.refresh();
  }

  function Row({ row }: { row: TrackerRow }) {
    return (
      <tr
        onClick={() => setSelectedId(row.id === selectedId ? null : row.id)}
        className={`cursor-pointer border-t border-neutral-100 transition-colors hover:bg-neutral-50 ${
          row.id === selectedId ? "bg-accent-50/60" : ""
        }`}
      >
        <td className="whitespace-nowrap px-3 py-2.5 text-neutral-500">
          {formatDate(row.date_submitted)}
        </td>
        <td className="px-3 py-2.5 font-medium text-neutral-900">{row.job_title || "Untitled"}</td>
        <td className="px-3 py-2.5">{row.company_name ?? "—"}</td>
        <td className="px-3 py-2.5 text-neutral-500">{row.salary_text ?? "—"}</td>
        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
          <select
            value={row.status}
            onChange={(e) => updateStatus(row.id, e.target.value as ApplicationStatus)}
            className={`cursor-pointer rounded-full border-0 py-0.5 pl-2.5 pr-7 text-xs font-medium focus:ring-2 focus:ring-accent-200 ${STATUS_BADGE_CLASSES[row.status]}`}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          {row.status_changed_at && (
            <div className="mt-1 text-[10px] text-neutral-400">
              {formatDate(row.status_changed_at)}
            </div>
          )}
        </td>
        <td className="max-w-40 truncate px-3 py-2.5 text-neutral-500" title={row.notes ?? ""}>
          {row.notes ?? ""}
        </td>
        <td className="px-3 py-2.5 text-neutral-500">{row.location ?? "—"}</td>
        <td className="whitespace-nowrap px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
          {row.next_interview_at ? (
            <span className="badge bg-green-50 text-green-700">
              {formatDateTime(row.next_interview_at)}
            </span>
          ) : (
            <div className="relative">
              <button
                onClick={() => setSchedulingId(schedulingId === row.id ? null : row.id)}
                className="text-xs font-medium text-accent-600 hover:underline"
              >
                Schedule…
              </button>
              {schedulingId === row.id && (
                <SchedulePopover
                  applicationId={row.id}
                  onClose={() => setSchedulingId(null)}
                  onSaved={() => {
                    setSchedulingId(null);
                    router.refresh();
                  }}
                />
              )}
            </div>
          )}
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Tracker</h1>
        <span className="text-sm text-neutral-500">
          {notApplied.length} not applied · {applied.length} applied · {rejected.length} rejected
        </span>
      </div>

      {/* ---------- Not applied: tailor CV/cover, then mark applied ---------- */}
      <section className="rounded-2xl border border-sky-300 bg-sky-200/50 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-sky-900">Not applied</h2>
            <p className="text-sm text-sky-700/80">
              Generate a tailored CV &amp; cover letter for each job, then mark it as applied.
            </p>
          </div>
          <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-700">
            {notApplied.length}
          </span>
        </div>

        {notApplied.length === 0 ? (
          <p className="text-sm text-sky-700/70">
            Nothing waiting to apply — capture jobs in the New Jobs tab.
          </p>
        ) : (
          <div className="space-y-3">
            {notApplied.map((d) => (
              <div
                key={d.id}
                className="overflow-hidden rounded-xl border border-sky-100 bg-white"
              >
                <button
                  onClick={() => setOpenDraftId(openDraftId === d.id ? null : d.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-sky-50/70"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-neutral-900">
                      {d.job_title || "Untitled job"}
                    </span>
                    <span className="block truncate text-xs text-neutral-400">
                      {d.company_name ?? "No company"} ·{" "}
                      {d.due_date ? `due ${formatDate(d.due_date)}` : "no deadline"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-sky-600">
                    {openDraftId === d.id ? "Close" : "Tailor & apply →"}
                  </span>
                </button>
                {openDraftId === d.id && (
                  <div className="border-t border-sky-100 bg-sky-50/40 p-4">
                    <DraftEditor
                      key={d.id}
                      application={d}
                      companies={companies}
                      cvTemplates={cvTemplates}
                      showAttachments
                      onChanged={() => router.refresh()}
                      onClose={() => setOpenDraftId(null)}
                      onDelete={() => deleteDraft(d.id)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---------- Applied: the tracker ---------- */}
      <section className="rounded-2xl border border-blue-300 bg-blue-100/60 p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-blue-900">Applied</h2>
            <p className="text-sm text-neutral-500">
              Jobs you&apos;ve applied for. Open a row to add emails and generate interview prep.
            </p>
          </div>
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
            {applied.length}
          </span>
        </div>

        <div className="flex gap-6">
          <div className="min-w-0 flex-1">
            <div className="card overflow-visible">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-neutral-400">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">Applied</th>
                    <th className="px-3 py-2.5 font-medium">Job title</th>
                    <th className="px-3 py-2.5 font-medium">Company</th>
                    <th className="px-3 py-2.5 font-medium">Salary</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Notes</th>
                    <th className="px-3 py-2.5 font-medium">Location</th>
                    <th className="px-3 py-2.5 font-medium">Next interview</th>
                  </tr>
                </thead>
                <tbody>
                  {applied.map((row) => (
                    <Row key={row.id} row={row} />
                  ))}
                  {applied.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-10 text-center text-neutral-400">
                        No applications yet — tailor a job above and mark it applied.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Rejected: collapsed at the very bottom */}
            <div className="mt-6">
              <button
                onClick={() => setShowRejected(!showRejected)}
                className="flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-neutral-800"
              >
                <span className={`transition-transform ${showRejected ? "rotate-90" : ""}`}>▸</span>
                Rejected ({rejected.length})
              </button>
              {showRejected && rejected.length > 0 && (
                <div className="card mt-3 overflow-hidden opacity-75">
                  <table className="w-full text-left text-sm">
                    <tbody>
                      {rejected.map((row) => (
                        <Row key={row.id} row={row} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Expansion panel to the right */}
          {selected && (
            <ApplicationDetail
              key={selected.id}
              application={selected}
              companies={companies}
              onClose={() => setSelectedId(null)}
              onChanged={() => router.refresh()}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function SchedulePopover({
  applicationId,
  onClose,
  onSaved,
}: {
  applicationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [type, setType] = useState("video");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[] | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/interviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        application_id: applicationId,
        scheduled_at: new Date(`${date}T${time}`).toISOString(),
        location_text: location,
        type,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Failed to schedule");
      return;
    }
    const json = await res.json();
    if (json.warnings?.length) {
      // Interview saved, but a follow-up step had issues — let the user read them.
      setWarnings(json.warnings);
      return;
    }
    onSaved();
  }

  if (warnings) {
    return (
      <div
        className="absolute right-0 top-6 z-20 w-72 space-y-3 rounded-xl border border-amber-200 bg-white p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold text-amber-700">Scheduled, with warnings</p>
        <ul className="list-disc pl-4 text-xs text-neutral-600">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
        <button onClick={onSaved} className="btn-secondary w-full">
          OK
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={save}
      className="absolute right-0 top-6 z-20 w-72 space-y-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-sm font-semibold">Schedule call / interview</p>
      {error && <p className="rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Date</label>
          <input type="date" required className="input" value={date}
            onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Time</label>
          <input type="time" required className="input" value={time}
            onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label">Type</label>
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="phone">Phone</option>
          <option value="video">Video</option>
          <option value="in_person">In person</option>
        </select>
      </div>
      <div>
        <label className="label">Location / medium</label>
        <input className="input" placeholder="e.g. Zoom link, office address" value={location}
          onChange={(e) => setLocation(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn-primary flex-1">
          {busy ? "Saving…" : "Save & send invite"}
        </button>
        <button type="button" onClick={onClose} className="btn-secondary">
          Cancel
        </button>
      </div>
      <p className="text-[11px] leading-snug text-neutral-400">
        Saving generates the company brief & interview prep PDFs and emails you
        a calendar invite with both attached (configurable in Settings).
      </p>
    </form>
  );
}
