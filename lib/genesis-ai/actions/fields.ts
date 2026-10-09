// Which fields Genesis AI may change on a record, how each change is saved, and
// how a model-supplied value becomes the value the CRM stores. Server only.
//
// updateRecordField writes any column it's given (read-only ones included,
// skipping their side effects), so the allowlist lives here. Fields with their
// own behaviour go through their own action, exactly as the screens do:
// referral status / owner / pipeline, task status (repeats), surgery fields
// (status triggers), owners, and pipeline stages.

import { prisma } from "@/lib/prisma"
import { RECORD_FIELDS, type RecordFieldType } from "@/lib/record-field-catalog"
import { CP_FIELD_TYPE } from "@/lib/cp-field-def"
import { applyNativeLabels, nativeLabel } from "@/lib/native-labels"
import { STATUS_LABELS } from "@/lib/utils"
import { SURGERY_STATUS_LABELS } from "@/lib/surgery-constants"
import { clinicDateOnlyValue } from "@/lib/tz"
import { isCustomObject } from "@/lib/automation-records"
import { ActionError } from "./types"

export type EditRoute =
  | "field"              // updateRecordField(object, id, saveKey, value)
  | "surgery"            // updateSurgeryCase(id, { [saveKey]: value })
  | "referral_status"    // updateReferralStatus — automatic outreach on Scheduled/Completed
  | "referral_owner"     // assignReferral — notifies the new owner
  | "referral_pipeline"  // moveReferralsToPipeline — audit + pipeline triggers
  | "task_status"        // updateTaskStatus — creates the next repeat
  | "owner"              // setRecordOwner
  | "stage"              // moveRecordStage — the pipeline's move rules

export interface EditableField {
  /** The key the model uses (filter-style: native column, cp_<id>, owner, status, stage). */
  key: string
  label: string
  type: RecordFieldType
  multi?: boolean
  options?: { value: string; label: string }[]
  /** Stored as a number though offered as options (activity ratings). */
  numeric?: boolean
  route: EditRoute
  /** What the save path is called with: column, cp_<id>, or a custom-object property id. */
  saveKey: string
}

/** Columns updateSurgeryCase accepts (app/actions/surgery.ts). */
const SURGERY_KEYS = new Set([
  "status", "medicalClearance", "secondaryClearance", "dentalClearance", "ctRequired", "glp1", "dme",
  "physicalTherapy", "physicalTherapyDetail", "referral", "facility", "procedure", "surgeryDate", "language", "email", "notes",
])

const OWNER_LABEL: Record<string, string> = {
  REFERRAL: "Referral Owner", TASK: "Assigned To", PROVIDER: "Provider Owner", PRACTICE: "Practice Owner",
  LOCATION: "Location Owner", SURGERY: "Surgery Owner", ACTIVITY: "Activity Owner",
}

const opts = (values: string[] = [], labels?: Record<string, string>) => values.map((v) => ({ value: v, label: labels?.[v] ?? v }))

