// Plain (non-"use server") shared types + constants for record import, so both
// the server action and the client wizard can import them (a "use server" module
// may only export async functions).

// fieldMap target sentinel: the column carrying the app Record ID (match key).
export const RECORD_ID_TARGET = "__recordId"

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
  error?: string // fatal (whole batch aborted, e.g. unauthorized)
}
