const LOWER_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on", "or", "so", "the", "to", "up", "yet"])

export function toProperCase(str: string): string {
  // Only reverse "Last, First" person names — not addresses (addresses have digits or multiple commas)
  const parts = str.split(",")
  const isPersonName = parts.length === 2 && !/\d/.test(parts[0])
  const normalized = isPersonName
    ? parts.map(s => s.trim()).filter(Boolean).reverse().join(" ")
    : str

  return normalized
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word, i) => {
      const lower = word.toLowerCase()
      if (i !== 0 && LOWER_WORDS.has(lower)) return lower
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(" ")
}