/** Every field of `objectType` Genesis may change (the person's Edit access is checked separately). */
export async function editableFields(objectType: string): Promise<EditableField[]> {
  const out: EditableField[] = []

  if (isCustomObject(objectType)) {
    const def = await prisma.customObjectDef.findUnique({ where: { key: objectType.slice(3) }, select: { properties: true, singular: true, ownerLabel: true } })
    if (!def) return []
    for (const p of (def.properties as any[]) ?? []) {
      out.push({
        key: `cp_${p.id}`, label: p.name, type: p.type === "USER" ? "user" : CP_FIELD_TYPE[p.type] ?? "text",
        multi: p.type === "MULTI_SELECT", options: opts(p.options, p.optionLabels), route: "field", saveKey: p.id,
      })
    }
    out.push({ key: "owner", label: def.ownerLabel || `${def.singular} Owner`, type: "user", route: "owner", saveKey: "owner" })
    out.push({ key: "stage", label: "Stage", type: "select", route: "stage", saveKey: "stage" })
    return out
  }

  // Native fields the record pages let people edit (the catalog's readOnly ones aren't).
  for (const f of await applyNativeLabels(objectType, RECORD_FIELDS[objectType] ?? [])) {
    if (f.readOnly) continue
    let route: EditRoute = "field"
    if (objectType === "SURGERY" && SURGERY_KEYS.has(f.key)) route = "surgery"
    if (objectType === "TASK" && f.key === "status") route = "task_status"
    if (objectType === "REFERRAL" && f.key === "pipelineId") route = "referral_pipeline"
    out.push({
      key: f.key, label: f.label, type: f.type, multi: f.multi, numeric: f.coerce === "number",
      options: f.key === "status" && objectType === "TASK" ? opts(f.options, TASK_STATUS_LABELS) : opts(f.options, f.optionLabels),
      route, saveKey: f.key,
    })
  }
  if (objectType === "REFERRAL") {
    const pipelines = await prisma.pipeline.findMany({ where: { objectType: "REFERRAL", isActive: true }, orderBy: { order: "asc" }, select: { id: true, name: true } })
    const p = out.find((f) => f.key === "pipelineId")
    if (p) p.options = pipelines.map((x) => ({ value: x.id, label: x.name }))
    out.push({ key: "status", label: await nativeLabel("REFERRAL", "status", "Status"), type: "select", options: opts(Object.keys(STATUS_LABELS), STATUS_LABELS as Record<string, string>), route: "referral_status", saveKey: "status" })
    out.push({ key: "owner", label: OWNER_LABEL.REFERRAL, type: "user", route: "referral_owner", saveKey: "assignedToId" })
    out.push({ key: "stage", label: "Stage", type: "select", route: "stage", saveKey: "stage" })
  } else if (objectType === "SURGERY") {
    out.push({ key: "status", label: await nativeLabel("SURGERY", "status", "Status"), type: "select", options: opts(Object.keys(SURGERY_STATUS_LABELS), SURGERY_STATUS_LABELS), route: "surgery", saveKey: "status" })
    out.push({ key: "owner", label: OWNER_LABEL.SURGERY, type: "user", route: "owner", saveKey: "owner" })
  } else if (OWNER_LABEL[objectType]) {
    out.push({ key: "owner", label: OWNER_LABEL[objectType], type: "user", route: "owner", saveKey: "owner" })
  }

  // Custom properties on built-in objects.
  const cps = await prisma.customProperty.findMany({ where: { entityType: objectType as any }, orderBy: { createdAt: "asc" } }).catch(() => [])
  for (const cp of cps) {
    out.push({
      key: `cp_${cp.id}`, label: cp.name, type: (cp.type as string) === "USER" ? "user" : CP_FIELD_TYPE[cp.type as string] ?? "text",
      multi: (cp.type as string) === "MULTI_SELECT", options: opts(cp.options, (cp as any).optionLabels ?? undefined),
      route: "field", saveKey: `cp_${cp.id}`,
    })
  }
  return out
}

export const TASK_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Not started", IN_PROGRESS: "In progress", WAITING: "Waiting", COMPLETED: "Completed", DEFERRED: "Deferred",
}

// ── Values ────────────────────────────────────────────────────────────────────

export interface UserOption { id: string; name: string }

export async function activeUserOptions(): Promise<UserOption[]> {
  const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } })
  return users.map((u) => ({ id: u.id, name: u.name || u.email }))
}

/** A person by id, "@me", or their name/email (unambiguous). */
export function resolveUser(raw: string, meId: string, users: UserOption[]): UserOption {
  const v = raw.trim()
  if (v.toLowerCase() === "@me" || v.toLowerCase() === "me") {
    return users.find((u) => u.id === meId) ?? { id: meId, name: "you" }
  }
  const byId = users.find((u) => u.id === v)
  if (byId) return byId
  const matches = users.filter((u) => u.name.toLowerCase() === v.toLowerCase())
  if (matches.length === 1) return matches[0]
  const partial = users.filter((u) => u.name.toLowerCase().includes(v.toLowerCase()))
  if (partial.length === 1) return partial[0]
  throw new ActionError(partial.length > 1
    ? `"${v}" matches several people (${partial.slice(0, 5).map((u) => u.name).join(", ")}). Which one?`
    : `No active user named "${v}".`)
}

