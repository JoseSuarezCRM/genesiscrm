// Registry of reportable objects for the Report Builder: each object's label, its
// Prisma delegate (via lib/automation-records), its permission key, and its full
// field list (native columns from RECORD_FIELDS + custom properties). Associations
// (for cross-object joins) are declared here and consumed in the join phase.
import { prisma } from "@/lib/prisma"
import { RECORD_FIELDS, type RecordFieldType } from "@/lib/record-field-catalog"
import { recordPermKey } from "@/lib/record-perm-key"
import type { ReportField, ReportFieldType } from "./types"

export interface ReportObjectMeta {
  key: string
  label: string
  createdAtField: string
  // Joinable relations (Prisma relation name → target object). Used by the join phase.
  associations: { path: string; target: string; label: string }[]
}

export const REPORT_OBJECTS: Record<string, ReportObjectMeta> = {
  REFERRAL: {
    key: "REFERRAL", label: "Referrals", createdAtField: "createdAt",
    associations: [
      { path: "referringPractice", target: "PRACTICE", label: "Referring practice" },
      { path: "referringDoctor", target: "PROVIDER", label: "Referring provider" },
      { path: "referringLocation", target: "LOCATION", label: "Referring location" },
      { path: "assignedTo", target: "USER", label: "Owner" },
      { path: "createdBy", target: "USER", label: "Created by" },
    ],
  },
  SURGERY: {
    key: "SURGERY", label: "Surgery Cases", createdAtField: "creationDate",
    associations: [
      { path: "owner", target: "USER", label: "Owner" },
    ],
  },
  PROVIDER: {
    key: "PROVIDER", label: "Providers", createdAtField: "createdAt",
    associations: [
      { path: "practice", target: "PRACTICE", label: "Practice" },
      { path: "owner", target: "USER", label: "Owner" },
    ],
  },
  PRACTICE: {
    key: "PRACTICE", label: "Practices", createdAtField: "createdAt",
    associations: [
      { path: "owner", target: "USER", label: "Owner" },
    ],
  },
  LOCATION: {
    key: "LOCATION", label: "Locations", createdAtField: "createdAt",
    associations: [
      { path: "practice", target: "PRACTICE", label: "Practice" },
      { path: "owner", target: "USER", label: "Owner" },
    ],
  },
  ACTIVITY: {
    key: "ACTIVITY", label: "Activities", createdAtField: "createdAt",
    associations: [
      { path: "practice", target: "PRACTICE", label: "Practice" },
      { path: "location", target: "LOCATION", label: "Location" },
      { path: "owner", target: "USER", label: "Owner" },
    ],
  },
  TASK: {
    key: "TASK", label: "Tasks", createdAtField: "createdAt",
    associations: [
      { path: "referral", target: "REFERRAL", label: "Referral" },
      { path: "assignedTo", target: "USER", label: "Assigned to" },
    ],
  },
}

const NATIVE_TYPE: Record<RecordFieldType, ReportFieldType> = {
  text: "text", email: "text", phone: "text", long_text: "text", select_or_other: "text",
  user: "select", select: "select", number: "number", date: "date", datetime: "date", checkbox: "boolean",
}
const CP_TYPE: Record<string, ReportFieldType> = {
  TEXT: "text", LONG_TEXT: "text", EMAIL: "text", PHONE: "text", URL: "text",
  NUMBER: "number", DATE: "date", CHECKBOX: "boolean", DROPDOWN: "select", MULTI_SELECT: "select",
}

