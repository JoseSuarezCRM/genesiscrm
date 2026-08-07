// Standalone test of automation if/else branch evaluation.
// Run: npx tsx scripts/test-automation-flow.ts
import {
  evaluateRule, flowConditionPasses, selectBranch,
  type ReferralForConditions, type AutomationFlow,
} from "../lib/automation-conditions"
import { resolveGraphActions, isValidGraph, insertAt, deleteNode, type AutomationGraph } from "../lib/automation-graph"

let passed = 0
let failed = 0
function assert(label: string, got: unknown, expected: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(expected)
  if (ok) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.log(`  ✗ ${label}\n      expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`) }
}

const base: ReferralForConditions = {
  id: "r1",
  referringPracticeId: "prac_A",
  referringLocationId: "loc_1",
  assignedToId: null,
  status: "NEW",
  insuranceProvider: "Blue Cross PPO",
  tags: [{ tagId: "tag_urgent" }],
}

const THEN = [{ type: "SEND_EMAIL", config: { subject: "then" } }]
const ELSE = [{ type: "CREATE_TASK", config: { title: "else" } }]

console.log("evaluateRule:")
assert("status eq NEW", evaluateRule(base, { field: "status", op: "eq", value: "NEW" }), true)
assert("status eq SCHEDULED", evaluateRule(base, { field: "status", op: "eq", value: "SCHEDULED" }), false)
assert("status ne COMPLETED", evaluateRule(base, { field: "status", op: "ne", value: "COMPLETED" }), true)
assert("practiceId eq prac_A", evaluateRule(base, { field: "practiceId", op: "eq", value: "prac_A" }), true)
assert("practiceId eq prac_B", evaluateRule(base, { field: "practiceId", op: "eq", value: "prac_B" }), false)
assert("assignedTo unassigned", evaluateRule(base, { field: "assignedToId", op: "unassigned", value: "" }), true)
assert("insurance contains 'blue'", evaluateRule(base, { field: "insuranceProvider", op: "contains", value: "blue" }), true)
assert("insurance contains 'aetna'", evaluateRule(base, { field: "insuranceProvider", op: "contains", value: "aetna" }), false)
assert("tag has tag_urgent", evaluateRule(base, { field: "tagId", op: "has", value: "tag_urgent" }), true)
assert("tag not_has tag_vip", evaluateRule(base, { field: "tagId", op: "not_has", value: "tag_vip" }), true)

console.log("\nflowConditionPasses:")
assert("no rules → passes (THEN)", flowConditionPasses(base, { rules: [] }), true)
assert("match all, both true", flowConditionPasses(base, {
  match: "all",
  rules: [{ field: "status", op: "eq", value: "NEW" }, { field: "practiceId", op: "eq", value: "prac_A" }],
}), true)
assert("match all, one false", flowConditionPasses(base, {
  match: "all",
  rules: [{ field: "status", op: "eq", value: "NEW" }, { field: "practiceId", op: "eq", value: "prac_B" }],
}), false)
assert("match any, one true", flowConditionPasses(base, {
  match: "any",
  rules: [{ field: "status", op: "eq", value: "SCHEDULED" }, { field: "practiceId", op: "eq", value: "prac_A" }],
}), true)
assert("match any, none true", flowConditionPasses(base, {
  match: "any",
  rules: [{ field: "status", op: "eq", value: "SCHEDULED" }, { field: "practiceId", op: "eq", value: "prac_B" }],
}), false)

console.log("\nselectBranch:")
const flowAll: AutomationFlow = { match: "all", rules: [{ field: "status", op: "eq", value: "NEW" }], then: THEN, else: ELSE }
assert("conditions met → THEN", selectBranch(base, flowAll), THEN)
assert("conditions not met → ELSE", selectBranch({ ...base, status: "COMPLETED" }, flowAll), ELSE)
assert("no rules → THEN", selectBranch(base, { then: THEN, else: ELSE }), THEN)
assert("not met, no ELSE → empty", selectBranch({ ...base, status: "COMPLETED" }, { match: "all", rules: [{ field: "status", op: "eq", value: "NEW" }], then: THEN }), [])

