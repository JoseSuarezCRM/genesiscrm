// Record changes Genesis AI can propose: update fields, create, add a note or
// call, delete, link. Server only.
//
// prepare*  runs while Genesis answers: checks the person's access, validates
//           every value, reads the current values, and builds the card. It
//           writes nothing.
// execute*  runs when the person clicks Confirm, in their own request: checks
//           their access again, then calls the CRM's own actions — so their
//           permission checks, validation, workflows and audit apply unchanged.

import { prisma } from "@/lib/prisma"
import { isRedirectError } from "next/dist/client/components/redirect"
import { delegateFor, isCustomObject, recordLabel } from "@/lib/automation-records"
import { recordHref } from "@/lib/record-href"
import { canViewObject, type Viewer } from "../access"
import { resolveObject } from "../shared"
import { ActionError, type ExecResult, type Prepared } from "./types"
import { activeUserOptions, coerceValue, editableFields, type EditableField, type EditRoute } from "./fields"
import { canCreateObject, canDeleteObject, canEditObject, refusal } from "./gates"
import { updateRecordField } from "@/app/actions/record-fields"
import { setRecordOwner } from "@/app/actions/record-owner"
import { assignReferral, createReferral, moveReferralsToPipeline, updateReferralStatus } from "@/app/actions/referrals"
import { createTask, deleteTask, updateTaskStatus } from "@/app/actions/tasks"
import { moveRecordStage } from "@/app/actions/stages"
import { createSurgeryCase, updateSurgeryCase } from "@/app/actions/surgery"
import { createDoctor, createLocation, createPractice } from "@/app/actions/referring-doctors"
import { createActivity, deleteActivity } from "@/app/actions/activities"
import { createCustomObjectRecord } from "@/app/actions/custom-object-records"
import { addRecordNote, logCall } from "@/app/actions/record-activity"
import { deleteRecord } from "@/app/actions/record-crud"
import { associateRecords } from "@/app/actions/associations"

export const MAX_UPDATE = 25
export const MAX_DELETE = 10

const SINGULAR: Record<string, string> = {
  REFERRAL: "referral", PROVIDER: "provider", PRACTICE: "practice", LOCATION: "location",
  SURGERY: "surgery case", ACTIVITY: "activity", TASK: "task",
}

async function singularOf(objectType: string): Promise<string> {
  if (!isCustomObject(objectType)) return SINGULAR[objectType] ?? "record"
  const def = await prisma.customObjectDef.findUnique({ where: { key: objectType.slice(3) }, select: { singular: true } })
  return (def?.singular ?? "record").toLowerCase()
}

const listNames = (names: string[], max = 8) =>
  names.length <= max ? names.join(", ") : `${names.slice(0, max).join(", ")} and ${names.length - max} more`

/** The records, in order, with their names — refusing ids that don't exist. */
async function loadRecords(objectType: string, label: string, ids: string[]): Promise<{ id: string; name: string; raw: any }[]> {
  const model = delegateFor(objectType)
  if (!model) throw new ActionError(`${label} records can't be changed here.`)
  const where = isCustomObject(objectType) ? { id: { in: ids }, objectDef: { key: objectType.slice(3) } } : { id: { in: ids } }
  const rows: any[] = await model.findMany({ where })
  const byId = new Map(rows.map((r) => [r.id, r]))
  const missing = ids.filter((id) => !byId.has(id))
  if (missing.length) throw new ActionError(`No ${label} record with id ${missing[0]}. Look it up again with find_records or query_records.`)
  return Promise.all(ids.map(async (id) => ({ id, name: await recordLabel(objectType, id, byId.get(id)), raw: byId.get(id) })))
}

/** Run one CRM action, turning its error result, a thrown error or a redirect into a verdict. */
async function attempt(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    const r: any = await fn()
    if (r && typeof r === "object" && "error" in r && r.error) {
      return typeof r.error === "string" ? r.error : "The CRM rejected some values."
    }
    return null
  } catch (e) {
    if (isRedirectError(e)) return null // e.g. deleteReferral redirects after a successful delete
    return e instanceof Error ? e.message : "It failed."
  }
}

