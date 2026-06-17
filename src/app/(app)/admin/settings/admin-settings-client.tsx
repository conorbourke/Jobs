"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AdminSettings } from "@/lib/types";

/**
 * Platform-wide settings. Everything here is read live by the app — caps,
 * pricing, AI model, donation URL — nothing is hardcoded elsewhere.
 */
export function AdminSettingsClient({ settings }: { settings: AdminSettings }) {
  const [s, setS] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("admin_settings")
      .update({
        price_monthly_gbp: s.price_monthly_gbp,
        trial_days: s.trial_days,
        max_companies: s.max_companies,
        max_roles: s.max_roles,
        max_cv_templates: s.max_cv_templates,
        default_ai_model: s.default_ai_model,
        cheap_ai_model: s.cheap_ai_model,
        ai_monthly_generation_limit: s.ai_monthly_generation_limit,
        donation_url: s.donation_url,
        signup_open: s.signup_open,
        billing_enabled: s.billing_enabled,
      })
      .eq("id", 1);
    if (error) {
      setError(error.message);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function num(v: string): number {
    return Number(v) || 0;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Admin Settings</h1>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <section className="card space-y-4 p-6">
        <h2 className="font-semibold">Billing (future)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Price (£/month)</label>
            <input type="number" step="0.01" className="input" value={s.price_monthly_gbp}
              onChange={(e) => setS({ ...s, price_monthly_gbp: num(e.target.value) })} />
          </div>
          <div>
            <label className="label">Free trial length (days)</label>
            <input type="number" className="input" value={s.trial_days}
              onChange={(e) => setS({ ...s, trial_days: num(e.target.value) })} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={s.billing_enabled}
            onChange={(e) => setS({ ...s, billing_enabled: e.target.checked })} />
          <span>
            <strong>billing_enabled</strong> — shows billing UI when Stripe is
            integrated. Leave off until then.
          </span>
        </label>
      </section>

      <section className="card space-y-4 p-6">
        <h2 className="font-semibold">Caps</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Max companies</label>
            <input type="number" className="input" value={s.max_companies}
              onChange={(e) => setS({ ...s, max_companies: num(e.target.value) })} />
          </div>
          <div>
            <label className="label">Max roles of interest</label>
            <input type="number" className="input" value={s.max_roles}
              onChange={(e) => setS({ ...s, max_roles: num(e.target.value) })} />
          </div>
          <div>
            <label className="label">Max CV templates</label>
            <input type="number" className="input" value={s.max_cv_templates}
              onChange={(e) => setS({ ...s, max_cv_templates: num(e.target.value) })} />
          </div>
        </div>
      </section>

      <section className="card space-y-4 p-6">
        <h2 className="font-semibold">AI</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Writing model (premium)</label>
            <input className="input" value={s.default_ai_model}
              onChange={(e) => setS({ ...s, default_ai_model: e.target.value })} />
            <p className="mt-1 text-xs text-neutral-400">
              Used for the candidate-facing writing: tailored CV &amp; cover letter.
            </p>
          </div>
          <div>
            <label className="label">Cheap model (everything else)</label>
            <input className="input" value={s.cheap_ai_model}
              onChange={(e) => setS({ ...s, cheap_ai_model: e.target.value })} />
            <p className="mt-1 text-xs text-neutral-400">
              Summaries, briefs, interview prep, form answers, URL scraping.
            </p>
          </div>
          <div>
            <label className="label">Monthly generation limit per user</label>
            <input type="number" className="input"
              value={s.ai_monthly_generation_limit ?? ""}
              placeholder="empty = unlimited"
              onChange={(e) =>
                setS({
                  ...s,
                  ai_monthly_generation_limit:
                    e.target.value === "" ? null : num(e.target.value),
                })
              } />
          </div>
        </div>
      </section>

      <section className="card space-y-4 p-6">
        <h2 className="font-semibold">Platform</h2>
        <div>
          <label className="label">Donation URL (Buy Me a Coffee)</label>
          <input className="input" value={s.donation_url}
            onChange={(e) => setS({ ...s, donation_url: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={s.signup_open}
            onChange={(e) => setS({ ...s, signup_open: e.target.checked })} />
          Sign-up open
        </label>
      </section>

      <button onClick={save} className="btn-primary">
        {saved ? "Saved ✓" : "Save settings"}
      </button>
    </div>
  );
}
