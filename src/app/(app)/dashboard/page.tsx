import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/labels";
import { APP_NAME } from "@/config";
import type { Application, Interview } from "@/lib/types";
import { PipelineChart } from "./pipeline-chart";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: apps }, { data: interviews }, { data: usage }, settings] =
    await Promise.all([
      supabase.from("applications").select("*").returns<Application[]>(),
      supabase.from("interviews").select("*").returns<Interview[]>(),
      supabase
        .from("ai_usage_log")
        .select("input_tokens, output_tokens, cost_estimate")
        .eq("user_id", user.id),
      getAdminSettings(supabase),
    ]);

  const applications = apps ?? [];
  const allInterviews = interviews ?? [];
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Applied counts use date_submitted.
  const submitted = applications.filter((a) => a.date_submitted);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Monday
  const weekStr = startOfWeek.toISOString().slice(0, 10);
  const monthStr = todayStr.slice(0, 8) + "01";

  const counts = {
    allTime: submitted.length,
    month: submitted.filter((a) => a.date_submitted! >= monthStr).length,
    week: submitted.filter((a) => a.date_submitted! >= weekStr).length,
    today: submitted.filter((a) => a.date_submitted! === todayStr).length,
  };

  const pipeline = {
    drafts: applications.filter((a) => a.status === "draft").length,
    applied: applications.filter((a) => a.status === "applied").length,
    screening: applications.filter((a) => a.status === "screening_call").length,
    interviews: applications.filter((a) =>
      ["in_person", "next_scheduled"].includes(a.status)
    ).length,
  };

  const ai = (usage ?? []).reduce(
    (acc, u) => ({
      calls: acc.calls + 1,
      tokens: acc.tokens + (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
      cost: acc.cost + Number(u.cost_estimate ?? 0),
    }),
    { calls: 0, tokens: 0, cost: 0 }
  );

  // Weekly series for the last 8 weeks: applications submitted vs interviews
  // happening — a drop-off in applying stays visible even when interviews
  // are busy.
  const weeks: { label: string; applications: number; interviews: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const start = new Date(startOfWeek.getTime() - i * 7 * DAY);
    const end = new Date(start.getTime() + 7 * DAY);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);
    weeks.push({
      label: `${start.getDate()}/${start.getMonth() + 1}`,
      applications: submitted.filter(
        (a) => a.date_submitted! >= startDate && a.date_submitted! < endDate
      ).length,
      interviews: allInterviews.filter(
        (iv) => iv.scheduled_at >= start.toISOString() && iv.scheduled_at < end.toISOString()
      ).length,
    });
  }

  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY).toISOString().slice(0, 10);
  const noRecentApplications =
    submitted.length > 0 &&
    submitted.filter((a) => a.date_submitted! >= sevenDaysAgo).length === 0;

  const upcoming = allInterviews
    .filter((iv) => {
      const t = new Date(iv.scheduled_at).getTime();
      return t >= now.getTime() && t <= now.getTime() + 7 * DAY;
    })
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const appById = new Map(applications.map((a) => [a.id, a]));

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>

      {noRecentApplications && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>No applications in the last 7 days</strong> — interviews dry
          up 2–3 weeks later. Keep the top of the funnel moving even while
          interviews are busy.
        </div>
      )}

      {/* Applied counts */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(
          [
            ["All time", counts.allTime],
            ["This month", counts.month],
            ["This week", counts.week],
            ["Today", counts.today],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="card p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
              Applied · {label}
            </p>
            <p className="mt-1 text-3xl font-semibold">{value}</p>
          </div>
        ))}
      </section>

      {/* Pipeline */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(
          [
            ["Drafts", pipeline.drafts, "/suggested"],
            ["Applied", pipeline.applied, "/tracker"],
            ["Screening calls", pipeline.screening, "/tracker"],
            ["Interviews", pipeline.interviews, "/tracker"],
          ] as const
        ).map(([label, value, href]) => (
          <Link key={label} href={href} className="card p-5 transition-shadow hover:shadow-md">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</p>
            <p className="mt-1 text-3xl font-semibold">{value}</p>
          </Link>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="card p-6">
          <h2 className="font-semibold">Monthly pipeline</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Applications submitted vs interviews happening, per week.
          </p>
          <PipelineChart weeks={weeks} />
        </section>

        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="font-semibold">Next 7 days</h2>
            {upcoming.length === 0 ? (
              <p className="mt-3 text-sm text-neutral-400">No interviews scheduled.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {upcoming.map((iv) => {
                  const app = appById.get(iv.application_id);
                  return (
                    <li key={iv.id} className="rounded-lg bg-neutral-50 px-3 py-2">
                      <p className="font-medium">{app?.job_title ?? "Interview"}</p>
                      <p className="text-xs text-neutral-500">
                        {formatDateTime(iv.scheduled_at)}
                        {iv.location_text ? ` · ${iv.location_text}` : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card p-6">
            <h2 className="font-semibold">AI usage</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-500">Generations</dt>
                <dd className="font-medium">{ai.calls}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Tokens</dt>
                <dd className="font-medium">{ai.tokens.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Estimated cost</dt>
                <dd className="font-medium">${ai.cost.toFixed(2)}</dd>
              </div>
            </dl>
          </section>

          <section className="card border-amber-200 bg-amber-50/50 p-6">
            <h2 className="font-semibold">Enjoying {APP_NAME}?</h2>
            <p className="mt-1 text-sm text-neutral-600">
              It&apos;s free to use — if it helps you land interviews, you can
              support it.
            </p>
            <a
              href={settings.donation_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary mt-3 border-amber-300 text-amber-700 hover:bg-amber-100"
            >
              ☕ Buy me a coffee
            </a>
          </section>
        </div>
      </div>
    </div>
  );
}
