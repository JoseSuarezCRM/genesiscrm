// Pure, client-safe mapping from a custom property definition to a RecordFieldDef
// (the shared type descriptor used by the inline editors). Both the record detail
// property cards and the list inline-cell editor drive off RecordFieldDef, so this
// keeps custom-property columns editable with the same controls everywhere.
//
// Note: unlike lib/record-cards.ts (server-only, imports prisma) this file is pure
// so it can be imported into client table components. It maps CHECKBOX to the
// dedicated "checkbox" field type (a real boolean toggle) rather than a select.

import type { RecordFieldDef, RecordFieldType } from "@/lib/record-field-catalog"

export const CP_FIELD_TYPE: Record<string, RecordFieldType> = {
  TEXT: "text",
  LONG_TEXT: "long_text",
  NUMBER: "number",
  EMAIL: "email",
  PHONE: "phone",
  DATE: "date",
  DATE_TIME: "datetime",
  CHECKBOX: "checkbox",
  DROPDOWN: "select",
  MULTI_SELECT: "select",
  URL: "text",
}

// `key` is the column/save key: a bare property id for custom objects, or
// "cp_<id>" for a custom property on a built-in object.
export function cpToFieldDef(prop: any, key: string): RecordFieldDef {
  return {
    key,
    label: prop.name,
    type: CP_FIELD_TYPE[prop.type] ?? "text",
    multi: prop.type === "MULTI_SELECT",
    options: prop.options ?? [],
    optionLabels: prop.optionLabels ?? undefined,
    optionColors: prop.optionColors ?? undefined,
    optionStyle: prop.optionStyle ?? undefined,
    numberFormat: prop.numberFormat ?? undefined,
    conditional: prop.conditional ?? undefined,
    default: prop.defaultValue ?? undefined,
    visibilityRule: prop.visibilityRule ?? undefined,
  }
}
