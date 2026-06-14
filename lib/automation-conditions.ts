// Pure condition/branch evaluation for automations.
// No DB / Twilio / mail imports — safe to unit-test in isolation.

// Permissive referral shape: the engine passes the raw Prisma referral, which
// carries every scalar column plus customProperties (Json) and tags.
export interface ReferralForConditions {
  id?: string
  status: string
  tags?: { tagId: string }[]
  customProperties?: unknown
  [key: string]: unknown
}

export interface Condition {
  field: string        // property id (e.g. "status", "custom:abc123")
  op: string
  value: string
  path?: string        // how to read the value off the referral (defaults via legacy map)
  type?: string        // "text" | "number" | "date" | "boolean" | "select" | "tag"
}

// One AND-group; multiple groups are OR-ed together (HubSpot-style).
export interface ConditionGroup {
  id: string
  conditions: Condition[]
}

export interface FlowAction {
  type: string
  config: Record<string, unknown>
}

export interface AutomationFlow {
  match?: "all" | "any"
  rules?: Condition[]
  groups?: ConditionGroup[]
  then?: FlowAction[]
  else?: FlowAction[]
}

// Legacy field ids (stored before path/type were added) → accessor + type.
const LEGACY_PATH: Record<string, string> = {
  practiceId: "referringPracticeId",
  locationId: "referringLocationId",
  assignedToId: "assignedToId",
  status: "status",
  insuranceProvider: "insuranceProvider",
  tagId: "tags",
}
const LEGACY_TYPE: Record<string, string> = {
  practiceId: "select",
  locationId: "select",
  assignedToId: "select",
  status: "select",
  insuranceProvider: "text",
  tagId: "tag",
}

function resolveRaw(referral: ReferralForConditions, path: string): unknown {
  if (path.startsWith("custom:")) {
    const cp = referral.customProperties
    if (cp && typeof cp === "object") return (cp as Record<string, unknown>)[path.slice(7)]
    return undefined
  }
  return referral[path]
}

function toMillis(v: unknown): number | null {
  if (v == null) return null
  const d = v instanceof Date ? v : new Date(String(v))
  const t = d.getTime()
  return isNaN(t) ? null : t
}

// Evaluate a single condition against a referral.
export function evaluateRule(referral: ReferralForConditions, cond: Condition): boolean {
  const type = cond.type ?? LEGACY_TYPE[cond.field] ?? "text"
  const path = cond.path ?? LEGACY_PATH[cond.field] ?? cond.field
  const condVal = cond.value ?? ""

  // ── Tags ───────────────────────────────────────────────
  if (type === "tag") {
    const has = (referral.tags ?? []).some(t => t.tagId === condVal)
    if (cond.op === "has") return has
    if (cond.op === "not_has") return !has
    return true
  }

  const raw = resolveRaw(referral, path)
  const isEmpty = raw == null || raw === "" || (Array.isArray(raw) && raw.length === 0)

  // ── Presence operators (all types) ─────────────────────
  if (cond.op === "empty" || cond.op === "unassigned") return isEmpty
  if (cond.op === "not_empty") return !isEmpty

  // ── Boolean ────────────────────────────────────────────
  if (type === "boolean") {
    const truthy = raw === true || raw === "true" || raw === 1 || raw === "1"
    if (cond.op === "is_true") return truthy
    if (cond.op === "is_false") return !truthy
    return true
  }

  // ── Number ─────────────────────────────────────────────
  if (type === "number") {
    const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""))
    const target = parseFloat(condVal)
    if (isNaN(n) || isNaN(target)) return false
    if (cond.op === "eq") return n === target
    if (cond.op === "ne") return n !== target
    if (cond.op === "gt") return n > target
    if (cond.op === "lt") return n < target
    return true
  }

  // ── Date ───────────────────────────────────────────────
  if (type === "date") {
    const ms = toMillis(raw)
    if (ms == null) return false
    if (cond.op === "before") { const t = toMillis(condVal); return t != null && ms < t }
    if (cond.op === "after")  { const t = toMillis(condVal); return t != null && ms > t }
    if (cond.op === "days_ago_lt") { const days = parseFloat(condVal); return !isNaN(days) && ms >= Date.now() - days * 86400000 }
    if (cond.op === "days_ago_gt") { const days = parseFloat(condVal); return !isNaN(days) && ms < Date.now() - days * 86400000 }
    return true
  }

  // ── Select (single or multi value) ─────────────────────
  if (type === "select") {
    const wanted = condVal.split(",").map(s => s.trim()).filter(Boolean)
    const actual = Array.isArray(raw) ? raw.map(String) : [String(raw ?? "")]
    const intersects = wanted.some(w => actual.includes(w))
    if (cond.op === "eq") return intersects        // is any of
    if (cond.op === "ne") return !intersects       // is none of
    return true
  }

  // ── Text (default) ─────────────────────────────────────
  const text = String(raw ?? "").toLowerCase()
  const needle = condVal.toLowerCase()
  if (cond.op === "contains") return text.includes(needle)
  if (cond.op === "not_contains") return !text.includes(needle)
  if (cond.op === "eq") return text === needle
  if (cond.op === "ne") return text !== needle
  return true
}

// AND within a group.
function groupPasses(referral: ReferralForConditions, group: ConditionGroup): boolean {
  if (!group.conditions || group.conditions.length === 0) return true
  return group.conditions.every(c => evaluateRule(referral, c))
}

// OR between groups (no groups → passes).
export function evaluateGroups(referral: ReferralForConditions, groups: ConditionGroup[] | undefined | null): boolean {
  if (!groups || groups.length === 0) return true
  return groups.some(g => groupPasses(referral, g))
}

// Whether the referral passes the flow's condition group (legacy + groups).
export function flowConditionPasses(referral: ReferralForConditions, flow: AutomationFlow): boolean {
  if (flow.groups && flow.groups.length) return evaluateGroups(referral, flow.groups)
  const rules = flow.rules ?? []
  if (rules.length === 0) return true
  return flow.match === "any"
    ? rules.some(c => evaluateRule(referral, c))
    : rules.every(c => evaluateRule(referral, c))
}

// Which action list should run for this referral (the THEN or ELSE branch).
export function selectBranch(referral: ReferralForConditions, flow: AutomationFlow): FlowAction[] {
  return flowConditionPasses(referral, flow) ? (flow.then ?? []) : (flow.else ?? [])
}
