"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SuitabilityBadge } from "@/components/suitability-badge";
import { formatDate } from "@/lib/labels";
import type { RecommendedJob } from "@/lib/types";

export function RecommendedClient({
  jobs,
  sourcesConfigured,
}: {
  jobs: RecommendedJob[];
  sourcesConfigured: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function act(id: string, action: "add" | "dismiss") {
    setBusyId(id);
    const res = await fetch(`/api/recommendations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusyId(null);
    if (res.ok) router.refresh();
  }

  async function refresh() {
    setRefreshing(true);
    setNotice(null);
    const res = await fetch("/api/recommendations/refresh", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setRefreshing(false);
    if (!res.ok) {
      setNotice(json.error ?? "Refresh failed.");
      return;
    }
    if (json.configured === false) {
      setNotice(
        "No job sources are connected yet. Add Adzuna and/or Reed API keys (free) to start pulling in recommendations."
      );
      return;
    }
    const bySource = json.bySource as Record<string, number> | undefined;
    const sources = bySource && Object.keys(bySource).length
      ? " [" + Object.entries(bySource).map(([s, n]) => `${s}: ${n}`).join(", ") + "]"
      : "";
    const counts = `Found ${json.fetched ?? 0} · scored ${json.scored ?? 0} · added ${json.inserted ?? 0}.${sources}`;
    if (json.inserted === 0) {
      if (json.fetched === 0) {
        setNotice(
          `${counts} No postings came back from the job boards just now — LinkedIn/Indeed often block automated access from servers. Try again, or add the Adzuna/Reed API keys for a reliable source.`
        );
      } else if ((json.scored ?? 0) === 0) {
        setNotice(
          `${counts} Postings came back but couldn't be scored just now (the AI scorer hiccuped or is rate-limited) — try again in a moment.`
        );
      } else {
        setNotice(
          `${counts} Everything found was already seen, already tracked, or scored a low match.`
        );
      }
    } else {
      setNotice(
        `${counts} Added ${json.inserted} new recommendation${json.inserted === 1 ? "" : "s"}.`
      );
    }
    router.refresh();
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recommended</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Fresh postings pulled daily from The Muse, Remotive, Arbeitnow and
            (where reachable) LinkedIn, Indeed, jobs.ie and NIJobfinder, matched
            against your CV and the roles you&apos;ve applied for. Add the good
            ones to New Jobs, or dismiss the rest.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="btn-secondary shrink-0"
        >
          {refreshing ? "Refreshing…" : "Refresh now"}
        </button>
      </div>

      {notice && (
        <p className="rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800">{notice}</p>
      )}

      {!sourcesConfigured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">Job sources not connected yet</p>
          <p className="mt-1">
            Recommendations come from the Adzuna and Reed job-board APIs (both
            free). Once their API keys are set on the server, the daily run will
            start filling this tab. Until then, keep capturing jobs in New Jobs.
          </p>
        </div>
      )}

      {jobs.length === 0 ? (
        <p className="text-sm text-neutral-400">
          {sourcesConfigured
            ? "No recommendations yet — the daily run will populate this, or hit “Refresh now”."
            : "Nothing here yet."}
        </p>
      ) : (
        <div className="space-y-3">
          {jobs.map((j) => (
            <div key={j.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-medium text-neutral-900">{j.title}</h3>
                    <SuitabilityBadge value={j.suitability} reason={j.suitability_reason} />
                  </div>
                  <p className="mt-0.5 truncate text-sm text-neutral-500">
                    {j.company_name ?? "Unknown company"}
                    {j.location ? ` · ${j.location}` : ""}
                    {j.salary_text ? ` · ${j.salary_text}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-neutral-400">
                  {j.source} · {formatDate(j.posted_at)}
                </span>
              </div>

              {j.suitability_reason && (
                <p className="mt-2 text-sm text-neutral-600">{j.suitability_reason}</p>
              )}

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => act(j.id, "add")}
                  disabled={busyId === j.id}
                  className="btn-primary"
                >
                  {busyId === j.id ? "Adding…" : "Add to New Jobs"}
                </button>
                <button
                  onClick={() => act(j.id, "dismiss")}
                  disabled={busyId === j.id}
                  className="btn-secondary"
                >
                  Dismiss
                </button>
                {j.url && (
                  <a
                    href={j.url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto text-sm font-medium text-accent-600 hover:underline"
                  >
                    View posting →
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
