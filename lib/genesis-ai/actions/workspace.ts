// Workspace items Genesis AI can propose: segments, saved reports (optionally on
// a dashboard) and saved list views. Server only.
//
// The CRM's create actions for these check only that someone is signed in — the
// pages hold the real rule — so the gates in ./gates run at both steps here.

import { prisma } from "@/lib/prisma"
import { describeFilter } from "@/lib/object-fields"
import { emptyFilter, type FilterState } from "@/lib/filters"
import { countObjectMatches } from "@/lib/object-query"
import { runReport } from "@/lib/reporting/query"
import type { ReportConfig } from "@/lib/reporting/types"
import { defaultViewConfig } from "@/lib/object-views"
import { delegateFor, isCustomObject } from "@/lib/automation-records"
import { myTeamIds } from "@/lib/share-access"
import { allowedColumns, allowedFilterDefs, RELATION_TARGET, type Viewer } from "../access"
import { FilterInput, groupableKeys, PRESETS, resolveObject, toFilterState } from "../shared"
import { ActionError, type ExecResult, type Prepared } from "./types"
import { canCreateReport, canCreateSegment, canCreateView, refusal } from "./gates"
import { addToSegment, createSegment, setSegmentColumns } from "@/app/actions/segments"
import { createSavedReport } from "@/app/actions/saved-reports"
import { addReportToDashboard, createDashboard } from "@/app/actions/dashboards"
import { createReferralView } from "@/app/actions/referral-views"
import { createSurgeryView } from "@/app/actions/surgery-views"
import { createTaskView } from "@/app/actions/task-views"
import { createCustomObjectView } from "@/app/actions/custom-object-views"
import type { z } from "zod"

type Share = "private" | "everyone"
const access = (share: Share) => ({ visibility: share === "everyone" ? ("EVERYONE" as const) : ("PRIVATE" as const) })
const shareLine = (share: Share) => `Shared with: ${share === "everyone" ? "everyone" : "only you"}`
const cleanName = (raw: string) => {
  const n = raw.trim().replace(/\s+/g, " ").slice(0, 120)
  if (!n) throw new ActionError("Give it a name.")
  return n
}
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`

// ── Segments ──────────────────────────────────────────────────────────────────

export interface SegmentPayload {
  object: string; label: string; name: string; kind: "ACTIVE" | "STATIC"
  filter: FilterState | null; recordIds: string[]; columns: string[]; share: Share
}

export async function prepareSegment(me: Viewer, input: {
  name: string; object: string; kind: "active" | "static"; filter?: z.infer<typeof FilterInput>; record_ids?: string[]; columns?: string[]; share?: Share
}): Promise<Prepared<SegmentPayload>> {
  const obj = await resolveObject(me, input.object)
  if (!canCreateSegment(me, obj.key)) throw new ActionError(refusal(me, "create segments of", obj.label))
  const name = cleanName(input.name)
  const defs = await allowedFilterDefs(me, obj.key)
  const filter = toFilterState(input.filter, defs, me)
  const ids = Array.from(new Set(input.record_ids ?? []))
  const kind = input.kind === "static" ? "STATIC" : "ACTIVE"
  if (kind === "ACTIVE" && !filter) throw new ActionError("An active segment needs a filter — it keeps itself up to date with whatever matches.")
  if (kind === "STATIC" && !filter && !ids.length) throw new ActionError("A static segment needs a filter (to take today's matches) or a list of records.")
  if (ids.length > 1000) throw new ActionError("At most 1,000 listed records; use a filter instead.")
  if (ids.length) {
    // Every listed record must exist (as this object — custom objects are scoped).
    const model = delegateFor(obj.key)
    const where = isCustomObject(obj.key) ? { id: { in: ids }, objectDef: { key: obj.key.slice(3) } } : { id: { in: ids } }
    const found = model ? await model.count({ where }) : 0
    if (found !== ids.length) throw new ActionError(`${ids.length - found} of the listed records don't exist as ${obj.label}. Look them up again.`)
  }
  const cols = await allowedColumns(me, obj.key)
  const columns = (input.columns ?? []).map((k) => {
    const c = cols.find((x) => x.key === k)
    if (!c) throw new ActionError(`Unknown or unavailable column "${k}". Use display_fields keys from describe_object.`)
    return c
  })
  if (columns.length > 30) throw new ActionError("At most 30 columns.")
  const size = ids.length ? ids.length : (await countObjectMatches(obj.key, filter, { defs })).total
  const share: Share = input.share === "everyone" ? "everyone" : "private"
  return {
    kind: "create_segment",
    payload: { object: obj.key, label: obj.label, name, kind, filter, recordIds: ids, columns: columns.map((c) => c.key), share },
    card: {
      title: `Create segment “${name}”`,
      lines: [
        `${obj.label} · ${kind === "ACTIVE" ? "Active — updates as records change" : "Static — a fixed list"}`,
        ...(filter ? [`Filter: ${describeFilter(filter, defs)}`] : []),
        `${ids.length ? "Records" : "Matches now"}: ${plural(size, "record")}`,
        ...(columns.length ? [`Columns: ${columns.map((c) => c.label).join(", ")}`] : []),
        shareLine(share),
      ],
      warnings: [],
    },
    objects: [obj.key],
  }
}

