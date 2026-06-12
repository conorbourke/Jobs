"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Company, CompanyTier } from "@/lib/types";

/**
 * Master company list in Primary / Secondary sections. Companies are keyed
 * by fixed UUID — application counts join on id, and reordering/moving never
 * touches identity. Rows are draggable within a section.
 */
export function CompanyList({
  companies: initial,
  applicationCounts,
  onCreateApplication,
  onChanged,
}: {
  companies: Company[];
  applicationCounts: Record<string, number>;
  onCreateApplication: (companyId: string) => void;
  onChanged: () => void;
}) {
  const [companies, setCompanies] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);

  const primary = companies
    .filter((c) => c.tier === "primary")
    .sort((a, b) => a.sort_order - b.sort_order);
  const secondary = companies
    .filter((c) => c.tier === "secondary")
    .sort((a, b) => a.sort_order - b.sort_order);

  async function persistOrder(list: Company[]) {
    const supabase = createClient();
    await Promise.all(
      list.map((c, i) =>
        supabase.from("companies").update({ sort_order: i }).eq("id", c.id)
      )
    );
  }

  function reorderWithin(tier: CompanyTier, fromId: string, toId: string) {
    const list = (tier === "primary" ? primary : secondary).slice();
    const fromIdx = list.findIndex((c) => c.id === fromId);
    const toIdx = list.findIndex((c) => c.id === toId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    const renumbered = list.map((c, i) => ({ ...c, sort_order: i }));
    setCompanies([
      ...companies.filter((c) => c.tier !== tier),
      ...renumbered,
    ]);
    persistOrder(renumbered);
  }

  async function moveToTop(company: Company) {
    const list = (company.tier === "primary" ? primary : secondary).filter(
      (c) => c.id !== company.id
    );
    const renumbered = [company, ...list].map((c, i) => ({ ...c, sort_order: i }));
    setCompanies([...companies.filter((c) => c.tier !== company.tier), ...renumbered]);
    await persistOrder(renumbered);
  }

  async function moveTier(company: Company) {
    const newTier: CompanyTier = company.tier === "primary" ? "secondary" : "primary";
    const target = newTier === "primary" ? primary : secondary;
    const updated = { ...company, tier: newTier, sort_order: target.length };
    setCompanies(companies.map((c) => (c.id === company.id ? updated : c)));
    await createClient()
      .from("companies")
      .update({ tier: newTier, sort_order: target.length })
      .eq("id", company.id);
  }

  async function remove(company: Company) {
    const count = applicationCounts[company.id] ?? 0;
    if (
      !confirm(
        count > 0
          ? `${company.name} has ${count} application(s). Deleting keeps the applications but unlinks the company. Continue?`
          : `Delete ${company.name}?`
      )
    ) {
      return;
    }
    setCompanies(companies.filter((c) => c.id !== company.id));
    await createClient().from("companies").delete().eq("id", company.id);
    onChanged();
  }

  function Row({ company }: { company: Company }) {
    const count = applicationCounts[company.id] ?? 0;
    return (
      <li
        draggable
        onDragStart={() => setDragId(company.id)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => {
          if (dragId && dragId !== company.id) {
            const dragged = companies.find((c) => c.id === dragId);
            if (dragged?.tier === company.tier) {
              reorderWithin(company.tier, dragId, company.id);
            }
          }
          setDragId(null);
        }}
        className="group flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-neutral-50"
      >
        <span className="cursor-grab text-neutral-300 group-hover:text-neutral-400">⠿</span>
        <span className="min-w-0 flex-1">
          <span className="font-medium">{company.name}</span>
          {company.recruitment_url && (
            <a
              href={company.recruitment_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 text-xs text-accent-600 hover:underline"
            >
              recruitment page ↗
            </a>
          )}
        </span>
        <span
          className={`badge ${count > 0 ? "bg-accent-50 text-accent-700" : "bg-neutral-100 text-neutral-400"}`}
          title="Past applications to this company"
        >
          {count} application{count === 1 ? "" : "s"}
        </span>
        <span className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button onClick={() => onCreateApplication(company.id)}
            className="btn-ghost px-2 py-1 text-xs" title="Create application">
            + Application
          </button>
          <button onClick={() => moveToTop(company)}
            className="btn-ghost px-2 py-1 text-xs" title="Move to top">
            ↑ Top
          </button>
          <button onClick={() => moveTier(company)}
            className="btn-ghost px-2 py-1 text-xs">
            → {company.tier === "primary" ? "Secondary" : "Primary"}
          </button>
          <button onClick={() => remove(company)}
            className="btn-ghost px-2 py-1 text-xs text-red-500" title="Delete">
            ✕
          </button>
        </span>
      </li>
    );
  }

  function Section({ title, list }: { title: string; list: Company[] }) {
    return (
      <div className="card">
        <h3 className="border-b border-neutral-100 px-4 py-3 text-sm font-semibold">
          {title} <span className="font-normal text-neutral-400">({list.length})</span>
        </h3>
        {list.length === 0 ? (
          <p className="px-4 py-4 text-sm text-neutral-400">No companies in this tier.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {list.map((c) => (
              <Row key={c.id} company={c} />
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Master company list</h2>
        <span className="text-sm text-neutral-500">
          {companies.length} companies · manage the list in Settings
        </span>
      </div>
      <Section title="Primary" list={primary} />
      <Section title="Secondary" list={secondary} />
    </section>
  );
}
