// What Genesis AI may read for one person. Server only.
//
// The CRM's access model is object-level: View on an object shows every record
// and field of it. The shared query code (lib/object-query, the report engine,
// lib/segment-table) checks nothing itself, and some screens show another
// object's data alongside (a practice page lists its referrals' patients). The
// assistant is stricter than that: it reads a value only when the person can
// View the object the value comes from — joins, foreign-key pick lists and
// relation counts included. Anything whose source object isn't known here is
// refused rather than guessed (scripts/check-genesis-ai.ts fails on it, so a new
// join gets mapped deliberately).

import { userCanLevel } from "@/lib/permissions"
import { recordPermKey } from "@/lib/record-perm-key"
import { fieldsFor } from "@/lib/object-fields-server"
import type { ObjectFieldDef } from "@/lib/object-fields"
import { listReportObjects } from "@/lib/reporting/objects"
import { segmentColumnCatalog, type SegmentColumn } from "@/lib/segment-table"

export interface Viewer {
  id: string
  name: string
  role: string
  permissions: string[]
}

/** USER isn't a data object: people's names are visible to everyone signed in. */
const PEOPLE = "USER"

/** Prisma relation (join path, relation-count relation) → the object it reads. */
export const RELATION_TARGET: Record<string, string> = {
  referringPractice: "PRACTICE",
  referringDoctor: "PROVIDER",
  referringLocation: "LOCATION",
  practice: "PRACTICE",
  location: "LOCATION",
  referral: "REFERRAL",
  referrals: "REFERRAL",
  locations: "LOCATION",
  doctors: "PROVIDER",
  activities: "ACTIVITY",
  assignedTo: PEOPLE,
  createdBy: PEOPLE,
  owner: PEOPLE,
  tags: "REFERRAL", // a referral's own tags
}

/** Foreign-key columns offered as pick lists → the object whose names they list. */
export const FK_TARGET: Record<string, string> = {
  referringPracticeId: "PRACTICE",
  referringDoctorId: "PROVIDER",
  referringLocationId: "LOCATION",
  practiceId: "PRACTICE",
  locationId: "LOCATION",
  referralId: "REFERRAL",
  assignedToId: PEOPLE,
  createdById: PEOPLE,
  ownerId: PEOPLE,
}

/**
 * Pick lists of org-wide configuration (pipelines, their stages, task queues):
 * labels every user works with, not records of another object.
 */
export const CONFIG_FKS = new Set(["pipelineId", "stageId", "queueId"])

export function canViewObject(me: Viewer, objectType: string): boolean {
  return userCanLevel(me, recordPermKey(objectType), "VIEW")
}

/**
 * The other object a filter field reveals: null when it reads only the record
 * itself, "UNKNOWN" when it reaches somewhere this module hasn't mapped.
 */
export function filterFieldSource(def: ObjectFieldDef): string | null | "UNKNOWN" {
  if (def.relationPath) return RELATION_TARGET[def.relationPath] ?? "UNKNOWN"
  if (def.relationCount) return RELATION_TARGET[def.relationCount.relation] ?? "UNKNOWN"
  if (def.relationSome) return RELATION_TARGET[def.relationSome.relation] ?? "UNKNOWN"
  // A select over a foreign key lists another object's names.
  if (def.type === "select" && !def.jsonBag && def.column && /Id$/.test(def.column)) {
    if (CONFIG_FKS.has(def.column)) return null
    return FK_TARGET[def.column] ?? "UNKNOWN"
  }
  return null
}

/** The other object a display column reads through a join (null = the record itself). */
export function columnSource(col: SegmentColumn): string | null | "UNKNOWN" {
  if (!col.joinPath) return null
  return RELATION_TARGET[col.joinPath] ?? "UNKNOWN"
}

function sourceAllowed(me: Viewer, source: string | null | "UNKNOWN"): boolean {
  if (source === null || source === PEOPLE) return true
  if (source === "UNKNOWN") return false
  return canViewObject(me, source)
}

/** Objects this person can View, built-in and custom, with their labels. */
export async function viewableObjects(me: Viewer): Promise<{ key: string; label: string }[]> {
  return (await listReportObjects()).filter((o) => canViewObject(me, o.key))
}

/** Filter criteria this person may use on `objectType` (fieldsFor keys). */
export async function allowedFilterDefs(me: Viewer, objectType: string): Promise<ObjectFieldDef[]> {
  if (!canViewObject(me, objectType)) return []
  return (await fieldsFor(objectType)).filter((d) => sourceAllowed(me, filterFieldSource(d)))
}

/** Columns this person may see, group by or measure on `objectType` (report/segment keys). */
export async function allowedColumns(me: Viewer, objectType: string): Promise<SegmentColumn[]> {
  if (!canViewObject(me, objectType)) return []
  return (await segmentColumnCatalog(objectType)).filter((c) => sourceAllowed(me, columnSource(c)))
}
