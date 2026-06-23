// Pure node-graph model for the visual automation builder.
// No DB / mail / Twilio imports — safe to unit-test in isolation.
import {
  evaluateRule, evaluateGroups, type Condition, type ConditionGroup,
  type ReferralForConditions, type FlowAction, type AutomationFlow,
} from "./automation-conditions"
import { CLINIC_TZ, zonedParts, zonedWallToUtc } from "./tz"

let _idSeq = 0
export function newNodeId(): string {
  _idSeq += 1
  return `n${Date.now().toString(36)}_${_idSeq}_${Math.random().toString(36).slice(2, 6)}`
}

// One arm of a multi-way branch: first arm whose rules pass wins.
export interface BranchArm {
  id: string
  label: string
  match: "all" | "any"
  rules: Condition[]
  groups?: ConditionGroup[]   // OR-of-AND criteria (takes precedence over rules)
  next: string | null
}

export type DelayUnit = "minutes" | "hours" | "days"

// What a Delay step is based on (HubSpot-style). Absent = legacy "duration".
export type DelayMode = "duration" | "calendar" | "property" | "dayOfWeek" | "timeOfDay"

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

// A node is a single action, a delay, an if/else branch, or a multi-way branch.
export type GraphNode =
  | {
      id: string
      kind: "action"
      actionType: string
      config: Record<string, unknown>
      next: string | null
    }
  | {
      id: string
      kind: "delay"
      mode?: DelayMode              // absent = "duration" (legacy nodes)
      // duration: pause for a set amount of time
      amount?: number
      unit?: DelayUnit
      // calendar: pause until a fixed calendar date/time
      datetime?: string | null
      // property: pause until a date property on the record (± offset)
      field?: string | null
      offsetAmount?: number
      offsetUnit?: DelayUnit
      direction?: "before" | "after"
      // dayOfWeek: pause until the next given weekday (0=Sun … 6=Sat)
      weekday?: number
      // timeOfDay: pause until the next occurrence of a time of day ("HH:MM")
      timeOfDay?: string
      next: string | null
    }
  | {
      id: string
      kind: "waitUntil"
      mode: "field" | "fixed"
      field: string | null          // record date property (field mode)
      offsetAmount: number          // offset before/after the field date
      offsetUnit: DelayUnit
      direction: "before" | "after"
      datetime: string | null       // fixed ISO datetime (fixed mode)
      next: string | null
    }
  | {
      id: string
      kind: "branch"
      match: "all" | "any"
      rules: Condition[]
      groups?: ConditionGroup[]   // OR-of-AND criteria (takes precedence over rules)
      thenNext: string | null
      elseNext: string | null
    }
  | {
      id: string
      kind: "multi"
      arms: BranchArm[]
      elseNext: string | null
    }

export function delayMs(amount: number, unit: DelayUnit): number {
  const per = unit === "minutes" ? 60_000 : unit === "hours" ? 3_600_000 : 86_400_000
  return Math.max(0, amount) * per
}

export interface AutomationGraph {
  rootId: string | null
  nodes: Record<string, GraphNode>
}

export function branchPasses(referral: ReferralForConditions, match: "all" | "any", rules: Condition[]): boolean {
  if (!rules || rules.length === 0) return true
  return match === "any"
    ? rules.some(r => evaluateRule(referral, r))
    : rules.every(r => evaluateRule(referral, r))
}

// Criteria pass for a branch/arm: prefer OR-of-AND groups, fall back to rules+match.
function criteriaPass(
  referral: ReferralForConditions,
  c: { groups?: ConditionGroup[]; match: "all" | "any"; rules: Condition[] },
): boolean {
  if (c.groups && c.groups.length) return evaluateGroups(referral, c.groups)
  return branchPasses(referral, c.match, c.rules)
}

