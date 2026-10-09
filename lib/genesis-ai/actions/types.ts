// Shared shapes for Genesis AI actions (lib/genesis-ai/actions/*).

/** A proposal not confirmed within this long can't be confirmed any more. */
export const ACTION_TTL_MS = 30 * 60 * 1000

/** What a stored proposal looks like to the chat window. */
export interface ActionView {
  id: string
  card: ActionCard
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED" | "CANCELLED" | "EXPIRED"
  result?: { message: string; link?: string | null } | null
}

export type ActionKind =
  | "update_records" | "create_record" | "add_note" | "delete_records" | "link_records"
  | "create_segment" | "create_report" | "create_view"

/** What the person sees before confirming. */
export interface ActionCard {
  title: string
  lines: string[]
  /** Consequences beyond the change itself (patient messages, can't be undone). */
  warnings: string[]
  /** A destructive change: the card is red. */
  danger?: boolean
}

export interface Prepared<P = any> {
  kind: ActionKind
  payload: P
  card: ActionCard
  /** Objects touched, for the audit log. */
  objects: string[]
}

export interface ExecResult {
  ok: boolean
  message: string
  link?: string | null
  recordIds?: string[]
}

/** A refusal or bad input, worded for the model to relay to the person. */
export class ActionError extends Error {}
