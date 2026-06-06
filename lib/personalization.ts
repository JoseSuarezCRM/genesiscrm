// Shared personalization tokens for email composers + the substitution engine.
// Tokens use {{key}} syntax. Each recipient carries a `data` map of key→value;
// missing keys substitute to an empty string.

export interface PersonalizationToken { label: string; value: string }
export interface TokenGroup { group: string; tokens: PersonalizationToken[] }

// Grouped catalog shown in the "Fields" dropdown. Organized by entity so it's
// easy to scan when composing bulk emails to patients and/or providers.
export const PERSONALIZATION_GROUPS: TokenGroup[] = [
  {
    group: "Recipient",
    tokens: [
      { label: "First name", value: "{{firstName}}" },
      { label: "Last name", value: "{{lastName}}" },
      { label: "Full name", value: "{{fullName}}" },
      { label: "Email", value: "{{email}}" },
    ],
  },
  {
    group: "Patient / Referral",
    tokens: [
      { label: "Appointment date", value: "{{appointmentDate}}" },
      { label: "Insurance", value: "{{insurance}}" },
      { label: "Referring practice", value: "{{practiceName}}" },
      { label: "Referring provider", value: "{{providerName}}" },
    ],
  },
  {
    group: "Provider",
    tokens: [
      { label: "Title", value: "{{title}}" },
      { label: "Specialty", value: "{{specialty}}" },
      { label: "Practice", value: "{{practiceName}}" },
      { label: "Location", value: "{{location}}" },
      { label: "NPI", value: "{{npi}}" },
      { label: "Phone", value: "{{phone}}" },
    ],
  },
]

// Replace {{key}} occurrences using the recipient's data map.
export function substitutePersonalization(text: string, data: Record<string, string>): string {
  if (!text) return text
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => data[key] ?? "")
}

// Split a full name into first / last parts.
export function splitName(name: string): { firstName: string; lastName: string } {
  const parts = (name ?? "").trim().split(/\s+/)
  if (parts.length === 0) return { firstName: "", lastName: "" }
  if (parts.length === 1) return { firstName: parts[0], lastName: "" }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") }
}