// Walk the graph from the root, following branches based on the referral, and
// return the actions to execute in order. Pure: branch decisions depend only on
// the (static) referral snapshot. Guards against cycles via a visited set.
export function resolveGraphActions(
  graph: AutomationGraph,
  referral: ReferralForConditions | null,
): FlowAction[] {
  const out: FlowAction[] = []
  const visited = new Set<string>()
  let currentId = graph.rootId

  while (currentId) {
    if (visited.has(currentId)) break // cycle guard
    visited.add(currentId)

    const node = graph.nodes[currentId]
    if (!node) break

    if (node.kind === "action") {
      out.push({ type: node.actionType, config: node.config ?? {} })
      currentId = node.next
    } else if (node.kind === "delay" || node.kind === "waitUntil") {
      currentId = node.next // flat resolver ignores waits; walkGraph handles pausing
    } else if (node.kind === "branch") {
      // branch: with no referral context, conditions can't be evaluated → ELSE path
      const passed = referral ? criteriaPass(referral, node) : false
      currentId = passed ? node.thenNext : node.elseNext
    } else {
      // multi-way branch: first arm whose criteria pass wins; otherwise ELSE path
      const arm = referral ? node.arms.find(a => criteriaPass(referral, a)) : undefined
      currentId = arm ? arm.next : node.elseNext
    }
  }

  return out
}

// A send-time schedule (used by the waitUntil node and by per-action "when to
// send" config). mode "immediate" (or absent) = no wait.
export interface ScheduleConfig {
  mode?: "immediate" | "fixed" | "field"
  datetime?: string | null
  field?: string | null
  offsetAmount?: number
  offsetUnit?: DelayUnit
  direction?: "before" | "after"
}

// Resolve a schedule to an absolute time (or null = run now: immediate, empty
// field, or unparseable).
export function computeScheduleTime(cfg: ScheduleConfig, referral: ReferralForConditions | null): Date | null {
  if (!cfg || !cfg.mode || cfg.mode === "immediate") return null
  let base: number | null = null
  if (cfg.mode === "fixed") {
    base = cfg.datetime ? new Date(cfg.datetime).getTime() : null
  } else if (cfg.field && referral) {
    const raw = (referral as Record<string, unknown>)[cfg.field]
    const t = raw ? new Date(raw as string).getTime() : NaN
    if (!isNaN(t)) {
      const off = delayMs(cfg.offsetAmount ?? 0, cfg.offsetUnit ?? "days")
      base = cfg.direction === "after" ? t + off : t - off
    }
  }
  if (base == null || isNaN(base)) return null
  return new Date(base)
}

function waitUntilTime(node: Extract<GraphNode, { kind: "waitUntil" }>, referral: ReferralForConditions | null): Date | null {
  return computeScheduleTime(node, referral)
}

const DAY_MS = 86_400_000

// Next future occurrence of a weekday (0=Sun … 6=Sat), at start of that day in CLINIC_TZ.
function nextWeekday(from: Date, weekday: number): Date {
  const p = zonedParts(from, CLINIC_TZ)
  const curDow = new Date(Date.UTC(p.year, p.month, p.day)).getUTCDay()
  let diff = (weekday - curDow + 7) % 7
  if (diff === 0) diff = 7 // always advance to the next occurrence
  const t = new Date(Date.UTC(p.year, p.month, p.day) + diff * DAY_MS)
  return zonedWallToUtc(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), 0, 0, CLINIC_TZ)
}

// Next future occurrence of a time of day ("HH:MM") in CLINIC_TZ: today if still ahead, else tomorrow.
function nextTimeOfDay(from: Date, hhmm: string): Date {
  const [h, mi] = (hhmm || "09:00").split(":").map(Number)
  const p = zonedParts(from, CLINIC_TZ)
  let cand = zonedWallToUtc(p.year, p.month, p.day, h || 0, mi || 0, CLINIC_TZ)
  if (cand.getTime() <= from.getTime()) {
    const next = new Date(Date.UTC(p.year, p.month, p.day) + DAY_MS)
    cand = zonedWallToUtc(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate(), h || 0, mi || 0, CLINIC_TZ)
  }
  return cand
}

// Resolve a Delay node to an absolute resume time (or null = can't compute, skip wait).
export function delayResumeTime(
  node: Extract<GraphNode, { kind: "delay" }>,
  referral: ReferralForConditions | null,
  now: Date = new Date(),
): Date | null {
  const mode = node.mode ?? "duration"
  switch (mode) {
    case "duration":
      return new Date(now.getTime() + delayMs(node.amount ?? 1, node.unit ?? "days"))
    case "calendar":
      return node.datetime ? new Date(node.datetime) : null
    case "property":
      return computeScheduleTime(
        { mode: "field", field: node.field, offsetAmount: node.offsetAmount, offsetUnit: node.offsetUnit, direction: node.direction },
        referral,
      )
    case "dayOfWeek":
      return nextWeekday(now, node.weekday ?? 1)
    case "timeOfDay":
      return nextTimeOfDay(now, node.timeOfDay ?? "09:00")
    default:
      return null
  }
}

