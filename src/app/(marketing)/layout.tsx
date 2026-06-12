import Link from "next/link";
import { APP_NAME } from "@/config";
import { createAdminClient } from "@/lib/supabase/admin";

// Donation URL comes from admin_settings — render dynamically so changes
// take effect without a redeploy.
export const dynamic = "force-dynamic";

async function getDonationUrl(): Promise<string> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("admin_settings")
      .select("donation_url")
      .eq("id", 1)
      .single();
    return data?.donation_url ?? "https://buymeacoffee.com/";
  } catch {
    return "https://buymeacoffee.com/";
  }
}

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const donationUrl = await getDonationUrl();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            {APP_NAME}
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/login" className="text-neutral-600 hover:text-neutral-900">
              Sign in
            </Link>
            <Link href="/signup" className="btn-primary">
              Get started free
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-neutral-500">
          <p>© {new Date().getFullYear()} {APP_NAME}</p>
          <nav className="flex gap-6">
            <Link href="/privacy" className="hover:text-neutral-900">Privacy</Link>
            <Link href="/terms" className="hover:text-neutral-900">Terms</Link>
            <a href={`mailto:support@example.com`} className="hover:text-neutral-900">Contact</a>
            <a href={donationUrl} target="_blank" rel="noopener noreferrer"
              className="text-amber-600 hover:text-amber-700">
              ☕ Buy me a coffee
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
