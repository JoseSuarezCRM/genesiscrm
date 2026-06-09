// Pure node-graph model for the visual automation builder.
// No DB / mail / Twilio imports — safe to unit-test in isolation.
import {
  evaluateRule, type Condition, type ReferralForConditions, type FlowAction, type AutomationFlow,
} from "./automation-conditions"

let _idSeq = 0
export function newNodeId(): string {
  _idSeq += 1
  return `n${Date.now().toString(36)}_${_idSeq}_${Math.random().toString(36).slice(2, 6)}`
}

// A node is either a single action or an if/else branch.
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
      kind: "branch"
      match: "all" | "any"
      rules: Condition[]
      thenNext: string | null
      elseNext: string | null
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
    } else {
      // branch: with no referral context, conditions can't be evaluated → ELSE path
      const passed = referral ? branchPasses(referral, node.match, node.rules) : false
      currentId = passed ? node.thenNext : node.elseNext
    }
  }

  return out
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
  | { kind: "after"; nodeId: string }   // action node's `next`
  | { kind: "then"; nodeId: string }    // branch `thenNext`
  | { kind: "else"; nodeId: string }    // branch `elseNext`

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
  if (slot.kind === "after" && n.kind === "action") return n.next
  if (slot.kind === "then" && n.kind === "branch") return n.thenNext
  if (slot.kind === "else" && n.kind === "branch") return n.elseNext
  return null
}
function setSlot(graph: AutomationGraph, slot: Slot, value: string | null): void {
  if (slot.kind === "root") { graph.rootId = value; return }
  const n = graph.nodes[slot.nodeId]
  if (!n) return
  if (slot.kind === "after" && n.kind === "action") n.next = value
  else if (slot.kind === "then" && n.kind === "branch") n.thenNext = value
  else if (slot.kind === "else" && n.kind === "branch") n.elseNext = value
}

// Insert a new node at a slot; the slot's current target becomes the new node's
// continuation (action.next, or a branch's THEN path).
export function insertAt(graph: AutomationGraph, slot: Slot, node: GraphNode): AutomationGraph {
  const g = clone(graph)
  const target = getSlot(g, slot)
  const n = { ...node }
  if (n.kind === "action") n.next = target
  else { n.thenNext = target; n.elseNext = null }
  g.nodes[n.id] = n
  setSlot(g, slot, n.id)
  return g
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
    const targets = n.kind === "action" ? [n.next] : [n.thenNext, n.elseNext]
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
  const continuation = node.kind === "action" ? node.next : node.thenNext

  if (g.rootId === id) g.rootId = continuation
  for (const n of Object.values(g.nodes)) {
    if (n.kind === "action" && n.next === id) n.next = continuation
    else if (n.kind === "branch") {
      if (n.thenNext === id) n.thenNext = continuation
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
    const targets = node.kind === "action" ? [node.next] : [node.thenNext, node.elseNext]
    for (const t of targets) {
      if (t !== null && !graph.nodes[t]) return false
    }
  }
  return true
}
