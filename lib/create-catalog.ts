import { RECORD_FIELDS, type RecordFieldDef } from "@/lib/record-field-catalog"
import { cpToFieldDef } from "@/lib/cp-field-def"

// Build the create-form field catalog for a built-in object: its editable native
// fields (from RECORD_FIELDS) + injected relation fields (extras, e.g. a Practice
// picker) + custom properties (cp_<id>) + an owner field. `required` marks which
// keys are required at creation.
export function builtinCreateCatalog(opts: {
  entityType: string
  customProps?: { id: string; name: string; type: string; options?: string[]; optionLabels?: any; optionColors?: any; optionStyle?: any; numberFormat?: any }[]
  extras?: RecordFieldDef[]
  required?: string[]
  ownerLabel?: string
}): RecordFieldDef[] {
  const { entityType, customProps = [], extras = [], required = [], ownerLabel } = opts
  const reqSet = new Set(required)
  const mark = (f: RecordFieldDef) => (reqSet.has(f.key) ? { ...f, required: true } : f)
  const native = (RECORD_FIELDS[entityType] ?? []).filter((f) => !f.readOnly).map(mark)
  const cp = customProps.map((p) => cpToFieldDef(p, `cp_${p.id}`))
  const owner: RecordFieldDef[] = ownerLabel ? [{ key: "__owner", label: ownerLabel, type: "user" }] : []
  return [...native, ...extras.map(mark), ...cp, ...owner]
}

// Split a create modal's flat values bag into the native columns, the custom
// property bag, and the owner id — the shape the built-in create actions expect.
export function splitCreateValues(values: Record<string, any>): { native: Record<string, any>; customProperties: Record<string, any>; ownerId?: string } {
  const native: Record<string, any> = {}
  const customProperties: Record<string, any> = {}
  let ownerId: string | undefined
  for (const [k, v] of Object.entries(values)) {
    if (k === "__owner") ownerId = (v as string) || undefined
    else if (k.startsWith("cp_")) customProperties[k.slice(3)] = v
    else native[k] = v
  }
  return { native, customProperties, ownerId }
}
