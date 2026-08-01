"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/timeout";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const supabase = createClient();
      const { error } = await withTimeout(
        supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        }),
        8000,
        "reset-password"
      );
      if (error) setError(error.message);
      else setSent(true);
    } catch {
      setError(
        "This is taking longer than expected — the service may be temporarily unavailable. Please try again shortly."
      );
    }
  }

  if (sent) {
    return (
      <div className="space-y-3 text-sm text-neutral-600">
        <h1 className="text-lg font-semibold text-neutral-900">Check your email</h1>
        <p>If an account exists for {email}, a reset link is on its way.</p>
        <Link href="/login" className="btn-secondary w-full">Back to sign in</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-lg font-semibold">Reset password</h1>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" type="email" required className="input" value={email}
          onChange={(e) => setEmail(e.target.value)} />
      </div>
      <button type="submit" className="btn-primary w-full">Send reset link</button>
    </form>
  );
}
