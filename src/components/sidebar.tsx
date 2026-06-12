"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { APP_NAME } from "@/config";
import { createClient } from "@/lib/supabase/client";

const TABS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tracker", label: "Tracker" },
  { href: "/suggested", label: "Suggested Jobs" },
  { href: "/forms", label: "Application Forms" },
  { href: "/templates", label: "CV Templates" },
  { href: "/settings", label: "Settings" },
];

const ADMIN_TABS = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/settings", label: "Admin Settings" },
];

export function Sidebar({
  isSuperadmin,
  userName,
}: {
  isSuperadmin: boolean;
  userName: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function NavLink({ href, label }: { href: string; label: string }) {
    const active = pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        href={href}
        className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          active
            ? "bg-accent-50 text-accent-700"
            : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
        }`}
      >
        {label}
      </Link>
    );
  }

  return (
    <aside className="fixed inset-y-0 left-0 flex w-56 flex-col border-r border-neutral-200 bg-white">
      <div className="px-5 py-5">
        <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
          {APP_NAME}
        </Link>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {TABS.map((t) => (
          <NavLink key={t.href} {...t} />
        ))}
        {isSuperadmin && (
          <>
            <div className="px-3 pt-5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Superadmin
            </div>
            {ADMIN_TABS.map((t) => (
              <NavLink key={t.href} {...t} />
            ))}
          </>
        )}
      </nav>
      <div className="border-t border-neutral-200 p-4">
        <p className="truncate text-xs text-neutral-500" title={userName}>
          {userName}
        </p>
        <button onClick={signOut} className="mt-1 text-xs text-neutral-400 hover:text-neutral-700">
          Sign out
        </button>
      </div>
    </aside>
  );
}
