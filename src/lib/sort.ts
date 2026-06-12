import type { Application, ApplicationStatus } from "./types";

/**
 * Tracker sort order (§6 of the spec, exact):
 *  1. Applications with an upcoming scheduled call/interview — soonest first
 *  2. Then by furthest-along status: in_person > screening_call > applied
 *  3. Then oldest applied first (newest applied at the bottom of the active list)
 *  Rejected applications are excluded here — they live in a collapsed
 *  section at the very bottom of the page.
 */

const STATUS_RANK: Record<ApplicationStatus, number> = {
  next_scheduled: 4,
  in_person: 3,
  screening_call: 2,
  applied: 1,
  draft: 0,
  rejected: -1,
};

export interface TrackerRow extends Application {
  next_interview_at: string | null; // soonest upcoming interview, if any
  company_name: string | null;
}

export function sortTrackerRows(rows: TrackerRow[], now = new Date()): TrackerRow[] {
  const nowMs = now.getTime();
  return [...rows].sort((a, b) => {
    const aNext = a.next_interview_at ? new Date(a.next_interview_at).getTime() : null;
    const bNext = b.next_interview_at ? new Date(b.next_interview_at).getTime() : null;
    const aUpcoming = aNext !== null && aNext >= nowMs;
    const bUpcoming = bNext !== null && bNext >= nowMs;

    // 1. Upcoming interviews first, soonest first.
    if (aUpcoming && bUpcoming) return aNext! - bNext!;
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;

    // 2. Furthest-along status.
    const rankDiff = STATUS_RANK[b.status] - STATUS_RANK[a.status];
    if (rankDiff !== 0) return rankDiff;

    // 3. Oldest applied first → newest at the bottom.
    const aDate = a.date_submitted ?? a.date_added;
    const bDate = b.date_submitted ?? b.date_added;
    return aDate.localeCompare(bDate);
  });
}
