// A record's display name. "Person" objects (those with both a First Name and a
// Last Name property) show the concatenation of the two; everything else uses the
// primary property. Keep this the single source of truth so the list, detail
// header, association pickers, cards and automations all agree.
//
// The two parts are detected by the fixed ids new objects get (`first_name` /
// `last_name`) OR by property name — so you can also add "First Name" + "Last
// Name" to an existing object without recreating it.

export interface NameProp { id: string; name?: string; primary?: boolean }

function partIds(props: NameProp[] | null | undefined): { first: string; last: string } | null {
  if (!props) return null
  const first = props.find((p) => p.id === "first_name" || /^first\s*name$/i.test((p.name ?? "").trim()))
  const last = props.find((p) => p.id === "last_name" || /^last\s*name$/i.test((p.name ?? "").trim()))
  return first && last ? { first: first.id, last: last.id } : null
}

export function isPersonObject(props: NameProp[] | null | undefined): boolean {
  return partIds(props) !== null
}

// The property ids that make up a person name (so callers can avoid showing them
// as separate columns). Empty for non-person objects.
export function personPartIds(props: NameProp[] | null | undefined): string[] {
  const p = partIds(props)
  return p ? [p.first, p.last] : []
}

export function recordName(props: NameProp[] | null | undefined, values: Record<string, any> | null | undefined, fallback = ""): string {
  const v = values ?? {}
  const parts = partIds(props)
  if (parts) {
    const n = `${v[parts.first] ?? ""} ${v[parts.last] ?? ""}`.trim()
    if (n) return n
  }
  const primary = props?.find((p) => p.primary) ?? props?.[0]
  const pv = primary ? v[primary.id] : null
  return (pv != null && String(pv).trim()) || fallback
}
