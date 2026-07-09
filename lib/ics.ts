// Minimal iCalendar (.ics) builder for meeting invitations. No dependencies —
// iCalendar is a plain text format. Times are emitted as UTC (…Z), which every
// calendar client interprets unambiguously.

export interface IcsAttendee { email: string; name?: string }

export interface IcsEvent {
  uid: string
  start: Date
  end: Date
  title: string
  description?: string
  location?: string
  organizer: { email: string; name?: string }
  attendees: IcsAttendee[]
  method?: "REQUEST" | "CANCEL"
}

function pad(n: number): string { return String(n).padStart(2, "0") }

function toIcsUtc(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) + "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) + "Z"
  )
}

// Escape per RFC 5545 (backslash, newline, comma, semicolon).
function esc(s: string): string {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
}

// Fold long content lines (RFC 5545: max 75 octets, continued with a leading space).
function fold(line: string): string {
  if (line.length <= 73) return line
  const parts: string[] = [line.slice(0, 73)]
  let rest = line.slice(73)
  while (rest.length) { parts.push(" " + rest.slice(0, 72)); rest = rest.slice(72) }
  return parts.join("\r\n")
}

export function buildIcs(ev: IcsEvent): string {
  const stamp = toIcsUtc(new Date())
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Genesis Ortho//CRM//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${ev.method ?? "REQUEST"}`,
    "BEGIN:VEVENT",
    `UID:${ev.uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toIcsUtc(ev.start)}`,
    `DTEND:${toIcsUtc(ev.end)}`,
    `SUMMARY:${esc(ev.title)}`,
    ...(ev.description ? [`DESCRIPTION:${esc(ev.description)}`] : []),
    ...(ev.location ? [`LOCATION:${esc(ev.location)}`] : []),
    `ORGANIZER;CN=${esc(ev.organizer.name ?? ev.organizer.email)}:mailto:${ev.organizer.email}`,
    ...ev.attendees.map((a) =>
      `ATTENDEE;CN=${esc(a.name ?? a.email)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a.email}`,
    ),
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    `LAST-MODIFIED:${stamp}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
  return lines.map(fold).join("\r\n")
}
