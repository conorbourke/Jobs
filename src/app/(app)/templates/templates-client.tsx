"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EMPTY_CV, mergeWithMaster, type CvContent } from "@/lib/cv-schema";
import type { CoverTemplate, CvTemplate } from "@/lib/types";

export function TemplatesClient({
  userId,
  templates: initialTemplates,
  cover,
  maxTemplates,
}: {
  userId: string;
  templates: CvTemplate[];
  cover: CoverTemplate | null;
  maxTemplates: number;
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const master = templates.find((t) => t.is_master) ?? null;
  const roleTemplates = templates.filter((t) => !t.is_master);
  const [error, setError] = useState<string | null>(null);

  async function createMaster() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("cv_templates")
      .insert({ user_id: userId, label: "Master CV", is_master: true, content: EMPTY_CV })
      .select()
      .single();
    if (error) return setError(error.message);
    setTemplates([data as CvTemplate, ...templates]);
  }

  async function createRoleTemplate() {
    if (!master) return;
    if (templates.length >= maxTemplates) {
      return setError(`Template cap reached (${maxTemplates}).`);
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("cv_templates")
      .insert({
        user_id: userId,
        label: `Role template ${roleTemplates.length + 1}`,
        is_master: false,
        content: master.content, // starts as a copy; fixed slots stay inherited
      })
      .select()
      .single();
    if (error) return setError(error.message);
    setTemplates([...templates, data as CvTemplate]);
  }

  async function saveTemplate(t: CvTemplate, content: CvContent, label: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from("cv_templates")
      .update({ content, label })
      .eq("id", t.id);
    if (error) return setError(error.message);
    setTemplates(templates.map((x) => (x.id === t.id ? { ...x, content, label } : x)));

    // Fixed slots (companies, dates, education, name) propagate from master
    // to every role template.
    if (t.is_master) {
      const updated = await Promise.all(
        roleTemplates.map(async (rt) => {
          const merged = mergeWithMaster(content, {
            role_title: rt.content.role_title,
            about_me: rt.content.about_me,
            licenses: rt.content.licenses,
            experience_overrides: rt.content.experience?.map((e) => ({
              role_title: e.role_title,
              responsibilities: e.responsibilities,
            })),
          });
          await supabase.from("cv_templates").update({ content: merged }).eq("id", rt.id);
          return { ...rt, content: merged };
        })
      );
      setTemplates([
        { ...t, content, label },
        ...updated,
      ]);
    }
  }

  async function deleteTemplate(id: string) {
    await createClient().from("cv_templates").delete().eq("id", id);
    setTemplates(templates.filter((t) => t.id !== id));
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">CV Templates</h1>
        <span className="text-sm text-neutral-500">
          {templates.length}/{maxTemplates} templates
        </span>
      </div>
      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}{" "}
          <button className="underline" onClick={() => setError(null)}>dismiss</button>
        </p>
      )}

      {/* Master CV at the top */}
      {!master ? (
        <div className="card p-8 text-center">
          <p className="text-neutral-600">
            Start by creating your master CV — role templates and all AI
            generation derive from it.
          </p>
          <button onClick={createMaster} className="btn-primary mt-4">
            Create master CV
          </button>
        </div>
      ) : (
        <TemplateEditor
          key={master.id}
          template={master}
          isMaster
          onSave={saveTemplate}
        />
      )}

      {/* Role templates */}
      {master && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Role templates</h2>
            <button onClick={createRoleTemplate} className="btn-secondary">
              + New role template
            </button>
          </div>
          <p className="mb-4 text-sm text-neutral-500">
            Companies, dates and education are fixed and inherited from the
            master. Each template varies About Me, role title, responsibilities
            and licenses & qualifications. The label is what appears in the
            generation dropdown.
          </p>
          <div className="space-y-4">
            {roleTemplates.map((t) => (
              <TemplateEditor
                key={t.id}
                template={t}
                isMaster={false}
                onSave={saveTemplate}
                onDelete={() => deleteTemplate(t.id)}
              />
            ))}
            {roleTemplates.length === 0 && (
              <p className="text-sm text-neutral-400">No role templates yet.</p>
            )}
          </div>
        </section>
      )}

      {/* Cover template */}
      <CoverTemplateEditor userId={userId} cover={cover} />
    </div>
  );
}

