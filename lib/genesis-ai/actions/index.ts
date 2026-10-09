// Genesis AI actions: the propose_* tools, and running a proposal once its
// owner confirms it. Server only.
//
// A propose_* tool never changes data. It checks the person's access, validates
// the change, and stores it as a pending action shown as a card in the chat.
// Only confirmGenesisAction (app/actions/genesis-ai.ts) — a click by the same
// person, in their own request — runs it, through executeAction below.

import type Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import type { Viewer } from "../access"
import { FilterInput } from "../shared"
import { ActionError, type ActionCard, type ActionKind, type ExecResult, type Prepared } from "./types"
import { executeCreate, executeDelete, executeLink, executeNote, executeUpdate, prepareCreate, prepareDelete, prepareLink, prepareNote, prepareUpdate, MAX_DELETE, MAX_UPDATE } from "./records"
import { executeReport, executeSegment, executeView, prepareReport, prepareSegment, prepareView } from "./workspace"

// ── Definitions (sent to the model; fixed text only) ─────────────────────────

const OBJECT = { type: "string", description: "Object key from list_objects, e.g. \"TASK\", or \"CO:<key>\" for a custom object." }
const VALUES = { type: "array", items: { type: "string" }, description: "The value(s). One for most fields; several for a multi-select; [] clears the field. Options by label or value; dates yyyy-mm-dd; people by name or \"@me\"." }
const FIELD_VALUES = {
  type: "array",
  items: { type: "object", properties: { field: { type: "string" }, values: VALUES }, required: ["field", "values"], additionalProperties: false },
}
const SHARE = { type: "string", enum: ["private", "everyone"], description: "Who can see it. Default private." }
const FILTER_REF = {
  type: "object",
  description: "Same format as query_records' filter.",
  properties: {
    match: { type: "string", enum: ["all", "any"] },
    conditions: {
      type: "array",
      items: {
        type: "object",
        properties: { field: { type: "string" }, operator: { type: "string" }, values: { type: "array", items: { type: "string" } } },
        required: ["field", "operator", "values"],
        additionalProperties: false,
      },
    },
  },
  required: ["conditions"],
  additionalProperties: false,
}
const CONFIRM_NOTE = " Nothing changes until the person clicks Confirm on the card this creates."

