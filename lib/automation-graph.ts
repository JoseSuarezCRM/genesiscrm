// Pure node-graph model for the visual automation builder.
// No DB / mail / Twilio imports — safe to unit-test in isolation.
import {
  evaluateRule, evaluateGroups, type Condition, type ConditionGroup,
  type ReferralForConditions, type FlowAction, type AutomationFlow,
} from "./automation-conditions"

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
      amount: number
      unit: DelayUnit
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
    } else if (node.kind === "delay") {
      currentId = node.next // flat resolver ignores delays; walkGraph handles pausing
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

// Walk the graph from a start node, collecting actions until the first delay or
// the end. Returns the actions to run now, and—if it paused at a delay—the node
// to resume from plus the delay. Branch decisions use the given record.
export function walkGraph(
  graph: AutomationGraph,
  startId: string | null,
  referral: ReferralForConditions | null,
): { actions: FlowAction[]; resumeNodeId: string | null; delay: { amount: number; unit: DelayUnit } | null } {
  const out: FlowAction[] = []
  const visited = new Set<string>()
  let currentId = startId

  while (currentId) {
    if (visited.has(currentId)) break
    visited.add(currentId)
    const node = graph.nodes[currentId]
    if (!node) break

    if (node.kind === "action") {
      out.push({ type: node.actionType, config: node.config ?? {} })
      currentId = node.next
    } else if (node.kind === "delay") {
      return { actions: out, resumeNodeId: node.next, delay: { amount: node.amount, unit: node.unit } }
    } else if (node.kind === "branch") {
      const passed = referral ? criteriaPass(referral, node) : false
      currentId = passed ? node.thenNext : node.elseNext
    } else {
      const arm = referral ? node.arms.find(a => criteriaPass(referral, a)) : undefined
      currentId = arm ? arm.next : node.elseNext
    }
  }

  return { actions: out, resumeNodeId: null, delay: null }
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
  if (slot.kind === "after" && (n.kind === "action" || n.kind === "delay")) return n.next
  if (slot.kind === "then" && n.kind === "branch") return n.thenNext
  if (slot.kind === "else" && (n.kind === "branch" || n.kind === "multi")) return n.elseNext
  if (slot.kind === "arm" && n.kind === "multi") return n.arms.find(a => a.id === slot.armId)?.next ?? null
  return null
}
function setSlot(graph: AutomationGraph, slot: Slot, value: string | null): void {
  if (slot.kind === "root") { graph.rootId = value; return }
  const n = graph.nodes[slot.nodeId]
  if (!n) return
  if (slot.kind === "after" && (n.kind === "action" || n.kind === "delay")) n.next = value
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
  if (n.kind === "action" || n.kind === "delay") n.next = target
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
  if (n.kind === "action" || n.kind === "delay") return [n.next]
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
    node.kind === "action" || node.kind === "delay" ? node.next
    : node.kind === "branch" ? node.thenNext
    : (node.arms[0]?.next ?? node.elseNext)

  if (g.rootId === id) g.rootId = continuation
  for (const n of Object.values(g.nodes)) {
    if ((n.kind === "action" || n.kind === "delay") && n.next === id) n.next = continuation
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
