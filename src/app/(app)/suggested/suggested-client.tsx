"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DraftEditor } from "@/components/draft-editor";
import { CompanyList } from "@/components/company-list";
import { SuitabilityBadge } from "@/components/suitability-badge";
import { formatDate } from "@/lib/labels";
import type { Application, Company, CvTemplate } from "@/lib/types";

export function SuggestedClient({
  drafts,
  companies,
  cvTemplates,
  applicationCounts,
}: {
  drafts: Application[];
  companies: Company[];
  cvTemplates: CvTemplate[];
  applicationCounts: Record<string, number>;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(drafts[0]?.id ?? null);
  const selected = drafts.find((d) => d.id === selectedId) ?? null;

  // One-shot: score any drafts that don't yet have a suitability match, then
  // refresh so the badges appear. Guarded so it fires once per unscored set.
  const scoringRef = useRef(false);
  useEffect(() => {
    const unscored = drafts.filter(
      (d) => !d.suitability && (d.job_title || d.job_description_text)
    );
    if (unscored.length === 0 || scoringRef.current) return;
    scoringRef.current = true;
    fetch("/api/suitability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationIds: unscored.map((d) => d.id) }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j?.scored > 0) router.refresh();
      })
      .catch(() => {});
  }, [drafts, router]);

  async function createBlankDraft(companyId?: string) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data } = await supabase
      .from("applications")
      .insert({
        user_id: user!.id,
        status: "draft",
        source: companyId ? "manual" : "suggested",
        company_id: companyId ?? null,
        job_title: "",
      })
      .select()
      .single();
    if (data) {
      setSelectedId(data.id);
      router.refresh();
    }
  }

  async function deleteDraft(id: string) {
    if (!window.confirm("Delete this draft? This can't be undone.")) return;
    const supabase = createClient();
    await supabase.from("applications").delete().eq("id", id);
    if (selectedId === id) setSelectedId(null);
    router.refresh();
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Jobs</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Capture a job — paste a URL or the posting text, and attach any job
          spec / personal specification docs. Tailor your CV & cover letter and
          mark it applied over in the{" "}
          <span className="font-medium text-neutral-700">Tracker → Not applied</span>{" "}
          section.
        </p>
      </div>

      {/* 1. URL submit bar */}
      <UrlSubmitBar
        onCreated={(id) => {
          setSelectedId(id);
          router.refresh();
        }}
        onBlank={() => createBlankDraft()}
      />

      {/* 2. Draft editor — capture only; generation + mark-applied live in the Tracker */}
      {selected && (
        <DraftEditor
          key={selected.id}
          application={selected}
          companies={companies}
          cvTemplates={cvTemplates}
          onChanged={() => router.refresh()}
          onClose={() => setSelectedId(null)}
          onDelete={() => deleteDraft(selected.id)}
          showGeneration={false}
          showSubmit={false}
          showAttachments
        />
      )}

      {/* 3. Drafts */}
      <section>
        <h2 className="mb-3 font-semibold">Drafts ({drafts.length})</h2>
        {drafts.length === 0 ? (
          <p className="text-sm text-neutral-400">
            No drafts — paste a job URL above or create an application from the
            company list below.
          </p>
        ) : (
          <div className="card divide-y divide-neutral-100">
            {drafts.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelectedId(d.id)}
                className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-neutral-50 ${
                  d.id === selectedId ? "bg-accent-50/60" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">
                      {d.job_title || "Untitled draft"}
                    </span>
                    <SuitabilityBadge value={d.suitability} reason={d.suitability_reason} />
                  </span>
                  <span className="block truncate text-xs text-neutral-400">
                    {d.job_url || "no URL"}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-neutral-400">
                  {formatDate(d.date_added)}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 4. Master company list */}
      <CompanyList
        companies={companies}
        applicationCounts={applicationCounts}
        onCreateApplication={(companyId) => createBlankDraft(companyId)}
        onChanged={() => router.refresh()}
      />
    </div>
  );
}

function UrlSubmitBar({
  onCreated,
  onBlank,
}: {
  onCreated: (applicationId: string) => void;
  onBlank: () => void;
}) {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"url" | "text">("url");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "text" ? { text, url: url || undefined } : { url }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setNotice(json.error ?? "Failed to create draft");
      return;
    }
    if (!json.scraped && mode === "url") {
      setNotice(
        "Couldn't read this page automatically (some sites, e.g. LinkedIn or Indeed, block it or need a login). A draft was created with the URL — switch to “Paste text”, copy the job posting in, and we'll pre-fill it for you."
      );
    }
    setUrl("");
    setText("");
    onCreated(json.application.id);
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex gap-1 rounded-lg bg-neutral-200/60 p-1 text-xs font-medium">
        {(
          [
            ["url", "From URL"],
            ["text", "Paste text"],
          ] as const
        ).map(([m, label]) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={`flex-1 rounded-md px-3 py-1.5 transition-colors ${
              mode === m ? "bg-white shadow-sm" : "text-neutral-500 hover:text-neutral-800"
            }`}>
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-2">
        {mode === "url" ? (
          <div className="flex gap-2">
            <input className="input" type="url" required value={url}
              placeholder="Paste a job URL — we'll pre-fill a draft application"
              onChange={(e) => setUrl(e.target.value)} />
            <button type="submit" disabled={busy} className="btn-primary shrink-0">
              {busy ? "Reading…" : "Create draft"}
            </button>
            <button type="button" onClick={onBlank} className="btn-secondary shrink-0">
              Blank draft
            </button>
          </div>
        ) : (
          <>
            <textarea className="input min-h-32" required value={text}
              placeholder="Paste the full job posting here (works for LinkedIn, Indeed, anywhere) — the AI will pull out the title, company, location and description."
              onChange={(e) => setText(e.target.value)} />
            <input className="input" type="url" value={url}
              placeholder="Job URL (optional — stored on the application)"
              onChange={(e) => setUrl(e.target.value)} />
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? "Reading…" : "Create draft from text"}
            </button>
          </>
        )}
      </form>
      {notice && <p className="mt-2 text-sm text-amber-700">{notice}</p>}
    </div>
  );
}
