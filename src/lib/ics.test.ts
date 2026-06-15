import { describe, it, expect } from "vitest";
import { buildIcs } from "./ics";

describe("buildIcs — Gmail add-to-calendar card requirements", () => {
  const ics = buildIcs({
    uid: "interview-123@jobplatform",
    start: new Date("2026-07-01T14:00:00Z"),
    summary: "Interview: Ops Manager at Acme",
    description: "Video call",
    location: "Zoom",
    attendeeEmail: "me@example.com",
    attendeeName: "Conor Bourke",
  });

  // RFC 5545 line folding ("\r\n " continuation) is a transport encoding;
  // a real calendar client unfolds before parsing, so we do too.
  const unfolded = ics.replace(/\r\n /g, "");

  it("is a METHOD:REQUEST invite (so Gmail renders the card)", () => {
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("VERSION:2.0");
  });

  it("sets organizer and attendee", () => {
    expect(unfolded).toMatch(/ORGANIZER;CN=.*:mailto:/);
    expect(unfolded).toMatch(
      /ATTENDEE;CN=Conor Bourke;ROLE=REQ-PARTICIPANT.*:mailto:me@example.com/
    );
  });

  it("carries a stable UID and start/end", () => {
    expect(ics).toContain("UID:interview-123@jobplatform");
    expect(ics).toContain("DTSTART:20260701T140000Z");
    expect(ics).toContain("DTEND:20260701T150000Z"); // default 60 min
  });

  it("uses CRLF line endings and wraps the event", () => {
    expect(ics).toContain("\r\n");
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
  });

  it("escapes commas and semicolons in text fields", () => {
    const escaped = buildIcs({
      uid: "x@jobplatform",
      start: new Date("2026-07-01T14:00:00Z"),
      summary: "Acme, Inc; round 1",
      attendeeEmail: "me@example.com",
    });
    expect(escaped).toContain("SUMMARY:Acme\\, Inc\\; round 1");
  });
});
