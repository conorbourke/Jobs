"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DraftEditor } from "@/components/draft-editor";
import { CompanyList } from "@/components/company-list";
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

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Suggested Jobs</h1>

      {/* 1. URL submit bar */}
      <UrlSubmitBar
        onCreated={(id) => {
          setSelectedId(id);
          router.refresh();
        }}
        onBlank={() => createBlankDraft()}
      />

      {/* 2. Draft editor */}
      {selected && (
        <DraftEditor
          key={selected.id}
          application={selected}
          companies={companies}
          cvTemplates={cvTemplates}
          onChanged={() => router.refresh()}
          onClose={() => setSelectedId(null)}
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
                  <span className="block truncate font-medium">
                    {d.job_title || "Untitled draft"}
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
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setNotice(json.error ?? "Failed to create draft");
      return;
    }
    if (!json.scraped) {
      setNotice(
        "Couldn't read this page automatically (some sites, e.g. LinkedIn, block it or need a login). A draft was created with the URL — paste the job description into it and generate as normal."
      );
    }
    setUrl("");
    onCreated(json.application.id);
  }

  return (
    <div className="card p-5">
      <form onSubmit={submit} className="flex gap-2">
        <input
          className="input"
          type="url"
          placeholder="Paste a job URL — we'll pre-fill a draft application"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <button type="submit" disabled={busy} className="btn-primary shrink-0">
          {busy ? "Reading…" : "Create draft"}
        </button>
        <button type="button" onClick={onBlank} className="btn-secondary shrink-0">
          Blank draft
        </button>
      </form>
      {notice && <p className="mt-2 text-sm text-amber-700">{notice}</p>}
    </div>
  );
}
