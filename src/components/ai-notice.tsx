"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** One-time post-signup notice about platform-powered AI and limits. */
export function AiNotice() {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  async function dismiss() {
    setHidden(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("profiles")
        .update({ ai_notice_dismissed: true })
        .eq("id", user.id);
    }
  }

  return (
    <div className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-accent-200 bg-accent-50 p-4 text-sm text-accent-700">
      <p>
        <strong>Welcome!</strong> AI features (CV tailoring, cover letters,
        briefs, form answers) are powered by the platform. Generation limits
        may apply — see Settings for details.
      </p>
      <button onClick={dismiss} className="shrink-0 font-medium underline">
        Got it
      </button>
    </div>
  );
}
