"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { APP_NAME } from "@/config";
import { createClient } from "@/lib/supabase/client";

const TABS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tracker", label: "Tracker" },
  { href: "/suggested", label: "New Jobs" },
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
            ? "bg-white/15 text-white"
            : "text-blue-100/80 hover:bg-white/10 hover:text-white"
        }`}
      >
        {label}
      </Link>
    );
  }

  return (
    <aside className="fixed inset-y-0 left-0 flex w-56 flex-col border-r border-blue-950 bg-blue-900 text-blue-100">
      <div className="px-5 py-5">
        <Link href="/dashboard" className="text-lg font-semibold tracking-tight text-white">
          {APP_NAME}
        </Link>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {TABS.map((t) => (
          <NavLink key={t.href} {...t} />
        ))}
        {isSuperadmin && (
          <>
            <div className="px-3 pt-5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-blue-300/70">
              Superadmin
            </div>
            {ADMIN_TABS.map((t) => (
              <NavLink key={t.href} {...t} />
            ))}
          </>
        )}
      </nav>
      <div className="border-t border-white/10 p-4">
        <p className="truncate text-xs text-blue-200" title={userName}>
          {userName}
        </p>
        <button onClick={signOut} className="mt-1 text-xs text-blue-300 hover:text-white">
          Sign out
        </button>
      </div>
    </aside>
  );
}
