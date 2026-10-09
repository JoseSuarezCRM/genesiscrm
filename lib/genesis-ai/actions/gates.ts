// Who may make which change — the same rule each screen applies, as pure
// functions over a Viewer. Used twice: when Genesis proposes a change (so it
// refuses up front) and again when the person confirms (with their session's
// current permissions), before the CRM's own action runs with its own checks.
//
// Several existing actions check only that someone is signed in and leave the
// real rule to the page (createSegment, the create*View actions,
// createSavedReport, deleteDoctor, moveRecordStage). The rules below are those
// pages' rules, so Genesis never lets anyone do more than the screens would.

import { userCanLevel, userCanDelete } from "@/lib/permissions"
import { recordPermKey } from "@/lib/record-perm-key"
import { canViewObject, type Viewer } from "../access"

const key = recordPermKey

/** Edit records of an object. Locations can also be edited from their practice. */
export function canEditObject(me: Viewer, objectType: string): boolean {
  if (objectType === "LOCATION") return userCanLevel(me, "LOCATIONS", "EDIT") || userCanLevel(me, "PRACTICES", "EDIT")
  return userCanLevel(me, key(objectType), "EDIT")
}

/** Create records — the same as Edit, as every create action checks. */
export const canCreateObject = canEditObject

/** Delete records. Locations can also be deleted by whoever may delete practices. */
export function canDeleteObject(me: Viewer, objectType: string): boolean {
  if (objectType === "LOCATION") return userCanDelete(me, "LOCATIONS") || userCanDelete(me, "PRACTICES")
  return userCanDelete(me, key(objectType))
}

/** /segments/new: Segments Edit, and View of the object it lists. */
export function canCreateSegment(me: Viewer, objectType: string): boolean {
  return userCanLevel(me, "SEGMENTS", "EDIT") && canViewObject(me, objectType)
}

/** The report builder: Reports View, and View of every object the report reads. */
export function canCreateReport(me: Viewer, objectTypes: string[]): boolean {
  return userCanLevel(me, "REPORTS", "VIEW") && objectTypes.every((o) => canViewObject(me, o))
}

/** List pages let anyone who can View the object save a view of it. */
export function canCreateView(me: Viewer, objectType: string): boolean {
  return canViewObject(me, objectType)
}

/** Why a change is refused, in words the model can pass on. */
export function refusal(me: Viewer, what: string, label: string): string {
  return `You don't have permission to ${what} ${label}. An admin can grant it in Settings → User Management.`
}