/* ----------------------------- Template editor ----------------------------- */

function TemplateEditor({
  template,
  isMaster,
  onSave,
  onDelete,
}: {
  template: CvTemplate;
  isMaster: boolean;
  onSave: (t: CvTemplate, content: CvContent, label: string) => Promise<void>;
  onDelete?: () => void;
}) {
  const [open, setOpen] = useState(isMaster);
  const [label, setLabel] = useState(template.label);
  const [cv, setCv] = useState<CvContent>({ ...EMPTY_CV, ...template.content });
  const [saved, setSaved] = useState(false);

  async function save() {
    await onSave(template, cv, label);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function setExp(i: number, patch: Partial<CvContent["experience"][number]>) {
    setCv({
      ...cv,
      experience: cv.experience.map((e, j) => (j === i ? { ...e, ...patch } : e)),
    });
  }

  return (
    <div className="card">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-6 py-4 text-left"
      >
        <span className="font-semibold">
          {isMaster ? "Master CV" : template.label}
          {isMaster && <span className="badge ml-2 bg-accent-50 text-accent-700">master</span>}
        </span>
        <span className={`text-neutral-400 transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-neutral-100 p-6">
          {!isMaster && (
            <div>
              <label className="label">Label (shown in the generation dropdown)</label>
              <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
          )}

          {isMaster ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Full name</label>
                <input className="input" value={cv.full_name}
                  onChange={(e) => setCv({ ...cv, full_name: e.target.value })} />
              </div>
              <div>
                <label className="label">Contact line (email · phone · location)</label>
                <input className="input" value={cv.contact_line}
                  onChange={(e) => setCv({ ...cv, contact_line: e.target.value })} />
              </div>
            </div>
          ) : (
            <p className="text-xs text-neutral-400">
              Name, contact, companies, dates and education are inherited from the master.
            </p>
          )}

          <div>
            <label className="label">Role / title</label>
            <input className="input" value={cv.role_title}
              onChange={(e) => setCv({ ...cv, role_title: e.target.value })} />
          </div>

          <div>
            <label className="label">About me</label>
            <textarea className="input min-h-24" value={cv.about_me}
              onChange={(e) => setCv({ ...cv, about_me: e.target.value })} />
          </div>

          {/* Experience */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="label mb-0">Experience</label>
              {isMaster && (
                <button
                  className="text-xs font-medium text-accent-600 hover:underline"
                  onClick={() =>
                    setCv({
                      ...cv,
                      experience: [
                        ...cv.experience,
                        { company: "", dates: "", role_title: "", responsibilities: [] },
                      ],
                    })
                  }
                >
                  + Add position
                </button>
              )}
            </div>
            <div className="space-y-3">
              {cv.experience.map((exp, i) => (
                <div key={i} className="rounded-lg border border-neutral-200 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label">Company {!isMaster && "(fixed)"}</label>
                      <input className="input disabled:bg-neutral-50 disabled:text-neutral-500"
                        value={exp.company} disabled={!isMaster}
                        onChange={(e) => setExp(i, { company: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">Dates {!isMaster && "(fixed)"}</label>
                      <input className="input disabled:bg-neutral-50 disabled:text-neutral-500"
                        value={exp.dates} disabled={!isMaster}
                        placeholder="Jan 2020 – Mar 2023"
                        onChange={(e) => setExp(i, { dates: e.target.value })} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="label">Role title</label>
                    <input className="input" value={exp.role_title}
                      onChange={(e) => setExp(i, { role_title: e.target.value })} />
                  </div>
                  <div className="mt-3">
                    <label className="label">Responsibilities (one per line)</label>
                    <textarea className="input min-h-20"
                      value={exp.responsibilities.join("\n")}
                      onChange={(e) =>
                        setExp(i, {
                          responsibilities: e.target.value.split("\n").filter((l) => l.trim()),
                        })
                      } />
                  </div>
                  {isMaster && (
                    <button
                      className="mt-2 text-xs text-neutral-400 hover:text-red-600"
                      onClick={() =>
                        setCv({ ...cv, experience: cv.experience.filter((_, j) => j !== i) })
                      }
                    >
                      Remove position
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Licenses & qualifications (one per line)</label>
            <textarea className="input min-h-20" value={cv.licenses.join("\n")}
              onChange={(e) =>
                setCv({ ...cv, licenses: e.target.value.split("\n").filter((l) => l.trim()) })
              } />
          </div>

          {/* Education */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="label mb-0">Education {!isMaster && "(fixed — from master)"}</label>
              {isMaster && (
                <button
                  className="text-xs font-medium text-accent-600 hover:underline"
                  onClick={() =>
                    setCv({
                      ...cv,
                      education: [...cv.education, { institution: "", qualification: "", dates: "" }],
                    })
                  }
                >
                  + Add education
                </button>
              )}
            </div>
            {isMaster ? (
              <div className="space-y-2">
                {cv.education.map((ed, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_8rem_auto]">
                    <input className="input" placeholder="Qualification" value={ed.qualification}
                      onChange={(e) =>
                        setCv({
                          ...cv,
                          education: cv.education.map((x, j) =>
                            j === i ? { ...x, qualification: e.target.value } : x
                          ),
                        })
                      } />
                    <input className="input" placeholder="Institution" value={ed.institution}
                      onChange={(e) =>
                        setCv({
                          ...cv,
                          education: cv.education.map((x, j) =>
                            j === i ? { ...x, institution: e.target.value } : x
                          ),
                        })
                      } />
                    <input className="input" placeholder="Dates" value={ed.dates}
                      onChange={(e) =>
                        setCv({
                          ...cv,
                          education: cv.education.map((x, j) =>
                            j === i ? { ...x, dates: e.target.value } : x
                          ),
                        })
                      } />
                    <button className="text-xs text-neutral-400 hover:text-red-600"
                      onClick={() =>
                        setCv({ ...cv, education: cv.education.filter((_, j) => j !== i) })
                      }>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <ul className="space-y-1 text-sm text-neutral-500">
                {cv.education.map((ed, i) => (
                  <li key={i}>
                    {ed.qualification} — {ed.institution} ({ed.dates})
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={save} className="btn-primary">
              {saved ? "Saved ✓" : "Save template"}
            </button>
            {onDelete && (
              <button onClick={onDelete} className="btn-secondary text-red-600">
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Cover template ----------------------------- */

function CoverTemplateEditor({
  userId,
  cover,
}: {
  userId: string;
  cover: CoverTemplate | null;
}) {
  const [body, setBody] = useState(
    cover?.body ??
      `{{date}}

Dear {{company}} hiring team,

{{body}}

Yours sincerely,`
  );
  const [saved, setSaved] = useState(false);

  async function save() {
    const supabase = createClient();
    await supabase
      .from("cover_templates")
      .upsert({ user_id: userId, body }, { onConflict: "user_id" });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <section className="card p-6">
      <h2 className="font-semibold">Cover letter template</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Merge fields: <code className="rounded bg-neutral-100 px-1">{"{{name}}"}</code>{" "}
        <code className="rounded bg-neutral-100 px-1">{"{{company}}"}</code>{" "}
        <code className="rounded bg-neutral-100 px-1">{"{{role}}"}</code>{" "}
        <code className="rounded bg-neutral-100 px-1">{"{{date}}"}</code>{" "}
        <code className="rounded bg-neutral-100 px-1">{"{{body}}"}</code> — the
        AI-tailored letter is inserted at {"{{body}}"}. Your signature image
        (uploaded in Settings) is rendered at the foot of every letter.
      </p>
      <textarea className="input mt-4 min-h-48 font-mono text-xs" value={body}
        onChange={(e) => setBody(e.target.value)} />
      <button onClick={save} className="btn-primary mt-3">
        {saved ? "Saved ✓" : "Save cover template"}
      </button>
    </section>
  );
}