function pickOption(f: EditableField, raw: string): { value: string; label: string } {
  const v = raw.trim()
  const hit = f.options?.find((o) => o.value === v) ?? f.options?.find((o) => o.label.toLowerCase() === v.toLowerCase())
  if (!hit) throw new ActionError(`"${v}" isn't an option for ${f.label}. Options: ${(f.options ?? []).map((o) => o.label).join(", ")}.`)
  return hit
}

function parseDay(raw: string): Date {
  const d = clinicDateOnlyValue(raw.trim())
  if (!d || Number.isNaN(d.getTime())) throw new ActionError(`"${raw}" isn't a date — use yyyy-mm-dd.`)
  return d
}

const fmtDay = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })

/**
 * The stored value for a change, and how the card shows it. An empty list
 * clears the field. Throws ActionError with a message the model can relay.
 */
export function coerceValue(f: EditableField, values: string[], meId: string, users: UserOption[]): { value: unknown; display: string } {
  const vals = values.map((v) => v.trim()).filter((v) => v !== "")
  if (!vals.length) return { value: f.multi ? [] : null, display: "(empty)" }
  switch (f.type) {
    case "user": {
      const u = resolveUser(vals[0], meId, users)
      return { value: u.id, display: u.name }
    }
    case "number": {
      const n = Number(vals[0].replace(/[$,\s]/g, ""))
      if (!Number.isFinite(n)) throw new ActionError(`${f.label} needs a number.`)
      return { value: n, display: n.toLocaleString("en-US") }
    }
    case "checkbox": {
      const v = vals[0].toLowerCase()
      if (["true", "yes", "y", "1", "checked"].includes(v)) return { value: true, display: "Yes" }
      if (["false", "no", "n", "0", "unchecked"].includes(v)) return { value: false, display: "No" }
      throw new ActionError(`${f.label} is yes or no.`)
    }
    case "date": {
      const d = parseDay(vals[0])
      // Native date columns are normalized by updateRecordField; property bags
      // store a string — a calendar day at noon UTC either way.
      return { value: f.route === "field" && f.saveKey.startsWith("cp_") ? d.toISOString() : d.toISOString().slice(0, 10), display: fmtDay(d) }
    }
    case "datetime": {
      const raw = vals[0]
      const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw) ? parseDay(raw) : new Date(raw)
      if (Number.isNaN(d.getTime())) throw new ActionError(`"${raw}" isn't a date.`)
      return { value: d.toISOString(), display: d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) }
    }
    case "select":
    case "select_or_other": {
      if (f.key === "stage") return { value: vals[0], display: vals[0] } // resolved per record
      if (f.type === "select_or_other" && !f.options?.some((o) => o.value === vals[0] || o.label.toLowerCase() === vals[0].toLowerCase())) {
        return { value: vals[0], display: vals[0] } // free text is allowed
      }
      if (f.multi) {
        const picked = vals.map((v) => pickOption(f, v))
        return { value: picked.map((o) => o.value), display: picked.map((o) => o.label).join(", ") }
      }
      const o = pickOption(f, vals[0])
      return { value: f.numeric ? Number(o.value) : o.value, display: o.label }
    }
    case "email": {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(vals[0])) throw new ActionError(`"${vals[0]}" isn't an email address.`)
      return { value: vals[0], display: vals[0] }
    }
    default:
      return { value: vals.join(" "), display: vals.join(" ").length > 120 ? `${vals.join(" ").slice(0, 119)}…` : vals.join(" ") }
  }
}
