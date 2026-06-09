// Pure condition/branch evaluation for automations.
// No DB / Twilio / mail imports — safe to unit-test in isolation.

export interface ReferralForConditions {
  id: string
  referringPracticeId: string | null
  referringLocationId: string | null
  assignedToId: string | null
  status: string
  insuranceProvider: string | null
  tags: { tagId: string }[]
}

export interface Condition {
  field: string
  op: string
  value: string
}

export interface FlowAction {
  type: string
  config: Record<string, unknown>
}

export interface AutomationFlow {
  match?: "all" | "any"
  rules?: Condition[]
  then?: FlowAction[]
  else?: FlowAction[]
}

// Evaluate a single condition rule against a referral.
export function evaluateRule(referral: ReferralForConditions, cond: Condition): boolean {
  const condVal = cond.value ?? ""
  const condValLower = condVal.toLowerCase()
  switch (cond.field) {
    case "practiceId":
      if (cond.op === "eq") return referral.referringPracticeId === condVal
      if (cond.op === "ne") return referral.referringPracticeId !== condVal
      if (cond.op === "empty") return referral.referringPracticeId === null
      return true
    case "locationId":
      if (cond.op === "eq") return referral.referringLocationId === condVal
      if (cond.op === "ne") return referral.referringLocationId !== condVal
      if (cond.op === "empty") return referral.referringLocationId === null
      return true
    case "assignedToId":
      if (cond.op === "eq") return referral.assignedToId === condVal
      if (cond.op === "ne") return referral.assignedToId !== condVal
      if (cond.op === "unassigned") return referral.assignedToId === null
      return true
    case "status":
      if (cond.op === "eq") return referral.status === condVal
      if (cond.op === "ne") return referral.status !== condVal
      return true
    case "insuranceProvider": {
      const ip = (referral.insuranceProvider ?? "").toLowerCase()
      if (cond.op === "contains") return ip.includes(condValLower)
      if (cond.op === "eq") return ip === condValLower
      if (cond.op === "empty") return !referral.insuranceProvider
      return true
    }
    case "tagId": {
      const hasTag = referral.tags.some(t => t.tagId === condVal)
      if (cond.op === "has") return hasTag
      if (cond.op === "not_has") return !hasTag
      return true
    }
    default:
      return true
  }
}

// Whether the referral passes the flow's condition group.
export function flowConditionPasses(referral: ReferralForConditions, flow: AutomationFlow): boolean {
  const rules = flow.rules ?? []
  if (rules.length === 0) return true // no conditions → always take the THEN branch
  return flow.match === "any"
    ? rules.some(c => evaluateRule(referral, c))
    : rules.every(c => evaluateRule(referral, c))
}

// Which action list should run for this referral (the THEN or ELSE branch).
export function selectBranch(referral: ReferralForConditions, flow: AutomationFlow): FlowAction[] {
  return flowConditionPasses(referral, flow) ? (flow.then ?? []) : (flow.else ?? [])
}
