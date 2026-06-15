import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";
import { UsersClient, type UserRow } from "./users-client";

export const metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "superadmin") redirect("/dashboard");

  const admin = createAdminClient();
  const [{ data: profiles }, { data: authUsers }, { data: usage }] = await Promise.all([
    admin.from("profiles").select("*").order("created_at").returns<Profile[]>(),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("ai_usage_log").select("user_id, cost_estimate"),
  ]);

  const emailById = new Map(authUsers?.users.map((u) => [u.id, u.email ?? ""]) ?? []);
  const usageById = new Map<string, { calls: number; cost: number }>();
  for (const u of usage ?? []) {
    const cur = usageById.get(u.user_id) ?? { calls: 0, cost: 0 };
    cur.calls += 1;
    cur.cost += Number(u.cost_estimate ?? 0);
    usageById.set(u.user_id, cur);
  }

  const rows: UserRow[] = (profiles ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    email: emailById.get(p.id) ?? p.notification_email ?? "",
    role: p.role,
    plan: p.plan,
    trial_ends_at: p.trial_ends_at,
    fees_waived: p.fees_waived,
    deactivated: p.deactivated,
    created_at: p.created_at,
    ai_calls: usageById.get(p.id)?.calls ?? 0,
    ai_cost: usageById.get(p.id)?.cost ?? 0,
  }));

  return <UsersClient users={rows} />;
}