// ── Update records ────────────────────────────────────────────────────────────

interface Change { key: string; label: string; route: EditRoute; saveKey: string; value: any; display: string }
export interface UpdatePayload {
  object: string
  label: string
  records: { id: string; name: string }[]
  changes: Change[]
  /** Per record, for a stage change: the stage in that record's pipeline. */
  stageTargets?: Record<string, { pipelineId: string; stageId: string }>
}

function rawValue(objectType: string, f: EditableField, raw: any): unknown {
  switch (f.route) {
    case "owner": return objectType === "TASK" ? raw.assignedToId : raw.ownerId
    case "referral_owner": return raw.assignedToId
    case "referral_status": case "task_status": return raw.status
    case "referral_pipeline": return raw.pipelineId
    case "stage": return raw.stageId
    case "surgery": return raw[f.saveKey]
    case "field":
      if (isCustomObject(objectType)) return (raw.values ?? {})[f.saveKey]
      if (f.saveKey.startsWith("cp_")) return (raw.customProperties ?? {})[f.saveKey.slice(3)]
      return raw[f.saveKey]
  }
}

function shown(f: EditableField, v: unknown, people: Map<string, string>, stages: Map<string, string>): string {
  if (v == null || v === "" || (Array.isArray(v) && !v.length)) return "(empty)"
  if (f.type === "user") return people.get(String(v)) ?? "someone"
  if (f.route === "stage") return stages.get(String(v)) ?? "(unknown stage)"
  if (Array.isArray(v)) return v.map((x) => f.options?.find((o) => o.value === String(x))?.label ?? String(x)).join(", ")
  if (v instanceof Date || ((f.type === "date" || f.type === "datetime") && !Number.isNaN(new Date(String(v)).getTime()))) {
    const d = new Date(v as any)
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: f.type === "date" ? "UTC" : "America/Chicago" })
  }
  if (typeof v === "boolean") return v ? "Yes" : "No"
  const s = f.options?.find((o) => o.value === String(v))?.label ?? String(v)
  return s.length > 80 ? `${s.slice(0, 79)}…` : s
}