export async function executeSegment(me: Viewer, p: SegmentPayload): Promise<ExecResult> {
  if (!canCreateSegment(me, p.object)) return { ok: false, message: refusal(me, "create segments of", p.label) }
  try {
    const res: any = await createSegment({
      name: p.name, objectType: p.object, kind: p.kind,
      source: p.recordIds.length ? "MANUAL" : "FILTER",
      filter: p.filter, access: access(p.share),
    })
    if (res?.error || !res?.id) return { ok: false, message: res?.error ?? "The segment couldn't be created." }
    if (p.recordIds.length) {
      const added: any = await addToSegment(res.id, p.recordIds)
      if (added?.error) return { ok: false, message: `Created, but the records couldn't be added: ${added.error}`, link: `/segments/${res.id}` }
    }
    if (p.columns.length) await setSegmentColumns(res.id, p.columns)
    return { ok: true, message: `Created the segment “${p.name}”.`, link: `/segments/${res.id}` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "The segment couldn't be created." }
  }
}

// ── Reports ───────────────────────────────────────────────────────────────────

const VIZ: Record<string, ReportConfig["viz"]> = { table: "table", bar: "vbar", line: "line", pie: "pie", kpi: "kpi" }
const AGG_LABEL: Record<string, string> = { count: "Count", sum: "Sum", avg: "Average", min: "Minimum", max: "Maximum" }

export interface ReportPayload {
  label: string; name: string; config: ReportConfig; objects: string[]; share: Share
  dashboard: { id: string; name: string } | { newName: string } | null
}

/** A segment this person can see (the segments page's sharing rule). */
async function visibleSegment(me: Viewer, id: string) {
  const teams = await myTeamIds(me.id)
  return prisma.segment.findFirst({
    where: {
      id,
      OR: [
        { userId: me.id }, { visibility: "EVERYONE" },
        { visibility: "TEAM", teamId: { in: teams } },
        { visibility: "CUSTOM", sharedUserIds: { has: me.id } },
      ],
    },
    select: { id: true, name: true, objectType: true },
  })
}

