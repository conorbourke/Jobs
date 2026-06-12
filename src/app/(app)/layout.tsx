import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { AiNotice } from "@/components/ai-notice";
import type { Profile } from "@/lib/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  if (profile?.deactivated) redirect("/login?error=deactivated");

  return (
    <div className="flex min-h-screen">
      <Sidebar
        isSuperadmin={profile?.role === "superadmin"}
        userName={profile?.name || user.email || ""}
      />
      <main className="ml-56 flex-1 px-8 py-8">
        {profile && !profile.ai_notice_dismissed && <AiNotice />}
        {children}
      </main>
    </div>
  );
}