export async function prepareUpdate(me: Viewer, input: { object: string; record_ids: string[]; changes: { field: string; values: string[] }[] }): Promise<Prepared<UpdatePayload>> {
  const obj = await resolveObject(me, input.object)
  if (!canEditObject(me, obj.key)) throw new ActionError(refusal(me, "edit", obj.label))
  const ids = Array.from(new Set(input.record_ids))
  if (!ids.length) throw new ActionError("Name at least one record to update.")
  if (ids.length > MAX_UPDATE) throw new ActionError(`At most ${MAX_UPDATE} records at a time. Split the change up.`)
  if (!input.changes.length) throw new ActionError("Say what to change.")

  const [fields, users] = await Promise.all([editableFields(obj.key), activeUserOptions()])
  const people = new Map(users.map((u) => [u.id, u.name]))
  const changes: Change[] = []
  for (const c of input.changes) {
    const f = fields.find((x) => x.key === c.field)
    if (!f) throw new ActionError(`"${c.field}" can't be changed on ${obj.label}. Fields you can change: ${fields.map((x) => `${x.key} (${x.label})`).join(", ")}.`)
    if (changes.some((x) => x.key === f.key)) throw new ActionError(`${f.label} is listed twice.`)
    const { value, display } = coerceValue(f, c.values, me.id, users)
    changes.push({ key: f.key, label: f.label, route: f.route, saveKey: f.saveKey, value, display })
  }
  const records = await loadRecords(obj.key, obj.label, ids)

  // A stage is named per pipeline: resolve it in each record's own pipeline.
  let stageTargets: UpdatePayload["stageTargets"]
  const stageNames = new Map<string, string>()
  const stageChange = changes.find((c) => c.route === "stage")
  if (stageChange || fields.some((f) => f.route === "stage")) {
    const pipelines = await prisma.pipeline.findMany({ where: { objectType: obj.key }, include: { stages: { orderBy: { order: "asc" } } } })
    for (const p of pipelines) for (const s of p.stages) stageNames.set(s.id, s.name)
    if (stageChange) {
      stageTargets = {}
      for (const r of records) {
        const p = pipelines.find((x) => x.id === r.raw.pipelineId)
        if (!p) throw new ActionError(`${r.name} isn't in a pipeline, so it has no stages.`)
        const want = String(stageChange.value).toLowerCase()
        const s = p.stages.find((x) => x.id === stageChange.value || x.name.toLowerCase() === want)
        if (!s) throw new ActionError(`"${stageChange.value}" isn't a stage of the ${p.name} pipeline. Stages: ${p.stages.map((x) => x.name).join(", ")}.`)
        stageTargets[r.id] = { pipelineId: p.id, stageId: s.id }
        stageChange.display = s.name
      }
    }
  }

  const single = records.length === 1
  const lines: string[] = []
  for (const c of changes) {
    const f = fields.find((x) => x.key === c.key)!
    lines.push(single ? `${c.label}: ${shown(f, rawValue(obj.key, f, records[0].raw), people, stageNames)} → ${c.display}` : `${c.label} → ${c.display}`)
  }
  if (!single) lines.push(`Records: ${listNames(records.map((r) => r.name))}`)

  const warnings: string[] = []
  const status = changes.find((c) => c.route === "referral_status")
  if (status && (status.value === "SCHEDULED" || status.value === "COMPLETED")) {
    warnings.push("Also texts and emails the patient (automatic outreach), as when you change it by hand.")
  }
  if (changes.some((c) => c.route === "referral_owner")) warnings.push("The new owner is notified.")

  const onlyComplete = obj.key === "TASK" && changes.length === 1 && changes[0].route === "task_status" && changes[0].value === "COMPLETED"
  const title = onlyComplete
    ? (single ? `Mark task “${records[0].name}” complete` : `Mark ${records.length} tasks complete`)
    : single ? `Update ${records[0].name}` : `Update ${records.length} ${obj.label.toLowerCase()}`

  return {
    kind: "update_records",
    payload: { object: obj.key, label: obj.label, records: records.map((r) => ({ id: r.id, name: r.name })), changes, stageTargets },
    card: { title, lines, warnings },
    objects: [obj.key],
  }
}

export async function executeUpdate(me: Viewer, p: UpdatePayload): Promise<ExecResult> {
  if (!canEditObject(me, p.object)) return { ok: false, message: refusal(me, "edit", p.label) }
  const problems: string[] = []
  const note = (name: string, err: string | null) => { if (err) problems.push(`${name}: ${err}`) }
  const ids = p.records.map((r) => r.id)

  const pipeline = p.changes.find((c) => c.route === "referral_pipeline")
  if (pipeline) note("Pipeline", await attempt(() => moveReferralsToPipeline(ids, (pipeline.value as string) || null)))

  for (const r of p.records) {
    const surgery = p.changes.filter((c) => c.route === "surgery")
    if (surgery.length) note(r.name, await attempt(() => updateSurgeryCase(r.id, Object.fromEntries(surgery.map((c) => [c.saveKey, c.value])) as any)))
    for (const c of p.changes) {
      switch (c.route) {
        case "field": note(r.name, await attempt(() => updateRecordField(p.object, r.id, c.saveKey, c.value))); break
        case "referral_status": note(r.name, await attempt(() => updateReferralStatus(r.id, c.value))); break
        case "referral_owner": note(r.name, await attempt(() => assignReferral(r.id, c.value ?? null))); break
        case "task_status": note(r.name, await attempt(() => updateTaskStatus(r.id, c.value))); break
        case "owner": note(r.name, await attempt(() => setRecordOwner(p.object as any, r.id, c.value ?? null))); break
        case "stage": {
          const t = p.stageTargets?.[r.id]
          note(r.name, t ? await attempt(() => moveRecordStage(p.object, r.id, t.pipelineId, t.stageId)) : "no stage")
          break
        }
      }
    }
  }
  const n = p.records.length
  const what = n === 1 ? p.records[0].name : `${n} ${p.label.toLowerCase()}`
  return problems.length
    ? { ok: false, message: `Some changes didn't save — ${problems.slice(0, 5).join("; ")}`, link: n === 1 ? recordHref(p.object, ids[0]) : null, recordIds: ids }
    : { ok: true, message: `Updated ${what}.`, link: n === 1 ? recordHref(p.object, ids[0]) : null, recordIds: ids }
}

