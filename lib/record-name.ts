// A record's display name. "Person" objects (those with both a `first_name` and
// `last_name` property) show the concatenation of the two; everything else uses
// the primary property. Keep this the single source of truth so the list, detail
// header, association pickers, cards and automations all agree.

export interface NameProp { id: string; name?: string; primary?: boolean }

export function isPersonObject(props: NameProp[] | null | undefined): boolean {
  if (!props) return false
  return props.some((p) => p.id === "first_name") && props.some((p) => p.id === "last_name")
}

export function recordName(props: NameProp[] | null | undefined, values: Record<string, any> | null | undefined, fallback = ""): string {
  const v = values ?? {}
  if (isPersonObject(props)) {
    const n = `${v.first_name ?? ""} ${v.last_name ?? ""}`.trim()
    if (n) return n
  }
  const primary = props?.find((p) => p.primary) ?? props?.[0]
  const pv = primary ? v[primary.id] : null
  return (pv != null && String(pv).trim()) || fallback
}