// Schedule attached to an action's config under `schedule`.
function actionScheduleTime(config: Record<string, unknown>, referral: ReferralForConditions | null): Date | null {
  const sched = config?.schedule as ScheduleConfig | undefined
  return sched ? computeScheduleTime(sched, referral) : null
}

// Format an instant in the clinic's wall clock (Central Time) for labels.
export function fmtClinic(d: Date): string {
  return d.toLocaleString("en-US", {
    timeZone: CLINIC_TZ, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  }) + " CT"
}

export function waitLabel(node: Extract<GraphNode, { kind: "delay" | "waitUntil" }>, fieldLabels?: Record<string, string>): string {
  const fldLabel = (f: string | null | undefined) => (fieldLabels && f && fieldLabels[f]) || f || "date"
  if (node.kind === "delay") {
    const mode = node.mode ?? "duration"
    if (mode === "duration") return `Wait ${node.amount ?? 1} ${node.unit ?? "days"}`
    if (mode === "calendar") return node.datetime ? `Wait until ${fmtClinic(new Date(node.datetime))}` : "Wait until a date"
    if (mode === "property") return `Wait until ${node.offsetAmount ?? 0} ${node.offsetUnit ?? "days"} ${node.direction ?? "before"} ${fldLabel(node.field)}`
    if (mode === "dayOfWeek") return `Wait until ${WEEKDAY_NAMES[node.weekday ?? 1] ?? "Monday"}`
    if (mode === "timeOfDay") return `Wait until ${node.timeOfDay ?? "09:00"} CT`
    return "Delay"
  }
  if (node.mode === "fixed") return node.datetime ? `Wait until ${fmtClinic(new Date(node.datetime))}` : "Wait until a date"
  return `Wait until ${node.offsetAmount} ${node.offsetUnit} ${node.direction} ${fldLabel(node.field)}`
}

// Walk the graph from a start node, collecting actions until the first wait
// (delay or waitUntil) or the end. Returns the actions to run now, and—if it
// paused—the node to resume from plus the absolute resume time.
export function walkGraph(
  graph: AutomationGraph,
  startId: string | null,
  referral: ReferralForConditions | null,
): { actions: FlowAction[]; resumeNodeId: string | null; resumeAt: Date | null; waitLabel: string | null } {
  const out: FlowAction[] = []
  const visited = new Set<string>()
  let currentId = startId

  while (currentId) {
    if (visited.has(currentId)) break
    visited.add(currentId)
    const node = graph.nodes[currentId]
    if (!node) break

    if (node.kind === "action") {
      // Per-action scheduled send: if a future send-time is set, pause AT this
      // node; on resume the time is past, so it executes then continues.
      const at = actionScheduleTime(node.config ?? {}, referral)
      if (at && at.getTime() > Date.now()) {
        return { actions: out, resumeNodeId: node.id, resumeAt: at, waitLabel: `Scheduled — waiting until ${fmtClinic(at)}` }
      }
      out.push({ type: node.actionType, config: node.config ?? {} })
      currentId = node.next
    } else if (node.kind === "delay") {
      const resumeAt = delayResumeTime(node, referral)
      if (!resumeAt || resumeAt.getTime() <= Date.now()) { currentId = node.next; continue }
      return { actions: out, resumeNodeId: node.next, resumeAt, waitLabel: waitLabel(node) }
    } else if (node.kind === "waitUntil") {
      const resumeAt = waitUntilTime(node, referral)
      if (!resumeAt || resumeAt.getTime() <= Date.now()) { currentId = node.next; continue }
      return { actions: out, resumeNodeId: node.next, resumeAt, waitLabel: waitLabel(node) }
    } else if (node.kind === "branch") {
      const passed = referral ? criteriaPass(referral, node) : false
      currentId = passed ? node.thenNext : node.elseNext
    } else {
      const arm = referral ? node.arms.find(a => criteriaPass(referral, a)) : undefined
      currentId = arm ? arm.next : node.elseNext
    }
  }

  return { actions: out, resumeNodeId: null, resumeAt: null, waitLabel: null }
}

