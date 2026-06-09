// Standalone test of automation if/else branch evaluation.
// Run: npx tsx scripts/test-automation-flow.ts
import {
  evaluateRule, flowConditionPasses, selectBranch,
  type ReferralForConditions, type AutomationFlow,
} from "../lib/automation-conditions"

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

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
