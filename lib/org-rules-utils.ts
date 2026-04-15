/** Pure function — apply an already-fetched rule list to a raw org name string. */
export function applyRules(
  raw: string,
  rules: { contains: string; normalizedName: string }[]
): string {
  const lower = raw.toLowerCase().trim()
  for (const rule of rules) {
    if (lower.includes(rule.contains.toLowerCase().trim())) {
      return rule.normalizedName
    }
  }
  return raw.trim()
}