// Build a graph from a chain of actions (each → the next, last → null).
function actionsToChain(actions: FlowAction[], nodes: Record<string, GraphNode>): string | null {
  let firstId: string | null = null
  let prevId: string | null = null
  for (const a of actions) {
    const id = newNodeId()
    nodes[id] = { id, kind: "action", actionType: a.type, config: a.config ?? {}, next: null }
    if (prevId) (nodes[prevId] as Extract<GraphNode, { kind: "action" }>).next = id
    else firstId = id
    prevId = id
  }
  return firstId
}

// Convert a legacy automation (single action or if/else flow) into a graph so it
// can be displayed/edited in the visual canvas.
export function legacyToGraph(a: {
  actionType: string
  actionConfig: Record<string, unknown>
  flow?: AutomationFlow | null
}): AutomationGraph {
  const nodes: Record<string, GraphNode> = {}

  if (a.flow && (a.flow.then?.length || a.flow.else?.length)) {
    const thenNext = actionsToChain(a.flow.then ?? [], nodes)
    const elseNext = actionsToChain(a.flow.else ?? [], nodes)
    const branchId = newNodeId()
    nodes[branchId] = {
      id: branchId, kind: "branch",
      match: a.flow.match ?? "all", rules: a.flow.rules ?? [],
      thenNext, elseNext,
    }
    return { rootId: branchId, nodes }
  }

  const rootId = actionsToChain([{ type: a.actionType, config: a.actionConfig ?? {} }], nodes)
  return { rootId, nodes }
}

// ── Graph editing (pure; return a new graph) ──────────────────────────────────

// A slot is an insertion point identified by the pointer it occupies.
export type Slot =
  | { kind: "root" }
  | { kind: "after"; nodeId: string }            // action node's `next`
  | { kind: "then"; nodeId: string }             // branch `thenNext`
  | { kind: "else"; nodeId: string }             // branch/multi `elseNext`
  | { kind: "arm"; nodeId: string; armId: string } // a multi-branch arm's `next`

function clone(graph: AutomationGraph): AutomationGraph {
  return { rootId: graph.rootId, nodes: structuredCloneSafe(graph.nodes) }
}
function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

function getSlot(graph: AutomationGraph, slot: Slot): string | null {
  if (slot.kind === "root") return graph.rootId
  const n = graph.nodes[slot.nodeId]
  if (!n) return null
  if (slot.kind === "after" && (n.kind === "action" || n.kind === "delay" || n.kind === "waitUntil")) return n.next
  if (slot.kind === "then" && n.kind === "branch") return n.thenNext
  if (slot.kind === "else" && (n.kind === "branch" || n.kind === "multi")) return n.elseNext
  if (slot.kind === "arm" && n.kind === "multi") return n.arms.find(a => a.id === slot.armId)?.next ?? null
  return null
}
function setSlot(graph: AutomationGraph, slot: Slot, value: string | null): void {
  if (slot.kind === "root") { graph.rootId = value; return }
  const n = graph.nodes[slot.nodeId]
  if (!n) return
  if (slot.kind === "after" && (n.kind === "action" || n.kind === "delay" || n.kind === "waitUntil")) n.next = value
  else if (slot.kind === "then" && n.kind === "branch") n.thenNext = value
  else if (slot.kind === "else" && (n.kind === "branch" || n.kind === "multi")) n.elseNext = value
  else if (slot.kind === "arm" && n.kind === "multi") {
    const arm = n.arms.find(a => a.id === slot.armId)
    if (arm) arm.next = value
  }
}

// Insert a new node at a slot; the slot's current target becomes the new node's
// continuation (action.next, a branch's THEN path, or a multi's first arm).
export function insertAt(graph: AutomationGraph, slot: Slot, node: GraphNode): AutomationGraph {
  const g = clone(graph)
  const target = getSlot(g, slot)
  const n = structuredCloneSafe(node)
  if (n.kind === "action" || n.kind === "delay" || n.kind === "waitUntil") n.next = target
  else if (n.kind === "branch") { n.thenNext = target; n.elseNext = null }
  else {
    if (n.arms.length > 0) n.arms[0].next = target
    n.elseNext = null
  }
  g.nodes[n.id] = n
  setSlot(g, slot, n.id)
  return g
}

// All outgoing pointers of a node.
function nodeTargets(n: GraphNode): (string | null)[] {
  if (n.kind === "action" || n.kind === "delay" || n.kind === "waitUntil") return [n.next]
  if (n.kind === "branch") return [n.thenNext, n.elseNext]
  return [...n.arms.map(a => a.next), n.elseNext]
}

