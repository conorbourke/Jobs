import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminSettings } from "@/lib/settings";
import type { Company } from "@/lib/types";

interface ImportRow {
  name: string;
  recruitment_url: string;
  tier: "primary" | "secondary";
}

/**
 * Import/replace the master company list. Companies are keyed by fixed UUID:
 * existing rows are matched case-insensitively by name and UPDATED in place
 * (id preserved → application history/counts preserved). Replace mode removes
 * companies absent from the file unless they have applications.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows, replace } = (await request.json()) as {
    rows: ImportRow[];
    replace?: boolean;
  };
  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "rows must be an array" }, { status: 400 });
  }

  const settings = await getAdminSettings(supabase);

  const { data: existing } = await supabase
    .from("companies")
    .select("*")
    .returns<Company[]>();
  const byName = new Map((existing ?? []).map((c) => [c.name.toLowerCase(), c]));

  // De-dupe the incoming rows by name (first wins).
  const seen = new Set<string>();
  const incoming = rows
    .map((r) => ({
      name: String(r.name ?? "").trim(),
      recruitment_url: String(r.recruitment_url ?? "").trim() || null,
      tier: r.tier === "primary" ? "primary" : "secondary",
    }))
    .filter((r) => {
      const key = r.name.toLowerCase();
      if (!r.name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const toInsert = incoming.filter((r) => !byName.has(r.name.toLowerCase()));
  const toUpdate = incoming.filter((r) => byName.has(r.name.toLowerCase()));

  // Server-side cap check (DB trigger is the backstop).
  const finalCount = (existing?.length ?? 0) + toInsert.length;
  if (finalCount > settings.max_companies) {
    return NextResponse.json(
      { error: `Import would exceed the company cap (${settings.max_companies}).` },
      { status: 400 }
    );
  }

  let inserted = 0;
  let updated = 0;
  let removed = 0;
  let keptWithApplications = 0;

  // Order within tiers follows file order, appended after existing rows.
  let sortBase = (existing ?? []).reduce((m, c) => Math.max(m, c.sort_order), 0) + 1;

  if (toInsert.length > 0) {
    const { error } = await supabase.from("companies").insert(
      toInsert.map((r) => ({
        user_id: user.id,
        name: r.name,
        recruitment_url: r.recruitment_url,
        tier: r.tier,
        sort_order: sortBase++,
      }))
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    inserted = toInsert.length;
  }

  for (const r of toUpdate) {
    const current = byName.get(r.name.toLowerCase())!;
    const { error } = await supabase
      .from("companies")
      .update({ recruitment_url: r.recruitment_url, tier: r.tier })
      .eq("id", current.id);
    if (!error) updated++;
  }

  if (replace) {
    const keepNames = new Set(incoming.map((r) => r.name.toLowerCase()));
    const toRemove = (existing ?? []).filter((c) => !keepNames.has(c.name.toLowerCase()));
    for (const company of toRemove) {
      const { count } = await supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .eq("company_id", company.id);
      if ((count ?? 0) > 0) {
        keptWithApplications++;
        continue; // never orphan application history
      }
      const { error } = await supabase.from("companies").delete().eq("id", company.id);
      if (!error) removed++;
    }
  }

  return NextResponse.json({
    inserted,
    updated,
    removed,
    kept_with_applications: keptWithApplications,
  });
}
