// Plain (non-"use server") shared types + constants for record import, so both
// the server action and the client wizard can import them (a "use server" module
// may only export async functions).

// fieldMap target sentinel: the column carrying the app Record ID (match key).
export const RECORD_ID_TARGET = "__recordId"

// Providers are the one native object the importer takes. Its runs are stored
// under this key; custom object keys are lowercase slugs, so it can't collide.
export const PROVIDER_IMPORT_KEY = "PROVIDER"

/** The permission an import into `objectKey` needs (Edit to run, View to list). */
export function importPermKey(objectKey: string): string {
  return objectKey === PROVIDER_IMPORT_KEY ? "PROVIDERS" : `CO:${objectKey}`
}

/** The object-registry type of the records an import into `objectKey` writes. */
export function importObjectType(objectKey: string): string {
  return objectKey === PROVIDER_IMPORT_KEY ? "PROVIDER" : `CO:${objectKey}`
}

export type ImportMode = "upsert" | "createOnly" | "updateOnly"

export interface ImportConfig {
  fieldMap: Record<string, string> // colName -> propertyId | RECORD_ID_TARGET
  assocMap: { column: string; targetType: string }[] // colName -> registry key of the related object
  mode: ImportMode
}

export interface ImportBatchResult {
  created: number
  updated: number
  skipped: number
  errors: { row: number; message: string }[]
  practicesCreated?: number // provider imports: practices the file named that didn't exist yet
  error?: string // fatal (whole batch aborted, e.g. unauthorized)
}
