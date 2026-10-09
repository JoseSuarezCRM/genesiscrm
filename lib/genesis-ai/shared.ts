// Helpers shared by Genesis AI's read tools (tools.ts) and its actions
// (actions/*). Server only.

import { z } from "zod"
import { OPERATORS, uid, type Condition, type FieldType, type FilterState } from "@/lib/filters"
import type { ObjectFieldDef } from "@/lib/object-fields"
import { DATE_PRESET_GROUPS } from "@/lib/reporting/date-presets"
import { REPORT_OBJECTS, reportFieldsFor } from "@/lib/reporting/objects"
import { FK_TARGET, viewableObjects, type Viewer } from "./access"
import { ActionError } from "./actions/types"

export { ActionError }

/** A filter as the model writes it (see FILTER in tools.ts). */
export const FilterInput = z.object({
  match: z.enum(["all", "any"]).optional(),
  conditions: z.array(z.object({ field: z.string().min(1), operator: z.string().min(1), values: z.array(z.string()).max(200) })).max(20),
}).strict()

/** The object key the model meant: a key ("REFERRAL", "CO:athletes") or a label ("Referrals"). */
export async function resolveObject(me: Viewer, input: string): Promise<{ key: string; label: string }> {
  const objects = await viewableObjects(me)
  const q = input.trim().toLowerCase()
  const hit = objects.find((o) => o.key.toLowerCase() === q)
    ?? objects.find((o) => o.label.toLowerCase() === q)
    ?? objects.find((o) => `co:${o.label.toLowerCase()}` === q)
  if (hit) return hit
  throw new ActionError(`"${input}" isn't an object this person can see. Objects they can see: ${objects.map((o) => `${o.key} (${o.label})`).join(", ") || "none"}.`)
}

const PERSON_FIELDS = new Set(Object.entries(FK_TARGET).filter(([, t]) => t === "USER").map(([k]) => k))
export const isPersonField = (d: ObjectFieldDef) => d.key === "__owner" || (!!d.column && PERSON_FIELDS.has(d.column) && d.type === "select")
export const PRESETS = new Set(DATE_PRESET_GROUPS.map((p) => p.value).filter((v) => v !== "custom"))

/**
 * The model's filter as the CRM's FilterState, validated against the fields the
 * person may use. Option labels are accepted for option values ("New" → "NEW"),
 * and "@me" in a person field means the person asking.
 */
export function toFilterState(input: z.infer<typeof FilterInput> | undefined, defs: ObjectFieldDef[], me: Viewer): FilterState | null {
  if (!input?.conditions?.length) return null
  const byKey = new Map(defs.map((d) => [d.key, d]))
  const conditions: Condition[] = input.conditions.map((c) => {
    const def = byKey.get(c.field)
    if (!def) throw new ActionError(`Unknown or unavailable filter field "${c.field}". Use a filter_fields key from describe_object.`)
    const op = OPERATORS[def.type as FieldType]?.find((o) => o.value === c.operator)
    if (!op) throw new ActionError(`"${c.operator}" isn't valid for ${def.label} (${def.type}). Valid: ${(OPERATORS[def.type as FieldType] ?? []).map((o) => o.value).join(", ")}.`)
    let values = c.values.map((v) => v.trim())
    if (isPersonField(def)) values = values.map((v) => (v.toLowerCase() === "@me" ? me.id : v))
    if (def.type === "select" && def.options?.length) {
      values = values.map((v) => {
        const exact = def.options!.find((o) => o.value === v)
        if (exact) return v
        const byLabel = def.options!.find((o) => o.label.toLowerCase() === v.toLowerCase())
        return byLabel ? byLabel.value : v
      })
    }
    if (op.relative && !PRESETS.has(values[0] ?? "")) throw new ActionError(`"${values[0] ?? ""}" isn't a date preset. Valid: ${Array.from(PRESETS).join(", ")}.`)
    if (op.range && values.length !== 2) throw new ActionError(`${c.operator} needs [from, to].`)
    if (!op.noValue && !values.length) throw new ActionError(`${def.label} ${c.operator} needs a value.`)
    const value: string | string[] = op.noValue ? "" : op.multi || op.range ? values : values[0]
    return { id: uid("ai"), field: def.key, operator: op.value, value }
  })
  return { combinator: "AND", groups: [{ id: uid("aig"), combinator: input.match === "any" ? "OR" : "AND", conditions }] }
}

/** Report keys a column can be grouped by (the report engine's own field list). */
export async function groupableKeys(objectType: string): Promise<Set<string>> {
  const keys = new Set((await reportFieldsFor(objectType)).filter((f) => !f.stageDuration).map((f) => f.key))
  for (const a of REPORT_OBJECTS[objectType]?.associations ?? []) if (a.target !== "USER") keys.add(`${a.path}.name`)
  return keys
}