// ── Create a record ───────────────────────────────────────────────────────────

/** Fields every create needs, beyond what the person gives (defaults are applied first). */
export const REQUIRED: Record<string, string[]> = {
  REFERRAL: ["patientFirstName", "patientLastName"],
  PRACTICE: ["name"],
  LOCATION: ["name", "practice"],
  PROVIDER: ["name", "practice"],
  SURGERY: ["patientName"],
  TASK: ["title"],
  ACTIVITY: [],
}

/** Picks of other records a create can take, by name or id. */
export const PICKS: Record<string, { key: string; label: string; object: string; saveKey: string; multi?: boolean }[]> = {
  REFERRAL: [
    { key: "practice", label: "Referring practice", object: "PRACTICE", saveKey: "referringPracticeId" },
    { key: "provider", label: "Referring provider", object: "PROVIDER", saveKey: "referringDoctorId" },
    { key: "location", label: "Referring location", object: "LOCATION", saveKey: "referringLocationId" },
  ],
  LOCATION: [{ key: "practice", label: "Practice", object: "PRACTICE", saveKey: "practiceId" }],
  PROVIDER: [{ key: "practice", label: "Practice", object: "PRACTICE", saveKey: "practiceId" }],
  ACTIVITY: [
    { key: "practice", label: "Practice", object: "PRACTICE", saveKey: "practiceId" },
    { key: "location", label: "Location", object: "LOCATION", saveKey: "locationId" },
    { key: "providers", label: "Providers", object: "PROVIDER", saveKey: "providerIds", multi: true },
  ],
}

async function pickRecord(me: Viewer, object: string, raw: string): Promise<{ id: string; name: string }> {
  if (!canViewObject(me, object)) throw new ActionError(`You can't view ${object.toLowerCase()} records, so you can't pick one.`)
  const v = raw.trim()
  const model = delegateFor(object)!
  const byId = await model.findUnique({ where: { id: v }, select: { id: true, name: true } }).catch(() => null)
  if (byId) return { id: byId.id, name: byId.name }
  const hits: any[] = await model.findMany({ where: { name: { equals: v, mode: "insensitive" } }, select: { id: true, name: true }, take: 3 })
  if (hits.length === 1) return hits[0]
  const partial: any[] = hits.length ? hits : await model.findMany({ where: { name: { contains: v, mode: "insensitive" } }, select: { id: true, name: true }, take: 6 })
  if (partial.length === 1) return partial[0]
  throw new ActionError(partial.length
    ? `"${v}" matches several: ${partial.map((x) => x.name).join(", ")}. Which one?`
    : `No ${SINGULAR[object] ?? "record"} named "${v}". Find it first with find_records.`)
}

export interface CreatePayload {
  object: string
  label: string
  singular: string
  name: string
  native: Record<string, any>
  customProperties: Record<string, any>
  ownerId?: string
  related?: { object: string; id: string }
}

