"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DraftEditor } from "@/components/draft-editor";
import { FormCompletion } from "./form-completion";
import { formatDate } from "@/lib/labels";
import type { Application, Company, CvTemplate, FormSubmission } from "@/lib/types";

export function FormsClient({
  drafts,
  companies,
  cvTemplates,
  submissions,
}: {
  drafts: Application[];
  companies: Company[];
  cvTemplates: CvTemplate[];
  submissions: Record<string, FormSubmission>;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(drafts[0]?.id ?? null);
  const selected = drafts.find((d) => d.id === selectedId) ?? null;

  async function createDraft() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data } = await supabase
      .from("applications")
      .insert({
        user_id: user!.id,
        status: "draft",
        source: "application_form",
        application_type: "web_form",
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Application Forms</h1>
        <button onClick={createDraft} className="btn-primary">
          + New form application
        </button>
      </div>
      <p className="text-sm text-neutral-500">
        Same flow as Suggested Jobs, plus AI form completion: paste a form URL
        or the questions themselves, or upload a Word/PDF form — answers are
        placed without disturbing the original layout, with a verification
        preview before you download.
      </p>

      {selected && (
        <DraftEditor
          key={selected.id}
          application={selected}
          companies={companies}
          cvTemplates={cvTemplates}
          onChanged={() => router.refresh()}
          onClose={() => setSelectedId(null)}
        >
          <FormCompletion
            application={selected}
            initialSubmission={submissions[selected.id] ?? null}
          />
        </DraftEditor>
      )}

      <section>
        <h2 className="mb-3 font-semibold">Form drafts ({drafts.length})</h2>
        {drafts.length === 0 ? (
          <p className="text-sm text-neutral-400">No form applications in progress.</p>
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
                    {d.job_title || "Untitled form application"}
                  </span>
                  <span className="block truncate text-xs text-neutral-400">
                    {submissions[d.id]
                      ? `${submissions[d.id].questions.length} questions extracted`
                      : "no form loaded yet"}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-neutral-400">{formatDate(d.date_added)}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
