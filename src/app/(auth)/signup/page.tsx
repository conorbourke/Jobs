"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Sign-up open/closed is enforced server-side too (api/auth/signup-check).
      const check = await fetch("/api/auth/signup-check");
      if (check.ok) {
        const { open } = await check.json();
        if (!open) {
          setError("Sign-ups are currently closed.");
          return;
        }
      }

      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
        },
      });
      if (error) {
        setError(error.message);
        return;
      }
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error && /url|key|required|fetch/i.test(err.message)
          ? "Sign-up is temporarily unavailable — the service isn't fully configured yet. Please try again shortly."
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-3 text-sm text-neutral-600">
        <h1 className="text-lg font-semibold text-neutral-900">Check your email</h1>
        <p>
          We sent a verification link to <strong>{email}</strong>. Click it to
          activate your account, then sign in.
        </p>
        <Link href="/login" className="btn-secondary w-full">Back to sign in</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-lg font-semibold">Create your account</h1>
      <p className="text-sm text-neutral-500">
        Free to use. We only ask for your email and a name.
      </p>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div>
        <label className="label" htmlFor="name">Name</label>
        <input id="name" required className="input" value={name}
          onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" type="email" required className="input" value={email}
          onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" type="password" required minLength={8} className="input"
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Creating…" : "Sign up"}
      </button>
      <p className="text-center text-sm text-neutral-500">
        Already have an account?{" "}
        <Link className="text-accent-600 hover:underline" href="/login">Sign in</Link>
      </p>
    </form>
  );
}