export async function prepareReport(me: Viewer, input: {
  name: string; object: string; measure: "count" | "sum" | "avg" | "min" | "max"; measure_field?: string
  group_by?: string; date_bucket?: "day" | "week" | "month" | "quarter" | "year"; breakdown_by?: string
  chart: "table" | "bar" | "line" | "pie" | "kpi"; segment_id?: string; date_field?: string; date_preset?: string
  dashboard?: string; share?: Share
}): Promise<Prepared<ReportPayload>> {
  const obj = await resolveObject(me, input.object)
  // Reports at all first; the objects a grouping joins in are checked below.
  if (!canCreateReport(me, [obj.key])) throw new ActionError(refusal(me, "create reports on", obj.label))
  const name = cleanName(input.name)
  const [cols, groupable] = await Promise.all([allowedColumns(me, obj.key), groupableKeys(obj.key)])
  const col = (key: string | undefined, what: string) => {
    if (!key) return null
    const c = cols.find((x) => x.key === key)
    if (!c) throw new ActionError(`Unknown or unavailable ${what} "${key}". Use display_fields keys from describe_object.`)
    return c
  }
  const g = col(input.group_by, "group_by field")
  const b = col(input.breakdown_by, "breakdown field")
  for (const c of [g, b]) if (c && !groupable.has(c.key)) throw new ActionError(`"${c.label}" can't be grouped.`)
  if (input.date_bucket && g?.type !== "date") throw new ActionError("date_bucket needs group_by to be a date field.")
  if ((input.chart === "bar" || input.chart === "line" || input.chart === "pie") && !g) throw new ActionError(`A ${input.chart} chart needs group_by.`)
  if (input.chart === "kpi" && (g || b)) throw new ActionError("A KPI shows one number — drop group_by.")
  const m = input.measure === "count" ? null : col(input.measure_field, "measure field")
  if (input.measure !== "count" && (!m || m.type !== "number" || m.joinPath)) throw new ActionError(`${input.measure} needs a number field of ${obj.label}.`)

  const sources = [g, b].filter((c): c is NonNullable<typeof c> => !!c?.joinPath && RELATION_TARGET[c.joinPath!] !== "USER")
    .map((c) => ({ objectKey: RELATION_TARGET[c.joinPath!], joinPath: c.joinPath! }))
    .filter((s, i, all) => all.findIndex((x) => x.joinPath === s.joinPath) === i)
  const objects = [obj.key, ...sources.map((s) => s.objectKey)]
  if (!canCreateReport(me, objects)) throw new ActionError(refusal(me, "create reports on", obj.label))

  let segmentId: string | null = null
  let recordsLine = `Records: all ${obj.label.toLowerCase()}`
  if (input.segment_id) {
    const seg = await visibleSegment(me, input.segment_id)
    if (!seg || seg.objectType !== obj.key) throw new ActionError(`No segment of ${obj.label} with id ${input.segment_id} that you can see. Create one first with propose_create_segment.`)
    segmentId = seg.id
    recordsLine = `Records: segment “${seg.name}”`
  }
  let dateRange: ReportConfig["dateRange"] = null
  if (input.date_field || input.date_preset) {
    const d = col(input.date_field, "date field")
    if (!d || d.type !== "date" || d.joinPath) throw new ActionError("date_field must be a date field of the object itself.")
    if (!input.date_preset || !PRESETS.has(input.date_preset)) throw new ActionError(`date_preset must be one of: ${Array.from(PRESETS).join(", ")}.`)
    dateRange = { field: d.key, preset: input.date_preset }
    recordsLine += ` · ${d.label} in ${input.date_preset.replace(/_/g, " ")}`
  }

  const ref = (c: NonNullable<typeof g>) => ({ source: c.joinPath && RELATION_TARGET[c.joinPath] !== "USER" ? c.joinPath : obj.key, key: c.key })
  const config: ReportConfig = {
    primary: obj.key,
    sources,
    viz: VIZ[input.chart] ?? "table",
    columns: [],
    measures: [{ source: obj.key, key: m ? m.key : "*", agg: input.measure }],
    dimensions: g ? [{ ...ref(g), ...(input.date_bucket ? { dateFrequency: input.date_bucket } : {}) }] : [],
    breakdown: b ? ref(b) : null,
    filters: null,
    segmentId,
    sort: { by: "value", dir: "desc" },
    limit: null,
    tableMode: "summarized",
    dateRange,
  }
  // Run it once: an invalid config fails here, and the card can show the size.
  const preview = await runReport(config)

  let dashboard: ReportPayload["dashboard"] = null
  if (input.dashboard?.trim()) {
    const wanted = input.dashboard.trim().slice(0, 120)
    const own = await prisma.dashboard.findFirst({ where: { createdById: me.id, name: { equals: wanted, mode: "insensitive" } }, select: { id: true, name: true } })
    dashboard = own ?? { newName: wanted }
  }
  const share: Share = input.share === "everyone" ? "everyone" : "private"
  const what = `${AGG_LABEL[input.measure]}${m ? ` of ${m.label}` : ""} of ${obj.label}${g ? ` by ${g.label}${input.date_bucket ? ` (${input.date_bucket})` : ""}` : ""}${b ? `, split by ${b.label}` : ""}`
  return {
    kind: "create_report",
    payload: { label: obj.label, name, config, objects, share, dashboard },
    card: {
      title: `Create report “${name}”`,
      lines: [
        what,
        `Chart: ${input.chart}`,
        recordsLine,
        `Right now: ${plural(preview.total, "record")}${g ? ` in ${plural(preview.rows.length, "group")}` : ""}${preview.capped ? " (large — the report reads the first 10,000)" : ""}`,
        ...(dashboard ? [`Add to dashboard: ${"id" in dashboard ? dashboard.name : `${dashboard.newName} (new)`}`] : []),
        shareLine(share),
      ],
      warnings: [],
    },
    objects,
  }
}