export async function prepareCreate(me: Viewer, input: { object: string; values: { field: string; values: string[] }[]; related_to?: { object: string; id: string } }): Promise<Prepared<CreatePayload>> {
  const obj = await resolveObject(me, input.object)
  if (!canCreateObject(me, obj.key)) throw new ActionError(refusal(me, "create", obj.label))
  const [fields, users] = await Promise.all([editableFields(obj.key), activeUserOptions()])
  const picks = PICKS[obj.key] ?? []
  const native: Record<string, any> = {}
  const customProperties: Record<string, any> = {}
  let ownerId: string | undefined
  const lines: string[] = []
  const given = new Set<string>()

  for (const v of input.values) {
    if (given.has(v.field)) throw new ActionError(`${v.field} is listed twice.`)
    given.add(v.field)
    const pick = picks.find((x) => x.key === v.field)
    if (pick) {
      const chosen = await Promise.all((pick.multi ? v.values : v.values.slice(0, 1)).filter((x) => x.trim()).map((x) => pickRecord(me, pick.object, x)))
      if (!chosen.length) continue
      native[pick.saveKey] = pick.multi ? chosen.map((c) => c.id) : chosen[0].id
      lines.push(`${pick.label}: ${chosen.map((c) => c.name).join(", ")}`)
      continue
    }
    const f = fields.find((x) => x.key === v.field && x.route !== "stage")
    if (!f) {
      const options = [...fields.filter((x) => x.route !== "stage").map((x) => `${x.key} (${x.label})`), ...picks.map((x) => `${x.key} (${x.label})`)]
      throw new ActionError(`"${v.field}" can't be set when creating ${obj.label}. Fields: ${options.join(", ")}.`)
    }
    const { value, display } = coerceValue(f, v.values, me.id, users)
    if (value === null || (Array.isArray(value) && !value.length)) continue
    if (f.route === "owner" || f.route === "referral_owner") ownerId = value as string
    else if (isCustomObject(obj.key)) customProperties[f.saveKey] = value
    else if (f.saveKey.startsWith("cp_")) customProperties[f.saveKey.slice(3)] = value
    else native[f.saveKey] = value
    lines.push(`${f.label}: ${display}`)
  }

  // The screens' defaults.
  if (obj.key === "REFERRAL") {
    native.status ??= "NEW"
    native.referralDate ??= new Date().toISOString().slice(0, 10)
  }
  if (obj.key === "TASK") ownerId ??= me.id // assignee defaults to the creator
  if (!isCustomObject(obj.key)) ownerId ??= obj.key === "ACTIVITY" ? undefined : me.id

  const missing = (REQUIRED[obj.key] ?? []).filter((k) => {
    const pick = picks.find((x) => x.key === k)
    return pick ? !native[pick.saveKey] : native[k] == null || native[k] === ""
  })
  if (missing.length) throw new ActionError(`To create ${obj.label.toLowerCase()} I still need: ${missing.join(", ")}.`)

  let related: CreatePayload["related"]
  if (input.related_to) {
    if (obj.key !== "TASK") throw new ActionError("Only a task can be linked to a record as it's created. Create it, then use propose_link_records.")
    const rel = await resolveObject(me, input.related_to.object)
    const [r] = await loadRecords(rel.key, rel.label, [input.related_to.id])
    related = { object: rel.key, id: r.id }
    lines.push(`Linked to: ${r.name} (${rel.label})`)
  }
  if (ownerId) lines.push(`${obj.key === "TASK" ? "Assigned to" : "Owner"}: ${users.find((u) => u.id === ownerId)?.name ?? "you"}`)

  const name = obj.key === "REFERRAL" ? `${native.patientFirstName ?? ""} ${native.patientLastName ?? ""}`.trim()
    : String(native.name ?? native.title ?? native.patientName ?? "")
  const singular = await singularOf(obj.key)
  const warnings: string[] = []
  if (obj.key === "REFERRAL") {
    warnings.push("Adding a referral can start automated patient messages (sequences), as when you add one by hand.")
    if (native.referringDoctorName && !native.referringPracticeId) warnings.push("If the referring practice isn't in the CRM yet, it's created too.")
  }
  return {
    kind: "create_record",
    payload: { object: obj.key, label: obj.label, singular, name, native, customProperties, ownerId, related },
    card: { title: `Create ${singular}${name ? ` “${name}”` : ""}`, lines, warnings },
    objects: [obj.key, ...(related ? [related.object] : [])],
  }
}

