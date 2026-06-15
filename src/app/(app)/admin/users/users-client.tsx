"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/labels";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  plan: string;
  trial_ends_at: string | null;
  fees_waived: boolean;
  deactivated: boolean;
  created_at: string;
  ai_calls: number;
  ai_cost: number;
}

export function UsersClient({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function action(userId: string, action: string) {
    setBusyId(userId);
    setError(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, action }),
    });
    setBusyId(null);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Action failed");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-neutral-400">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Signed up</th>
              <th className="px-4 py-3 font-medium">AI usage</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={`border-t border-neutral-100 ${u.deactivated ? "opacity-50" : ""}`}>
                <td className="px-4 py-3 font-medium">
                  {u.name || "—"}
                  {u.role === "superadmin" && (
                    <span className="badge ml-2 bg-accent-50 text-accent-700">admin</span>
                  )}
                  {u.deactivated && (
                    <span className="badge ml-2 bg-red-50 text-red-700">deactivated</span>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-500">{u.email}</td>
                <td className="px-4 py-3">
                  {u.plan}
                  {u.fees_waived && (
                    <span className="badge ml-2 bg-green-50 text-green-700">fees waived</span>
                  )}
                  {u.trial_ends_at && (
                    <span className="block text-xs text-neutral-400">
                      trial ends {formatDate(u.trial_ends_at)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-500">{formatDate(u.created_at)}</td>
                <td className="px-4 py-3 text-neutral-500">
                  {u.ai_calls} calls · ${u.ai_cost.toFixed(2)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <button onClick={() => action(u.id, "toggle_fees_waived")}
                      disabled={busyId === u.id} className="btn-ghost px-2 py-1 text-xs">
                      {u.fees_waived ? "Unwaive fees" : "Waive fees"}
                    </button>
                    <button onClick={() => action(u.id, "extend_trial")}
                      disabled={busyId === u.id} className="btn-ghost px-2 py-1 text-xs">
                      Extend trial 14d
                    </button>
                    <button onClick={() => action(u.id, "toggle_deactivated")}
                      disabled={busyId === u.id}
                      className="btn-ghost px-2 py-1 text-xs text-red-600">
                      {u.deactivated ? "Reactivate" : "Deactivate"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
