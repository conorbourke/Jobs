"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, RoleOfInterest, UserSettings } from "@/lib/types";

interface ImportRow {
  name: string;
  recruitment_url: string;
  tier: "primary" | "secondary";
  duplicateInFile?: boolean;
  duplicateExisting?: boolean;
}

export function SettingsClient({
  profile,
  roles: initialRoles,
  maxRoles,
  maxCompanies,
  aiModel,
  donationUrl,
  aiLimit,
}: {
  profile: Profile;
  roles: RoleOfInterest[];
  maxRoles: number;
  maxCompanies: number;
  aiModel: string;
  donationUrl: string;
  aiLimit: number | null;
}) {
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <NotificationSettings profile={profile} />
      <BehaviourSettings profile={profile} />
      <CompanyImport maxCompanies={maxCompanies} />
      <RolesManager initialRoles={initialRoles} maxRoles={maxRoles} />
      <SignatureUpload userId={profile.id} />
      <AiInfo aiModel={aiModel} aiLimit={aiLimit} donationUrl={donationUrl} />
      <FeatureRequest userId={profile.id} />
      <DataPrivacy />
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-6">
      <h2 className="font-semibold text-neutral-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/* ----------------------------- Notifications ----------------------------- */

function NotificationSettings({ profile }: { profile: Profile }) {
  const [email, setEmail] = useState(profile.notification_email ?? "");
  const [name, setName] = useState(profile.name);
  const [saved, setSaved] = useState(false);

  async function save() {
    const supabase = createClient();
    await supabase
      .from("profiles")
      .update({ notification_email: email, name })
      .eq("id", profile.id);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Section
      title="Profile & notifications"
      description="Calendar invites (.ics) and interview briefs are sent to your notification email."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Notification email</label>
          <input className="input" type="email" value={email}
            onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
      <button onClick={save} className="btn-primary mt-4">
        {saved ? "Saved ✓" : "Save"}
      </button>
    </Section>
  );
}

/* ----------------------------- Behaviour toggles ----------------------------- */

const TOGGLES: { key: keyof UserSettings; label: string; help: string }[] = [
  {
    key: "email_summary_enabled",
    label: "AI email thread summaries",
    help: "Regenerate the pinned summary whenever you paste a new email.",
  },
  {
    key: "auto_briefs_on_schedule",
    label: "Auto-generate briefs on scheduling",
    help: "Create the company brief and interview prep PDFs when you schedule an interview.",
  },
  {
    key: "ics_enabled",
    label: "Send calendar invites",
    help: "Email a .ics invite (with briefs attached) when an interview is scheduled.",
  },
];

function BehaviourSettings({ profile }: { profile: Profile }) {
  const [settings, setSettings] = useState<UserSettings>(profile.settings ?? {});

  async function toggle(key: keyof UserSettings) {
    const next = { ...settings, [key]: !(settings[key] ?? true) };
    setSettings(next);
    const supabase = createClient();
    await supabase.from("profiles").update({ settings: next }).eq("id", profile.id);
  }

  return (
    <Section title="Behaviour" description="Everything tweakable lives here — no code changes needed.">
      <div className="space-y-3">
        {TOGGLES.map((t) => (
          <label key={t.key} className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-indigo-600"
              checked={(settings[t.key] as boolean | undefined) ?? true}
              onChange={() => toggle(t.key)}
            />
            <span>
              <span className="block text-sm font-medium text-neutral-800">{t.label}</span>
              <span className="block text-xs text-neutral-500">{t.help}</span>
            </span>
          </label>
        ))}
      </div>
    </Section>
  );
}

/* ----------------------------- Company import ----------------------------- */

function CompanyImport({ maxCompanies }: { maxCompanies: number }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    try {
      let parsed: { name: string; recruitment_url: string; tier: string }[];
      if (file.name.toLowerCase().endsWith(".csv")) {
        parsed = parseCsv(await file.text());
      } else {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        parsed = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      }
      const cleaned: ImportRow[] = parsed
        .map((r) => {
          const rec = r as Record<string, unknown>;
          const get = (k: string) =>
            String(rec[k] ?? rec[k.charAt(0).toUpperCase() + k.slice(1)] ?? "").trim();
          return {
            name: get("name"),
            recruitment_url: get("recruitment_url") || get("url"),
            tier: (get("tier").toLowerCase() === "primary" ? "primary" : "secondary") as
              | "primary"
              | "secondary",
          };
        })
        .filter((r) => r.name.length > 0);

      // Duplicate warnings: within the file…
      const seen = new Set<string>();
      for (const row of cleaned) {
        const key = row.name.toLowerCase();
        if (seen.has(key)) row.duplicateInFile = true;
        seen.add(key);
      }
      // …and against the existing list.
      const supabase = createClient();
      const { data: existing } = await supabase.from("companies").select("name");
      const existingNames = new Set((existing ?? []).map((c) => c.name.toLowerCase()));
      for (const row of cleaned) {
        if (existingNames.has(row.name.toLowerCase())) row.duplicateExisting = true;
      }
      setRows(cleaned);
    } catch (err) {
      setError(`Could not parse file: ${err instanceof Error ? err.message : err}`);
    }
  }

  async function confirmImport() {
    if (!rows) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/companies/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: rows
          .filter((r) => !r.duplicateInFile)
          .map(({ name, recruitment_url, tier }) => ({ name, recruitment_url, tier })),
        replace,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Import failed");
      return;
    }
    setResult(
      `Imported: ${json.inserted} new, ${json.updated} updated` +
        (json.removed ? `, ${json.removed} removed` : "") +
        (json.kept_with_applications
          ? `. ${json.kept_with_applications} not removed because they have applications.`
          : ".")
    );
    setRows(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const dupes = rows?.filter((r) => r.duplicateInFile).length ?? 0;
  const existingDupes = rows?.filter((r) => r.duplicateExisting).length ?? 0;

  return (
    <Section
      title="Master company list"
      description={`Upload .xlsx or .csv with columns: name, recruitment_url, tier (primary/secondary). Cap: ${maxCompanies} companies. Existing companies are matched by name and updated in place — their IDs and application history are always preserved.`}
    >
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.csv"
        onChange={onFile}
        className="block text-sm text-neutral-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium"
      />
      {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {result && <p className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">{result}</p>}
      {rows && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-neutral-600">
            {rows.length} rows parsed.
            {dupes > 0 && (
              <span className="text-amber-700"> {dupes} duplicate name(s) within the file will be skipped.</span>
            )}
            {existingDupes > 0 && (
              <span className="text-amber-700"> {existingDupes} already exist and will be updated.</span>
            )}
          </p>
          <div className="max-h-64 overflow-auto rounded-lg border border-neutral-200">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-neutral-50 text-xs text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Recruitment URL</th>
                  <th className="px-3 py-2">Tier</th>
                  <th className="px-3 py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-neutral-100">
                    <td className="px-3 py-1.5">{r.name}</td>
                    <td className="max-w-48 truncate px-3 py-1.5 text-neutral-500">{r.recruitment_url}</td>
                    <td className="px-3 py-1.5">{r.tier}</td>
                    <td className="px-3 py-1.5 text-xs text-amber-700">
                      {r.duplicateInFile ? "duplicate in file" : r.duplicateExisting ? "exists — will update" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={replace}
              onChange={(e) => setReplace(e.target.checked)} />
            Replace list — remove companies not in this file (companies with applications are kept)
          </label>
          <div className="flex gap-2">
            <button onClick={confirmImport} disabled={busy} className="btn-primary">
              {busy ? "Importing…" : "Confirm import"}
            </button>
            <button onClick={() => setRows(null)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}
    </Section>
  );
}

function parseCsv(text: string): { name: string; recruitment_url: string; tier: string }[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const get = (name: string) => cells[headers.indexOf(name)] ?? "";
    return {
      name: get("name").trim(),
      recruitment_url: (get("recruitment_url") || get("url")).trim(),
      tier: get("tier").trim(),
    };
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/* ----------------------------- Roles of interest ----------------------------- */

function RolesManager({
  initialRoles,
  maxRoles,
}: {
  initialRoles: RoleOfInterest[];
  maxRoles: number;
}) {
  const [roles, setRoles] = useState(initialRoles);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function addRole(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (roles.length >= maxRoles) {
      setError(`You've reached the cap of ${maxRoles} roles.`);
      return;
    }
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("roles_of_interest")
      .insert({ user_id: user!.id, title, sort_order: roles.length })
      .select()
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    setRoles([...roles, data as RoleOfInterest]);
    setTitle("");
  }

  async function removeRole(id: string) {
    setRoles(roles.filter((r) => r.id !== id));
    await createClient().from("roles_of_interest").delete().eq("id", id);
  }

  return (
    <Section
      title="Target job roles"
      description={`Roles you're aiming for (${roles.length}/${maxRoles}).`}
    >
      {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <form onSubmit={addRole} className="flex gap-2">
        <input className="input" placeholder="e.g. Operations Manager" value={title}
          onChange={(e) => setTitle(e.target.value)} required />
        <button type="submit" className="btn-primary shrink-0">Add</button>
      </form>
      <ul className="mt-3 divide-y divide-neutral-100">
        {roles.map((r) => (
          <li key={r.id} className="flex items-center justify-between py-2 text-sm">
            <span>{r.title}</span>
            <button onClick={() => removeRole(r.id)}
              className="text-xs text-neutral-400 hover:text-red-600">
              Remove
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ----------------------------- Signature ----------------------------- */

function SignatureUpload({ userId }: { userId: string }) {
  const [status, setStatus] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/\.(jpe?g|png)$/i.test(file.name)) {
      setStatus("Please upload a .jpg or .png image.");
      return;
    }
    setStatus("Uploading…");
    const supabase = createClient();
    const path = `${userId}/signature-${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("signatures").upload(path, file);
    if (error) {
      setStatus(`Upload failed: ${error.message}`);
      return;
    }
    await supabase
      .from("cover_templates")
      .upsert({ user_id: userId, signature_image_path: path }, { onConflict: "user_id" });
    setStatus("Signature saved ✓ — it will be rendered into generated cover letters.");
  }

  return (
    <Section
      title="Signature"
      description="Upload a jpg/png of your signature; it's placed at the foot of generated cover letters."
    >
      <input type="file" accept=".jpg,.jpeg,.png" onChange={onFile}
        className="block text-sm text-neutral-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium" />
      {status && <p className="mt-3 text-sm text-neutral-600">{status}</p>}
    </Section>
  );
}

/* ----------------------------- AI info ----------------------------- */

function AiInfo({
  aiModel,
  aiLimit,
  donationUrl,
}: {
  aiModel: string;
  aiLimit: number | null;
  donationUrl: string;
}) {
  return (
    <Section title="AI" description="AI generation is powered by the platform.">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-neutral-500">Model</dt>
          <dd className="font-medium">{aiModel}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Monthly generation limit</dt>
          <dd className="font-medium">{aiLimit === null ? "Unlimited" : aiLimit}</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-neutral-500">
        Finding it useful?{" "}
        <a href={donationUrl} target="_blank" rel="noopener noreferrer"
          className="text-amber-600 hover:underline">
          Buy me a coffee ☕
        </a>
      </p>
    </Section>
  );
}

/* ----------------------------- Feature requests ----------------------------- */

function FeatureRequest({ userId }: { userId: string }) {
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await createClient().from("feature_requests").insert({ user_id: userId, body });
    setBody("");
    setSent(true);
    setTimeout(() => setSent(false), 3000);
  }

  return (
    <Section title="Request a feature" description="Tell us what would make this more useful.">
      <form onSubmit={submit} className="space-y-3">
        <textarea className="input min-h-24" required value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="It would be great if…" />
        <button type="submit" className="btn-secondary">{sent ? "Thanks! ✓" : "Send"}</button>
      </form>
    </Section>
  );
}

/* ----------------------------- Data & privacy ----------------------------- */

function DataPrivacy() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteAccount() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: typed }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Deletion failed");
      setBusy(false);
      return;
    }
    await createClient().auth.signOut();
    router.push("/");
  }

  return (
    <Section title="Your data" description="UK GDPR: export everything, or erase your account entirely.">
      <div className="flex flex-wrap gap-3">
        <a href="/api/account/export" className="btn-secondary">Download my data (.zip)</a>
        {!confirming ? (
          <button onClick={() => setConfirming(true)} className="btn-danger">Delete account…</button>
        ) : (
          <div className="w-full space-y-3 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">
              This permanently deletes your account, all applications, templates,
              documents and files. It cannot be undone. Type <strong>DELETE</strong> to confirm.
            </p>
            <input className="input max-w-xs" value={typed}
              onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" />
            {error && <p className="text-sm text-red-700">{error}</p>}
            <div className="flex gap-2">
              <button onClick={deleteAccount} disabled={typed !== "DELETE" || busy}
                className="btn-danger">
                {busy ? "Deleting…" : "Permanently delete"}
              </button>
              <button onClick={() => setConfirming(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
