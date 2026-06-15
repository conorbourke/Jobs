import { describe, it, expect } from "vitest";
import { sortTrackerRows, type TrackerRow } from "./sort";
import type { ApplicationStatus } from "./types";

const NOW = new Date("2026-06-13T12:00:00Z");

function row(
  id: string,
  status: ApplicationStatus,
  opts: { nextInterview?: string | null; submitted?: string; added?: string } = {}
): TrackerRow {
  return {
    id,
    user_id: "u1",
    company_id: null,
    company_name: null,
    job_title: id,
    salary_text: null,
    location: null,
    status,
    application_type: "email",
    source: "manual",
    notes: null,
    date_added: opts.added ?? "2026-01-01",
    date_submitted: opts.submitted ?? null,
    job_description_text: null,
    job_url: null,
    attach_portfolio: false,
    ai_summary: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    next_interview_at: opts.nextInterview ?? null,
  };
}

describe("sortTrackerRows — §6 exact order", () => {
  it("puts upcoming interviews first, soonest first", () => {
    const rows = [
      row("later", "next_scheduled", { nextInterview: "2026-06-20T09:00:00Z" }),
      row("sooner", "next_scheduled", { nextInterview: "2026-06-15T09:00:00Z" }),
    ];
    const sorted = sortTrackerRows(rows, NOW);
    expect(sorted.map((r) => r.id)).toEqual(["sooner", "later"]);
  });

  it("ranks a past interview as not-upcoming", () => {
    const rows = [
      row("past", "next_scheduled", { nextInterview: "2026-06-01T09:00:00Z" }),
      row("future", "applied", { nextInterview: "2026-06-15T09:00:00Z" }),
    ];
    const sorted = sortTrackerRows(rows, NOW);
    // future has an upcoming interview; past's interview already happened.
    expect(sorted[0].id).toBe("future");
  });

  it("orders by furthest-along status: in_person > screening_call > applied", () => {
    const rows = [
      row("applied", "applied"),
      row("inperson", "in_person"),
      row("screening", "screening_call"),
    ];
    const sorted = sortTrackerRows(rows, NOW);
    expect(sorted.map((r) => r.id)).toEqual(["inperson", "screening", "applied"]);
  });

  it("within the same status, oldest applied first (newest at the bottom)", () => {
    const rows = [
      row("newest", "applied", { submitted: "2026-05-01" }),
      row("oldest", "applied", { submitted: "2026-01-01" }),
      row("middle", "applied", { submitted: "2026-03-01" }),
    ];
    const sorted = sortTrackerRows(rows, NOW);
    expect(sorted.map((r) => r.id)).toEqual(["oldest", "middle", "newest"]);
  });

  it("applies the full priority chain end to end", () => {
    const rows = [
      row("appliedNew", "applied", { submitted: "2026-05-01" }),
      row("appliedOld", "applied", { submitted: "2026-02-01" }),
      row("interviewSoon", "next_scheduled", { nextInterview: "2026-06-14T09:00:00Z" }),
      row("interviewLate", "next_scheduled", { nextInterview: "2026-06-25T09:00:00Z" }),
      row("inPerson", "in_person"),
      row("screening", "screening_call"),
    ];
    const sorted = sortTrackerRows(rows, NOW).map((r) => r.id);
    expect(sorted).toEqual([
      "interviewSoon", // upcoming, soonest
      "interviewLate", // upcoming, later
      "inPerson", // furthest-along status, no upcoming interview
      "screening",
      "appliedOld", // oldest applied first
      "appliedNew",
    ]);
  });
});
