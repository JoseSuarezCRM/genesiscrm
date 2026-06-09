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