export const ACTION_TOOL_DEFINITIONS: Anthropic.Messages.Tool[] = [
  {
    name: "propose_update_records",
    description: `Propose changing fields on up to ${MAX_UPDATE} records of one object — e.g. mark tasks complete (field "status", value "Completed"), change a status, owner ("owner"), stage ("stage"), date or any editable field. Field keys come from describe_object's editable_fields.${CONFIRM_NOTE}`,
    input_schema: {
      type: "object",
      properties: {
        object: OBJECT,
        record_ids: { type: "array", items: { type: "string" }, description: "Ids from query_records / find_records." },
        changes: { ...FIELD_VALUES, description: "Each field to change and its new value." },
      },
      required: ["object", "record_ids", "changes"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_create_record",
    description: `Propose creating one record. Field keys come from describe_object's editable_fields and create_picks. A task can be linked to a record as it's created with related_to.${CONFIRM_NOTE}`,
    input_schema: {
      type: "object",
      properties: {
        object: OBJECT,
        values: { ...FIELD_VALUES, description: "The new record's fields." },
        related_to: {
          type: "object",
          properties: { object: { type: "string" }, id: { type: "string" } },
          required: ["object", "id"],
          additionalProperties: false,
          description: "Tasks only: the record the task is about.",
        },
      },
      required: ["object", "values"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_add_note",
    description: `Propose adding a note to a record, or logging a call on it.${CONFIRM_NOTE}`,
    input_schema: {
      type: "object",
      properties: {
        object: OBJECT,
        record_id: { type: "string" },
        kind: { type: "string", enum: ["note", "call"] },
        body: { type: "string", description: "The note, or what was discussed on the call." },
        outcome: { type: "string", description: "Calls only, e.g. Connected, Left voicemail, No answer." },
      },
      required: ["object", "record_id", "kind", "body"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_delete_records",
    description: `Propose deleting up to ${MAX_DELETE} records of one object. Only when the person clearly asks to delete.${CONFIRM_NOTE}`,
    input_schema: {
      type: "object",
      properties: { object: OBJECT, record_ids: { type: "array", items: { type: "string" } } },
      required: ["object", "record_ids"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_link_records",
    description: `Propose linking two records (an association), e.g. a custom-object record to a referral.${CONFIRM_NOTE}`,
    input_schema: {
      type: "object",
      properties: { object: OBJECT, record_id: { type: "string" }, other_object: { type: "string" }, other_id: { type: "string" } },
      required: ["object", "record_id", "other_object", "other_id"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_create_segment",
    description: `Propose a segment (a named list of records). Active: defined by a filter and always up to date. Static: a fixed list — today's matches of a filter, or listed record ids.${CONFIRM_NOTE}`,
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        object: OBJECT,
        kind: { type: "string", enum: ["active", "static"] },
        filter: FILTER_REF,
        record_ids: { type: "array", items: { type: "string" }, description: "Static only: the records to list." },
        columns: { type: "array", items: { type: "string" }, description: "display_fields keys the segment's list shows." },
        share: SHARE,
      },
      required: ["name", "object", "kind"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_create_report",
    description: `Propose a saved report: a count/sum/average of an object, optionally grouped (and by date bucket), as a table or chart, optionally added to a dashboard by name. To limit it to some records, build an active segment first and pass segment_id, or use date_field + date_preset.${CONFIRM_NOTE}`,
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        object: OBJECT,
        measure: { type: "string", enum: ["count", "sum", "avg", "min", "max"] },
        measure_field: { type: "string", description: "A number display_fields key; required unless measure is count." },
        group_by: { type: "string", description: "A groupable display_fields key." },
        date_bucket: { type: "string", enum: ["day", "week", "month", "quarter", "year"] },
        breakdown_by: { type: "string", description: "A second groupable display_fields key." },
        chart: { type: "string", enum: ["table", "bar", "line", "pie", "kpi"] },
        segment_id: { type: "string", description: "Limit to an existing segment of the same object." },
        date_field: { type: "string", description: "A date display_fields key of the object, for date_preset." },
        date_preset: { type: "string", description: "A relative date preset key, e.g. this_year, last_30." },
        dashboard: { type: "string", description: "Name of one of the person's dashboards to add it to (created if it doesn't exist)." },
        share: SHARE,
      },
      required: ["name", "object", "measure", "chart"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_create_view",
    description: `Propose a saved list view (a tab on the object's list) with a filter. Available for referrals, surgery cases, tasks and custom objects; for other objects propose a segment instead.${CONFIRM_NOTE}`,
    input_schema: {
      type: "object",
      properties: { name: { type: "string" }, object: OBJECT, filter: FILTER_REF, share: SHARE },
      required: ["name", "object"],
      additionalProperties: false,
    },
  },
]

// ── Input validation ──────────────────────────────────────────────────────────

const FieldValues = z.array(z.object({ field: z.string().min(1), values: z.array(z.string().max(5000)).max(50) }).strict()).max(40)
const Share = z.enum(["private", "everyone"]).optional()

const ActionInputs = {
  propose_update_records: z.object({ object: z.string().min(1), record_ids: z.array(z.string().min(1)).min(1).max(100), changes: FieldValues.min(1) }).strict(),
  propose_create_record: z.object({ object: z.string().min(1), values: FieldValues, related_to: z.object({ object: z.string().min(1), id: z.string().min(1) }).strict().optional() }).strict(),
  propose_add_note: z.object({ object: z.string().min(1), record_id: z.string().min(1), kind: z.enum(["note", "call"]), body: z.string().min(1).max(10_000), outcome: z.string().max(100).optional() }).strict(),
  propose_delete_records: z.object({ object: z.string().min(1), record_ids: z.array(z.string().min(1)).min(1).max(100) }).strict(),
  propose_link_records: z.object({ object: z.string().min(1), record_id: z.string().min(1), other_object: z.string().min(1), other_id: z.string().min(1) }).strict(),
  propose_create_segment: z.object({
    name: z.string().min(1).max(200), object: z.string().min(1), kind: z.enum(["active", "static"]), filter: FilterInput.optional(),
    record_ids: z.array(z.string().min(1)).max(2000).optional(), columns: z.array(z.string()).max(60).optional(), share: Share,
  }).strict(),
  propose_create_report: z.object({
    name: z.string().min(1).max(200), object: z.string().min(1), measure: z.enum(["count", "sum", "avg", "min", "max"]),
    measure_field: z.string().optional(), group_by: z.string().optional(), date_bucket: z.enum(["day", "week", "month", "quarter", "year"]).optional(),
    breakdown_by: z.string().optional(), chart: z.enum(["table", "bar", "line", "pie", "kpi"]), segment_id: z.string().optional(),
    date_field: z.string().optional(), date_preset: z.string().optional(), dashboard: z.string().max(200).optional(), share: Share,
  }).strict(),
  propose_create_view: z.object({ name: z.string().min(1).max(200), object: z.string().min(1), filter: FilterInput.optional(), share: Share }).strict(),
} as const

export type ActionToolName = keyof typeof ActionInputs
export const ACTION_TOOL_NAMES = Object.keys(ActionInputs) as ActionToolName[]
export const isActionTool = (name: string): name is ActionToolName => name in ActionInputs

async function prepare(name: ActionToolName, input: any, me: Viewer): Promise<Prepared> {
  switch (name) {
    case "propose_update_records": return prepareUpdate(me, input)
    case "propose_create_record": return prepareCreate(me, input)
    case "propose_add_note": return prepareNote(me, input)
    case "propose_delete_records": return prepareDelete(me, input)
    case "propose_link_records": return prepareLink(me, input)
    case "propose_create_segment": return prepareSegment(me, input)
    case "propose_create_report": return prepareReport(me, input)
    case "propose_create_view": return prepareView(me, input)
  }
}

export interface ProposeOutcome {
  content: string
  isError?: boolean
  status: string
  objects: string[]
  recordIds: string[]
  /** The card to show (when a proposal was made). */
  action?: { id: string; card: ActionCard }
}

/**
 * Run a propose_* tool: validate, check access, store the proposal. Never
 * throws and never writes anything but the pending action.
 */
export async function proposeAction(name: string, rawInput: unknown, me: Viewer, ctx: { conversationId: string; toolUseId: string }): Promise<ProposeOutcome> {
  const fail = (content: string): ProposeOutcome => ({ content, isError: true, status: "Couldn't prepare that change", objects: [], recordIds: [] })
  if (!isActionTool(name)) return fail(`Unknown tool "${name}".`)
  const parsed = (ActionInputs[name] as z.ZodTypeAny).safeParse(rawInput ?? {})
  if (!parsed.success) {
    // Paths only — zod's messages echo the values it rejected.
    return fail(`Invalid input for ${name} at: ${parsed.error.issues.map((i) => i.path.join(".") || "(input)").join(", ")}.`)
  }
  let prepared: Prepared
  try {
    prepared = await prepare(name, parsed.data, me)
  } catch (e) {
    if (e instanceof ActionError) return fail(e.message)
    return fail(`${name} failed on the server. Try again, or make the change in the CRM.`)
  }
  const row = await prisma.aiPendingAction.create({
    data: {
      userId: me.id, conversationId: ctx.conversationId, toolUseId: ctx.toolUseId,
      kind: prepared.kind, payload: prepared.payload as any, card: prepared.card as any,
    },
    select: { id: true },
  })
  return {
    content: JSON.stringify({
      status: "awaiting_confirmation",
      action_id: row.id,
      summary: prepared.card.title,
      note: "Not done yet. The person sees a card with Confirm and Cancel; tell them briefly what you prepared and to confirm it there. Don't say it's done.",
    }),
    status: `Prepared: ${prepared.card.title}`,
    objects: prepared.objects,
    recordIds: [],
    action: { id: row.id, card: prepared.card },
  }
}

/** Run a confirmed proposal as `me` (the person's current session). */
export async function executeAction(kind: ActionKind, payload: any, me: Viewer): Promise<ExecResult> {
  switch (kind) {
    case "update_records": return executeUpdate(me, payload)
    case "create_record": return executeCreate(me, payload)
    case "add_note": return executeNote(me, payload)
    case "delete_records": return executeDelete(me, payload)
    case "link_records": return executeLink(me, payload)
    case "create_segment": return executeSegment(me, payload)
    case "create_report": return executeReport(me, payload)
    case "create_view": return executeView(me, payload)
  }
}