// Remove all nodes not reachable from the root.
export function pruneUnreachable(graph: AutomationGraph): AutomationGraph {
  const reachable = new Set<string>()
  const stack = graph.rootId ? [graph.rootId] : []
  while (stack.length) {
    const id = stack.pop()!
    if (reachable.has(id)) continue
    reachable.add(id)
    const n = graph.nodes[id]
    if (!n) continue
    const targets = nodeTargets(n)
    for (const t of targets) if (t) stack.push(t)
  }
  const nodes: Record<string, GraphNode> = {}
  Array.from(reachable).forEach(id => { if (graph.nodes[id]) nodes[id] = graph.nodes[id] })
  return { rootId: graph.rootId, nodes }
}

// Delete a node, relinking whoever points to it. For a branch, the parent is
// relinked to its THEN path (the ELSE subtree is dropped and pruned).
export function deleteNode(graph: AutomationGraph, id: string): AutomationGraph {
  const g = clone(graph)
  const node = g.nodes[id]
  if (!node) return g
  const continuation =
    node.kind === "action" || node.kind === "delay" || node.kind === "waitUntil" ? node.next
    : node.kind === "branch" ? node.thenNext
    : (node.arms[0]?.next ?? node.elseNext)

  if (g.rootId === id) g.rootId = continuation
  for (const n of Object.values(g.nodes)) {
    if ((n.kind === "action" || n.kind === "delay" || n.kind === "waitUntil") && n.next === id) n.next = continuation
    else if (n.kind === "branch") {
      if (n.thenNext === id) n.thenNext = continuation
      if (n.elseNext === id) n.elseNext = continuation
    } else if (n.kind === "multi") {
      for (const arm of n.arms) if (arm.next === id) arm.next = continuation
      if (n.elseNext === id) n.elseNext = continuation
    }
  }
  delete g.nodes[id]
  return pruneUnreachable(g)
}

// Replace a node's data in place (same id).
export function updateNode(graph: AutomationGraph, node: GraphNode): AutomationGraph {
  const g = clone(graph)
  g.nodes[node.id] = node
  return g
}

// Clone/copy/move apply to linear steps (action/delay/waitUntil) — the ones with
// a single `next`. Branch/multi nodes (which own subtrees) are not supported.
function isLinear(node: GraphNode | undefined): node is Extract<GraphNode, { kind: "action" | "delay" | "waitUntil" }> {
  return !!node && (node.kind === "action" || node.kind === "delay" || node.kind === "waitUntil")
}

// Duplicate a step right after itself (new id, same config).
export function cloneStep(graph: AutomationGraph, id: string): AutomationGraph {
  const node = graph.nodes[id]
  if (!isLinear(node)) return graph
  const copy = { ...structuredCloneSafe(node), id: newNodeId(), next: null } as GraphNode
  return insertAt(graph, { kind: "after", nodeId: id }, copy)
}

// Insert a copy of a step snapshot at a slot (paste).
export function pasteStep(graph: AutomationGraph, snapshot: GraphNode, slot: Slot): AutomationGraph {
  if (!isLinear(snapshot)) return graph
  const copy = { ...structuredCloneSafe(snapshot), id: newNodeId(), next: null } as GraphNode
  return insertAt(graph, slot, copy)
}

// Move a step to a new slot: remove it (relinking around it), then re-insert.
export function moveStep(graph: AutomationGraph, id: string, slot: Slot): AutomationGraph {
  const node = graph.nodes[id]
  if (!isLinear(node)) return graph
  if (slot.kind !== "root" && slot.nodeId === id) return graph // can't move relative to itself
  const snapshot = { ...structuredCloneSafe(node), id: newNodeId(), next: null } as GraphNode
  const without = deleteNode(graph, id)
  if (slot.kind !== "root" && !without.nodes[slot.nodeId]) return graph // anchor gone — bail safely
  return insertAt(without, slot, snapshot)
}

// Validate a graph has no dangling pointers and a reachable root.
export function isValidGraph(graph: AutomationGraph): boolean {
  if (!graph.rootId) return false
  if (!graph.nodes[graph.rootId]) return false
  for (const node of Object.values(graph.nodes)) {
    for (const t of nodeTargets(node)) {
      if (t !== null && !graph.nodes[t]) return false
    }
  }
  return true
}