export async function executeReport(me: Viewer, p: ReportPayload): Promise<ExecResult> {
  if (!canCreateReport(me, p.objects)) return { ok: false, message: refusal(me, "create reports on", p.label) }
  try {
    // Saved as a v2 config, as the report builder saves it.
    const { id } = await createSavedReport(p.name, { v: 2, ...p.config } as any, access(p.share))
    if (p.dashboard) {
      const dashId = "id" in p.dashboard ? p.dashboard.id : (await createDashboard(p.dashboard.newName)).id
      await addReportToDashboard(dashId, id)
      return { ok: true, message: `Created the report “${p.name}” and added it to the dashboard.`, link: `/reports/view/${id}` }
    }
    return { ok: true, message: `Created the report “${p.name}”.`, link: `/reports/view/${id}` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "The report couldn't be created." }
  }
}

// ── Saved list views ──────────────────────────────────────────────────────────

/** Views whose list can hold a filter and reopen it. */
const VIEW_OBJECTS = new Set(["REFERRAL", "SURGERY", "TASK"])

export interface ViewPayload { object: string; label: string; name: string; filter: FilterState | null; share: Share }

export async function prepareView(me: Viewer, input: { name: string; object: string; filter?: z.infer<typeof FilterInput>; share?: Share }): Promise<Prepared<ViewPayload>> {
  const obj = await resolveObject(me, input.object)
  if (!VIEW_OBJECTS.has(obj.key) && !isCustomObject(obj.key)) {
    throw new ActionError(`Saved views of ${obj.label} can't hold a filter. A segment can — offer propose_create_segment instead.`)
  }
  if (!canCreateView(me, obj.key)) throw new ActionError(refusal(me, "view", obj.label))
  const name = cleanName(input.name)
  const defs = await allowedFilterDefs(me, obj.key)
  const filter = toFilterState(input.filter, defs, me)
  const size = (await countObjectMatches(obj.key, filter, { defs })).total
  const share: Share = input.share === "everyone" ? "everyone" : "private"
  return {
    kind: "create_view",
    payload: { object: obj.key, label: obj.label, name, filter, share },
    card: {
      title: `Create view “${name}”`,
      lines: [`${obj.label} list`, `Filter: ${describeFilter(filter, defs)}`, `Matches now: ${plural(size, "record")}`, shareLine(share)],
      warnings: [],
    },
    objects: [obj.key],
  }
}

export async function executeView(me: Viewer, p: ViewPayload): Promise<ExecResult> {
  if (!canCreateView(me, p.object)) return { ok: false, message: refusal(me, "view", p.label) }
  const query = p.filter ? `filter=${encodeURIComponent(JSON.stringify(p.filter))}` : ""
  try {
    // Columns are left to each list's defaults (an absent list falls back to them).
    if (p.object === "REFERRAL") {
      const r: any = await createReferralView(p.name, { query } as any, access(p.share))
      if (r?.error) return { ok: false, message: r.error }
      return { ok: true, message: `Created the view “${p.name}”.`, link: `/referrals${query ? `?${query}` : ""}` }
    }
    if (p.object === "SURGERY") {
      const r: any = await createSurgeryView(p.name, { query, viewMode: "table" } as any, access(p.share))
      if (r?.error) return { ok: false, message: r.error }
      return { ok: true, message: `Created the view “${p.name}”.`, link: `/surgery${query ? `?${query}` : ""}` }
    }
    if (p.object === "TASK") {
      const r: any = await createTaskView(p.name, { filter: p.filter ?? emptyFilter() } as any, access(p.share))
      if (r?.error) return { ok: false, message: r.error }
      return { ok: true, message: `Created the view “${p.name}” — open it from the tabs on Tasks.`, link: "/tasks" }
    }
    const key = p.object.slice(3)
    const r: any = await createCustomObjectView(key, p.name, { ...defaultViewConfig([]), filter: p.filter ?? emptyFilter() } as any, access(p.share))
    if (r?.error || !r?.id) return { ok: false, message: r?.error ?? "The view couldn't be created." }
    return { ok: true, message: `Created the view “${p.name}”.`, link: `/objects/${key}?viewId=${r.id}` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "The view couldn't be created." }
  }
}
