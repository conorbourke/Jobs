"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ApplicationAttachment } from "@/lib/types";

const MAX = 3;

/**
 * Upload up to 3 supporting documents (job description / personal
 * specification) for an application. Files are stored and their text is
 * extracted for CV/cover generation. Self-contained: loads its own list.
 */
export function AttachmentsSection({ applicationId }: { applicationId: string }) {
  const [items, setItems] = useState<ApplicationAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("application_attachments")
      .select("*")
      .eq("application_id", applicationId)
      .order("created_at")
      .returns<ApplicationAttachment[]>();
    setItems(data ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same file
    if (files.length === 0) return;
    setError(null);
    setBusy(true);
    for (const file of files) {
      if (items.length >= MAX) {
        setError(`You can attach at most ${MAX} documents.`);
        break;
      }
      const fd = new FormData();
      fd.append("file", file);
      fd.append("application_id", applicationId);
      const res = await fetch("/api/attachments", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Upload failed");
        break;
      }
      setItems((prev) => [...prev, json.attachment]);
    }
    setBusy(false);
  }

  async function remove(id: string) {
    setItems((prev) => prev.filter((a) => a.id !== id));
    await fetch(`/api/attachments?id=${id}`, { method: "DELETE" });
  }

  const remaining = MAX - items.length;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <label className="label">
          Supporting documents{" "}
          <span className="font-normal text-neutral-400">
            (job spec / personal specification — up to {MAX})
          </span>
        </label>
        {remaining > 0 && (
          <label className="cursor-pointer text-xs font-medium text-accent-600 hover:underline">
            {busy ? "Uploading…" : `+ Add document${remaining > 1 ? "s" : ""}`}
            <input
              type="file"
              accept=".pdf,.docx,.txt"
              multiple
              className="hidden"
              onChange={onUpload}
              disabled={busy}
            />
          </label>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-1 text-xs text-neutral-400">
          Attach the job description or personal specification PDF/Word docs —
          the AI uses them when tailoring your CV & cover letter.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="text-sky-500">📄</span>
                <span className="truncate">{a.filename}</span>
                {!a.extracted_text && (
                  <span className="shrink-0 text-xs text-amber-600" title="Stored, but no text could be read from this file">
                    (no text read)
                  </span>
                )}
              </span>
              <button
                onClick={() => remove(a.id)}
                className="shrink-0 text-xs font-medium text-neutral-400 hover:text-red-600"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