// The full, reportable field list for an object (native + universal + custom props).
export async function reportFieldsFor(objectKey: string): Promise<ReportField[]> {
  const fields: ReportField[] = []
  const meta = REPORT_OBJECTS[objectKey]

  if (objectKey.startsWith("CO:")) {
    const def = await (prisma as any).customObjectDef.findUnique({ where: { key: objectKey.slice(3) } }).catch(() => null)
    fields.push({ key: "__id", label: "Record ID", type: "text", source: objectKey, column: "id" })
    fields.push({ key: "createdAt", label: "Created", type: "date", source: objectKey, column: "createdAt" })
    for (const p of ((def?.properties as any[]) ?? [])) {
      fields.push({
        key: p.id, label: p.name, type: CP_TYPE[p.type] ?? "text", source: objectKey,
        column: p.id, jsonBag: "values",
        options: (p.options ?? []).map((o: string) => ({ value: o, label: (p.optionLabels?.[o]) ?? o })),
      })
    }
    return fields
  }

  fields.push({ key: "__id", label: "Record ID", type: "text", source: objectKey, column: "id" })
  if (meta) fields.push({ key: meta.createdAtField, label: "Created", type: "date", source: objectKey, column: meta.createdAtField })

  for (const f of (RECORD_FIELDS[objectKey] ?? [])) {
    fields.push({
      key: f.key, label: f.label, type: NATIVE_TYPE[f.type] ?? "text", source: objectKey, column: f.key,
      options: f.options?.map((o) => ({ value: o, label: (f.optionLabels?.[o]) ?? o })),
    })
  }

  const cps = await prisma.customProperty.findMany({ where: { entityType: objectKey as any }, orderBy: { createdAt: "asc" } }).catch(() => [])
  for (const cp of cps) {
    fields.push({
      key: `cp_${cp.id}`, label: cp.name, type: CP_TYPE[cp.type as string] ?? "text", source: objectKey,
      column: cp.id, jsonBag: "customProperties",
      options: (cp.options ?? []).map((o) => ({ value: o, label: o })),
    })
  }
  return fields
}

// Every object a user can report on, including custom objects, with a label.
export async function listReportObjects(): Promise<{ key: string; label: string }[]> {
  const builtins = Object.values(REPORT_OBJECTS).map((m) => ({ key: m.key, label: m.label }))
  const custom = await (prisma as any).customObjectDef.findMany({ orderBy: { order: "asc" }, select: { key: true, plural: true } }).catch(() => [])
  return [...builtins, ...custom.map((c: any) => ({ key: `CO:${c.key}`, label: c.plural }))]
}

// USER isn't in RECORD_FIELDS — a minimal reportable field set for owner joins.
const USER_FIELDS: ReportField[] = [
  { key: "name", label: "Name", type: "text", source: "USER", column: "name" },
  { key: "email", label: "Email", type: "text", source: "USER", column: "email" },
]

async function baseFieldsFor(objectKey: string): Promise<ReportField[]> {
  if (objectKey === "USER") return USER_FIELDS
  return reportFieldsFor(objectKey)
}

// Fields of a joined source, re-tagged so `source` is the association path (unique
// per report), `joinPath` traverses the relation, and the key is prefixed to stay
// unique across sources. column/jsonBag are preserved for reading the value.
export async function joinedFieldsForSource(primary: string, joinPath: string): Promise<ReportField[]> {
  const assoc = REPORT_OBJECTS[primary]?.associations.find((a) => a.path === joinPath)
  if (!assoc) return []
  const tf = await baseFieldsFor(assoc.target)
  return tf.map((f) => ({ ...f, key: `${joinPath}.${f.key}`, source: joinPath, joinPath }))
}

// Everything the builder needs for a primary object: its own fields + each joinable
// source (with the joined fields ready to add as dimensions/measures/columns).
export async function reportSchema(primary: string): Promise<{
  fields: ReportField[]
  associations: { path: string; target: string; label: string; fields: ReportField[] }[]
}> {
  const fields = await reportFieldsFor(primary)
  const assocs = REPORT_OBJECTS[primary]?.associations ?? []
  const associations = await Promise.all(assocs.map(async (a) => ({
    path: a.path, target: a.target, label: a.label, fields: await joinedFieldsForSource(primary, a.path),
  })))
  return { fields, associations }
}

export function reportObjectLabel(key: string): string {
  return REPORT_OBJECTS[key]?.label ?? (key.startsWith("CO:") ? key.slice(3) : key)
}

export function reportPermKey(objectKey: string): string {
  return recordPermKey(objectKey)
}
