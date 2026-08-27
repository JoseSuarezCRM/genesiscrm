// Registry of reportable objects for the Report Builder: each object's label, its
// Prisma delegate (via lib/automation-records), its permission key, and its full
// field list (native columns from RECORD_FIELDS + custom properties). Associations
// (for cross-object joins) are declared here and consumed in the join phase.
import { prisma } from "@/lib/prisma"
import { RECORD_FIELDS, type RecordFieldType } from "@/lib/record-field-catalog"
import { recordPermKey } from "@/lib/record-perm-key"
import { STATUS_LABELS } from "@/lib/utils"
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

  // USER associations (Owner / Created by / Assigned to) are surfaced as inline
  // name fields on the object itself, not as joinable "data sources".
  const userAssocs = (meta?.associations ?? []).filter((a) => a.target === "USER")
  const userPaths = new Set(userAssocs.map((a) => a.path))

  // Dynamic-option lookups: some select fields store an id/code, not a label.
  // Resolve their options so dimensions/breakdowns/legends show names, not ids.
  const dynamicOptions: Record<string, { value: string; label: string }[]> = {}
  if (objectKey === "REFERRAL") {
    const pipelines = await prisma.pipeline.findMany({ where: { isActive: true, objectType: "REFERRAL" }, orderBy: [{ order: "asc" }, { createdAt: "asc" }], select: { id: true, name: true } }).catch(() => [])
    dynamicOptions.pipelineId = pipelines.map((p) => ({ value: p.id, label: p.name }))
    dynamicOptions.status = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label: String(label) }))
  }

  for (const f of (RECORD_FIELDS[objectKey] ?? [])) {
    if (userPaths.has(f.key)) continue // drop the raw FK-id field (e.g. assignedTo) in favor of the name field
    const dyn = dynamicOptions[f.key]
    fields.push({
      key: f.key, label: f.label, type: dyn ? "select" : NATIVE_TYPE[f.type] ?? "text", source: objectKey, column: f.key,
      options: dyn ?? f.options?.map((o) => ({ value: o, label: (f.optionLabels?.[o]) ?? o })),
    })
  }

  for (const a of userAssocs) {
    fields.push({ key: `${a.path}.name`, label: a.label, type: "text", source: objectKey, column: "name", joinPath: a.path })
  }

  const cps = await prisma.customProperty.findMany({ where: { entityType: objectKey as any }, orderBy: { createdAt: "asc" } }).catch(() => [])
  for (const cp of cps) {
    fields.push({
      key: `cp_${cp.id}`, label: cp.name, type: CP_TYPE[cp.type as string] ?? "text", source: objectKey,
      column: cp.id, jsonBag: "customProperties",
      options: (cp.options ?? []).map((o) => ({ value: o, label: ((cp as any).optionLabels?.[o]) ?? o })),
    })
  }

  // Time-in-stage calculated fields (from StageTransition), when the object has stages.
  for (const f of await stageDurationFields(objectKey)) fields.push(f)
  return fields
}

// Synthetic duration fields (in days) for a stage-enabled object: time in current
// stage, time to close, and per stage cumulative + latest time.
async function stageDurationFields(objectKey: string): Promise<ReportField[]> {
  const pipelines = await (prisma as any).pipeline.findMany({
    where: { objectType: objectKey, isActive: true },
    select: { stages: { orderBy: { order: "asc" }, select: { id: true, name: true } } },
  }).catch(() => [])
  const stages = pipelines.flatMap((p: any) => p.stages as { id: string; name: string }[])
  if (stages.length === 0) return []
  const out: ReportField[] = [
    { key: "__stage.current", label: "Time in current stage", type: "number", source: objectKey, column: "__stage", stageDuration: { kind: "current" } },
    { key: "__stage.toClose", label: "Time to close", type: "number", source: objectKey, column: "__stage", stageDuration: { kind: "toClose" } },
  ]
  const seen = new Set<string>()
  for (const s of stages) {
    if (seen.has(s.id)) continue
    seen.add(s.id)
    out.push({ key: `__stage.cum.${s.id}`, label: `Cumulative time in "${s.name}"`, type: "number", source: objectKey, column: "__stage", stageDuration: { kind: "cumulative", stageId: s.id } })
    out.push({ key: `__stage.latest.${s.id}`, label: `Latest time in "${s.name}"`, type: "number", source: objectKey, column: "__stage", stageDuration: { kind: "latest", stageId: s.id } })
  }
  return out
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
  // Stage durations are computed from the primary row only — not on joined sources.
  return tf.filter((f) => !f.stageDuration).map((f) => ({ ...f, key: `${joinPath}.${f.key}`, source: joinPath, joinPath }))
}

// Everything the builder needs for a primary object: its own fields + each joinable
// source (with the joined fields ready to add as dimensions/measures/columns).
export async function reportSchema(primary: string): Promise<{
  fields: ReportField[]
  associations: { path: string; target: string; label: string; fields: ReportField[] }[]
}> {
  const fields = await reportFieldsFor(primary)
  // USER associations (Owner / Created by) are inline fields, not data sources.
  const assocs = (REPORT_OBJECTS[primary]?.associations ?? []).filter((a) => a.target !== "USER")
  const associations = await Promise.all(assocs.map(async (a) => ({
    path: a.path, target: a.target, label: a.label, fields: await joinedFieldsForSource(primary, a.path),
  })))
  return { fields, associations }
}

// Detail-page route for a primary record, so report tables can link to it.
const RECORD_ROUTE: Record<string, string> = { REFERRAL: "/referrals", PRACTICE: "/practices", PROVIDER: "/referring-doctors", LOCATION: "/locations", SURGERY: "/surgery" }
export function recordHref(objectKey: string, id: string | null | undefined): string | null {
  if (!id) return null
  if (objectKey.startsWith("CO:")) return `/objects/${objectKey.slice(3)}/${id}`
  const base = RECORD_ROUTE[objectKey]
  return base ? `${base}/${id}` : null
}

export function reportObjectLabel(key: string): string {
  return REPORT_OBJECTS[key]?.label ?? (key.startsWith("CO:") ? key.slice(3) : key)
}

export function reportPermKey(objectKey: string): string {
  return recordPermKey(objectKey)
}