export async function executeCreate(me: Viewer, p: CreatePayload): Promise<ExecResult> {
  if (!canCreateObject(me, p.object)) return { ok: false, message: refusal(me, "create", p.label) }
  const cp = Object.keys(p.customProperties).length ? { customProperties: p.customProperties } : {}
  let res: any
  try {
    switch (p.object) {
      case "REFERRAL": res = await createReferral({ ...p.native, ...cp }); break
      case "PRACTICE": res = await createPractice({ ...p.native, ...cp, ownerId: p.ownerId }); break
      case "LOCATION": res = await createLocation({ ...p.native, ...cp, ownerId: p.ownerId }); break
      case "PROVIDER": res = await createDoctor({ ...p.native, ...cp, ownerId: p.ownerId }); break
      case "SURGERY": res = await createSurgeryCase({ ...p.native, ...cp, ownerId: p.ownerId } as any); break
      case "ACTIVITY": res = await createActivity({ ...p.native }); break
      case "TASK": res = await createTask({ ...p.native, assignedToId: p.ownerId, associations: p.related ? [{ type: p.related.object, id: p.related.id }] : [] }); break
      default:
        if (!isCustomObject(p.object)) return { ok: false, message: `${p.label} can't be created here.` }
        res = await createCustomObjectRecord(p.object.slice(3), p.customProperties, p.ownerId)
    }
  } catch (e) {
    if (!isRedirectError(e)) return { ok: false, message: e instanceof Error ? e.message : "It couldn't be created." }
  }
  if (res?.error) {
    const err = typeof res.error === "string" ? res.error : Object.values(res.error as Record<string, string[]>).flat().join(" ") || "Some values were rejected."
    return { ok: false, message: res.duplicate ? `${err} (an existing record has the same name)` : err }
  }
  const id: string | undefined = res?.id
  return { ok: true, message: `Created ${p.singular}${p.name ? ` “${p.name}”` : ""}.`, link: id ? (p.object === "TASK" ? `/tasks?highlight=${id}` : recordHref(p.object, id)) : null, recordIds: id ? [id] : [] }
}

// ── Add a note or log a call ──────────────────────────────────────────────────

export interface NotePayload { object: string; label: string; id: string; name: string; kind: "note" | "call"; body: string; outcome?: string }

export async function prepareNote(me: Viewer, input: { object: string; record_id: string; kind: "note" | "call"; body: string; outcome?: string }): Promise<Prepared<NotePayload>> {
  const obj = await resolveObject(me, input.object)
  if (!canEditObject(me, obj.key)) throw new ActionError(refusal(me, "add notes to", obj.label))
  const body = input.body.trim()
  if (!body) throw new ActionError("The note is empty.")
  const [r] = await loadRecords(obj.key, obj.label, [input.record_id])
  const preview = body.length > 400 ? `${body.slice(0, 399)}…` : body
  return {
    kind: "add_note",
    payload: { object: obj.key, label: obj.label, id: r.id, name: r.name, kind: input.kind, body, outcome: input.outcome?.trim() || undefined },
    card: {
      title: input.kind === "call" ? `Log a call on ${r.name}` : `Add a note to ${r.name}`,
      lines: [...(input.kind === "call" && input.outcome ? [`Outcome: ${input.outcome}`] : []), preview],
      warnings: [],
    },
    objects: [obj.key],
  }
}

export async function executeNote(me: Viewer, p: NotePayload): Promise<ExecResult> {
  if (!canEditObject(me, p.object)) return { ok: false, message: refusal(me, "add notes to", p.label) }
  const err = await attempt(() => (p.kind === "call" ? logCall(p.object, p.id, { body: p.body, outcome: p.outcome }) : addRecordNote(p.object, p.id, p.body)))
  return err ? { ok: false, message: err } : { ok: true, message: p.kind === "call" ? `Logged the call on ${p.name}.` : `Added the note to ${p.name}.`, link: recordHref(p.object, p.id), recordIds: [p.id] }
}

// ── Delete records ────────────────────────────────────────────────────────────

export interface DeletePayload { object: string; label: string; records: { id: string; name: string }[] }

