/**
 * Initials for the Epic note: "JS is the on-call provider this week."
 *
 * The original tool asked staff to type them. The CRM knows who is signed in,
 * so they come from the user's name — which in this CRM can be "Jane Smith",
 * "Smith, Jane", "Jane Smith, PA-C" or "Dr. Jane Q. Smith Jr.".
 */

/** Post-nominals and honorifics that are not part of anybody's initials. */
const TITLES = new Set([
  "dr", "mr", "mrs", "ms", "miss", "prof", "jr", "sr", "ii", "iii", "iv",
  "md", "do", "pa", "pac", "pa-c", "np", "fnp", "fnpc", "fnp-c", "aprn", "rn", "bsn", "msn",
  "ma", "cma", "atc", "lat", "pt", "dpt", "ot", "phd", "mba", "mph",
])

const clean = (t: string) => t.toLowerCase().replace(/[^a-z-]/g, "")

export function initialsFor(user: { name?: string | null; email?: string | null }): string {
  const raw = (user.name ?? "").trim()

  if (raw) {
    let name = raw
    // "Smith, Jane" is a surname first; "Jane Smith, PA-C" is a credential.
    const comma = raw.indexOf(",")
    if (comma >= 0) {
      const after = raw.slice(comma + 1).trim()
      const afterTokens = after.split(/\s+/).filter(Boolean)
      const allCredentials = afterTokens.length > 0 && afterTokens.every((t) => TITLES.has(clean(t)))
      name = allCredentials ? raw.slice(0, comma) : `${after} ${raw.slice(0, comma)}`
    }
    const tokens = name
      .split(/\s+/)
      .map((t) => t.replace(/[^A-Za-z'-]/g, ""))
      .filter((t) => t && !TITLES.has(clean(t)))
    if (tokens.length >= 2) return (tokens[0]![0]! + tokens[tokens.length - 1]![0]!).toUpperCase()
    if (tokens.length === 1) return tokens[0]!.slice(0, 2).toUpperCase()
  }

  // No usable name: "jane.doe@…" → "JD", "jsuarez@…" → "JS".
  const local = (user.email ?? "").split("@")[0] ?? ""
  const parts = local.split(/[._-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
  if (local.length >= 2) return local.slice(0, 2).toUpperCase()

  // The original tool's placeholder, so the note still reads as a template.
  return "___"
}