console.log("\ngraph traversal:")
// trigger → A(action) → branch(status=NEW) ? then: B : else: C → end
const graph: AutomationGraph = {
  rootId: "a",
  nodes: {
    a: { id: "a", kind: "action", actionType: "ADD_TAG", config: { tagId: "t1" }, next: "br" },
    br: { id: "br", kind: "branch", match: "all", rules: [{ field: "status", op: "eq", value: "NEW" }], thenNext: "b", elseNext: "c" },
    b: { id: "b", kind: "action", actionType: "SEND_EMAIL", config: { subject: "then-email" }, next: null },
    c: { id: "c", kind: "action", actionType: "CREATE_TASK", config: { title: "else-task" }, next: null },
  },
}
assert("valid graph", isValidGraph(graph), true)
assert("NEW → A then B", resolveGraphActions(graph, base).map(a => a.type), ["ADD_TAG", "SEND_EMAIL"])
assert("COMPLETED → A then C", resolveGraphActions(graph, { ...base, status: "COMPLETED" }).map(a => a.type), ["ADD_TAG", "CREATE_TASK"])
assert("no referral → A then ELSE", resolveGraphActions(graph, null).map(a => a.type), ["ADD_TAG", "CREATE_TASK"])

// linear multi-step: A → B → C → end
const linear: AutomationGraph = {
  rootId: "1",
  nodes: {
    "1": { id: "1", kind: "action", actionType: "ADD_TAG", config: {}, next: "2" },
    "2": { id: "2", kind: "action", actionType: "ASSIGN_REFERRAL", config: {}, next: "3" },
    "3": { id: "3", kind: "action", actionType: "SEND_SMS", config: {}, next: null },
  },
}
assert("linear runs all in order", resolveGraphActions(linear, base).map(a => a.type), ["ADD_TAG", "ASSIGN_REFERRAL", "SEND_SMS"])

// cycle guard: A → B → A
const cyclic: AutomationGraph = {
  rootId: "1",
  nodes: {
    "1": { id: "1", kind: "action", actionType: "ADD_TAG", config: {}, next: "2" },
    "2": { id: "2", kind: "action", actionType: "SEND_SMS", config: {}, next: "1" },
  },
}
assert("cycle terminates (no infinite loop)", resolveGraphActions(cyclic, base).map(a => a.type), ["ADD_TAG", "SEND_SMS"])
assert("dangling pointer → invalid", isValidGraph({ rootId: "1", nodes: { "1": { id: "1", kind: "action", actionType: "ADD_TAG", config: {}, next: "missing" } } }), false)

console.log("\ngraph editing:")
// start: A → null. Insert B after A → A → B → null
let g2: AutomationGraph = { rootId: "a", nodes: { a: { id: "a", kind: "action", actionType: "ADD_TAG", config: {}, next: null } } }
g2 = insertAt(g2, { kind: "after", nodeId: "a" }, { id: "b", kind: "action", actionType: "SEND_SMS", config: {}, next: null })
assert("insert after A → [A,B]", resolveGraphActions(g2, base).map(a => a.type), ["ADD_TAG", "SEND_SMS"])
// insert at root → C → A → B
g2 = insertAt(g2, { kind: "root" }, { id: "c", kind: "action", actionType: "ASSIGN_REFERRAL", config: {}, next: null })
assert("insert at root → [C,A,B]", resolveGraphActions(g2, base).map(a => a.type), ["ASSIGN_REFERRAL", "ADD_TAG", "SEND_SMS"])
// delete A → C → B
g2 = deleteNode(g2, "a")
assert("delete A → [C,B]", resolveGraphActions(g2, base).map(a => a.type), ["ASSIGN_REFERRAL", "SEND_SMS"])
assert("graph still valid after edits", isValidGraph(g2), true)

console.log("\ngoto (jump) node:")
// A → B → goto(A). The visited guard stops the loop after one pass.
const gotoLoop: AutomationGraph = {
  rootId: "1",
  nodes: {
    "1": { id: "1", kind: "action", actionType: "ADD_TAG", config: {}, next: "2" },
    "2": { id: "2", kind: "action", actionType: "SEND_SMS", config: {}, next: "g" },
    g: { id: "g", kind: "goto", target: "1" },
  },
}
assert("goto loops once then stops", resolveGraphActions(gotoLoop, base).map(a => a.type), ["ADD_TAG", "SEND_SMS"])
// goto forward: A → goto(C); C is the end action, B is skipped.
const gotoFwd: AutomationGraph = {
  rootId: "1",
  nodes: {
    "1": { id: "1", kind: "action", actionType: "ADD_TAG", config: {}, next: "g" },
    g: { id: "g", kind: "goto", target: "3" },
    "2": { id: "2", kind: "action", actionType: "SEND_SMS", config: {}, next: null },
    "3": { id: "3", kind: "action", actionType: "CREATE_TASK", config: {}, next: null },
  },
}
assert("goto jumps forward, skipping B", resolveGraphActions(gotoFwd, base).map(a => a.type), ["ADD_TAG", "CREATE_TASK"])
// deleting the goto's target clears the dangling jump (graph stays valid).
const delTarget = deleteNode(gotoFwd, "3")
assert("delete goto target → still valid", isValidGraph(delTarget), true)

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
