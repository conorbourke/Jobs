"use client";

import { useEffect, useState } from "react";
import { APP_NAME } from "@/config";

/**
 * Informational cookie notice: only strictly-necessary cookies (auth session)
 * are used, so no consent choice is required. If analytics are ever added
 * they must become opt-in here.
 */
export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("cookie-notice-ack")) setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200 bg-white/95 p-4 backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 text-sm text-neutral-600">
        <p>
          {APP_NAME} only uses strictly-necessary cookies to keep you signed
          in. No tracking, no analytics.{" "}
          <a href="/privacy" className="text-accent-600 underline">
            Privacy policy
          </a>
        </p>
        <button
          className="btn-primary"
          onClick={() => {
            localStorage.setItem("cookie-notice-ack", "1");
            setVisible(false);
          }}
        >
          OK
        </button>
      </div>
    </div>
  );
}
