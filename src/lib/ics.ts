import { APP_NAME, SUPPORT_EMAIL } from "@/config";

/**
 * Standards-compliant iCalendar invite (RFC 5545).
 * METHOD:REQUEST + ORGANIZER + ATTENDEE so Gmail renders the
 * add-to-calendar card rather than a plain attachment.
 */

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Fold lines at 75 octets per RFC 5545 §3.1. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 73) {
    out.push(rest.slice(0, 73));
    rest = " " + rest.slice(73);
  }
  out.push(rest);
  return out.join("\r\n");
}

export interface IcsEvent {
  uid: string; // stable per interview, e.g. `${interviewId}@jobplatform`
  start: Date;
  durationMinutes?: number; // default 60
  summary: string;
  description?: string;
  location?: string;
  organizerEmail?: string;
  attendeeEmail: string;
  attendeeName?: string;
  sequence?: number; // bump on reschedule
}

export function buildIcs(ev: IcsEvent): string {
  const end = new Date(ev.start.getTime() + (ev.durationMinutes ?? 60) * 60_000);
  const organizer = ev.organizerEmail ?? SUPPORT_EMAIL;
  const lines = [
    "BEGIN:VCALENDAR",
    `PRODID:-//${APP_NAME}//EN`,
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${ev.uid}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(ev.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${escapeText(ev.summary)}`,
    ...(ev.description ? [`DESCRIPTION:${escapeText(ev.description)}`] : []),
    ...(ev.location ? [`LOCATION:${escapeText(ev.location)}`] : []),
    `ORGANIZER;CN=${APP_NAME}:mailto:${organizer}`,
    `ATTENDEE;CN=${escapeText(ev.attendeeName ?? ev.attendeeEmail)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${ev.attendeeEmail}`,
    `SEQUENCE:${ev.sequence ?? 0}`,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder",
    "TRIGGER:-PT30M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