export async function prepareDelete(me: Viewer, input: { object: string; record_ids: string[] }): Promise<Prepared<DeletePayload>> {
  const obj = await resolveObject(me, input.object)
  if (!canDeleteObject(me, obj.key)) throw new ActionError(refusal(me, "delete", obj.label))
  const ids = Array.from(new Set(input.record_ids))
  if (!ids.length) throw new ActionError("Name the records to delete.")
  if (ids.length > MAX_DELETE) throw new ActionError(`At most ${MAX_DELETE} records can be deleted at a time.`)
  const records = await loadRecords(obj.key, obj.label, ids)
  const single = records.length === 1
  return {
    kind: "delete_records",
    payload: { object: obj.key, label: obj.label, records: records.map((r) => ({ id: r.id, name: r.name })) },
    card: {
      title: single ? `Delete ${records[0].name}` : `Delete ${records.length} ${obj.label.toLowerCase()}`,
      lines: single ? [`${await singularOf(obj.key)} · ${obj.label}`] : [`Records: ${listNames(records.map((r) => r.name))}`],
      warnings: ["This can't be undone."],
      danger: true,
    },
    objects: [obj.key],
  }
}

export async function executeDelete(me: Viewer, p: DeletePayload): Promise<ExecResult> {
  if (!canDeleteObject(me, p.object)) return { ok: false, message: refusal(me, "delete", p.label) }
  const problems: string[] = []
  for (const r of p.records) {
    const err = await attempt(() =>
      p.object === "TASK" ? deleteTask(r.id)
      : p.object === "ACTIVITY" ? deleteActivity(r.id)
      : deleteRecord(p.object, r.id))
    if (err) problems.push(`${r.name}: ${err}`)
  }
  const n = p.records.length
  return problems.length
    ? { ok: false, message: `Not everything was deleted — ${problems.slice(0, 5).join("; ")}`, recordIds: p.records.map((r) => r.id) }
    : { ok: true, message: n === 1 ? `Deleted ${p.records[0].name}.` : `Deleted ${n} ${p.label.toLowerCase()}.`, recordIds: p.records.map((r) => r.id) }
}

// ── Link two records ──────────────────────────────────────────────────────────

export interface LinkPayload { object: string; id: string; name: string; otherObject: string; otherId: string; otherName: string; labels: [string, string] }

export async function prepareLink(me: Viewer, input: { object: string; record_id: string; other_object: string; other_id: string }): Promise<Prepared<LinkPayload>> {
  const a = await resolveObject(me, input.object)
  const b = await resolveObject(me, input.other_object)
  if (!canEditObject(me, a.key)) throw new ActionError(refusal(me, "edit", a.label))
  if (!canEditObject(me, b.key)) throw new ActionError(refusal(me, "edit", b.label))
  // Only pairs the Data Model allows — the same list the association cards offer.
  const pair = await prisma.objectAssociationDef.findFirst({ where: { OR: [{ typeA: a.key, typeB: b.key }, { typeA: b.key, typeB: a.key }] } })
  if (!pair) throw new ActionError(`${a.label} and ${b.label} can't be linked (not set up in Settings → Data Model).`)
  const [ra] = await loadRecords(a.key, a.label, [input.record_id])
  const [rb] = await loadRecords(b.key, b.label, [input.other_id])
  return {
    kind: "link_records",
    payload: { object: a.key, id: ra.id, name: ra.name, otherObject: b.key, otherId: rb.id, otherName: rb.name, labels: [a.label, b.label] },
    card: { title: `Link ${ra.name} and ${rb.name}`, lines: [`${ra.name} (${a.label}) ↔ ${rb.name} (${b.label})`], warnings: [] },
    objects: [a.key, b.key],
  }
}

export async function executeLink(me: Viewer, p: LinkPayload): Promise<ExecResult> {
  if (!canEditObject(me, p.object) || !canEditObject(me, p.otherObject)) return { ok: false, message: refusal(me, "edit", `${p.labels[0]} or ${p.labels[1]}`) }
  const err = await attempt(() => associateRecords(p.object, p.id, p.otherObject, p.otherId))
  return err ? { ok: false, message: err } : { ok: true, message: `Linked ${p.name} and ${p.otherName}.`, link: recordHref(p.object, p.id), recordIds: [p.id, p.otherId] }
}
