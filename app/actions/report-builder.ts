"use server"

import { requireAccess } from "@/lib/auth-guard"
import { runReport, drillReport } from "@/lib/reporting/query"
import { reportFieldsFor, reportSchema, listReportObjects, reportPermKey } from "@/lib/reporting/objects"
import type { ReportConfig, ReportField, ReportResult } from "@/lib/reporting/types"

// The objects a user can report on (built-ins + custom objects).
export async function getReportObjects(): Promise<{ key: string; label: string }[]> {
  await requireAccess("REPORTS", "VIEW")
  return listReportObjects()
}

// The full field list for an object (native + custom properties).
export async function getReportFields(objectKey: string): Promise<ReportField[]> {
  await requireAccess("REPORTS", "VIEW")
  await requireAccess(reportPermKey(objectKey), "VIEW")
  return reportFieldsFor(objectKey)
}

// The object's own fields + its joinable sources (with joined fields ready to add).
export async function getReportSchema(objectKey: string) {
  await requireAccess("REPORTS", "VIEW")
  await requireAccess(reportPermKey(objectKey), "VIEW")
  return reportSchema(objectKey)
}

// Run a report config and return its result (gated by view access to the object).
export async function runReportPreview(config: ReportConfig): Promise<ReportResult> {
  await requireAccess("REPORTS", "VIEW")
  await requireAccess(reportPermKey(config.primary), "VIEW")
  return runReport(config)
}

// The underlying records behind a chart bar / summarized row / pivot cell.
export async function drillIntoReport(config: ReportConfig, dimKey: string, breakdownKey?: string | null): Promise<ReportResult> {
  await requireAccess("REPORTS", "VIEW")
  await requireAccess(reportPermKey(config.primary), "VIEW")
  return drillReport(config, dimKey, breakdownKey)
}
