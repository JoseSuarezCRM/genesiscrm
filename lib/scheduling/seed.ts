// Seed defaults, ported verbatim from the v10 dashboard's initial literals
// (docs/GenesisDashboard-3.html lines 786–830, 804, 3009).
//
// v10 ships with empty providers / staff / volume — the real roster lives in the
// saved org-wide state, which merges over these. Only the clinic set, staffing
// tiers and task list are seeded, so a brand-new install still renders a grid.

import { DAYS } from "./constants"
import type {
  ClinicMeta, DailyTask, SchedulingData, Settings, StaffingRule, WeekSchedule,
} from "./types"

export const DEFAULT_SETTINGS: Settings = {
  targetPts: "30",
  daysPerMonth: "21",
  weeksProject: "26",
  calWeeks: "26",
  startWeek: "2026-08-31",
  // No UI in v10 (hidden inputs feeding removed analytics), but still persisted.
  growthPct: "2",
  orientDays: "7",
}

export const seedClinicMeta: Record<string, ClinicMeta> = {
  SC: { full: "Saint Charles", contract: "M-F", daysOpen: 5, xrNeed: true },
  OB: { full: "Oak Brook", contract: "M-F", daysOpen: 4, xrNeed: true },
  LV: { full: "Little Village", contract: "M-F", daysOpen: 4, xrNeed: true },
  AR: { full: "Aurora", contract: "T,TH", daysOpen: 2, xrNeed: true },
  JO: { full: "Joliet", contract: "M-F", daysOpen: 2, xrNeed: false },
  WG: { full: "West Gate", contract: "M-F", daysOpen: 3, xrNeed: true },
  HP: { full: "Humboldt Park", contract: "F", daysOpen: 1, xrNeed: true },
  GU: { full: "Gurnee", contract: "M-F", daysOpen: 2, xrNeed: true },
  PCC: { full: "PCC", contract: "M-F", daysOpen: 1, xrNeed: false },
  EW: { full: "Englewood", contract: "M,W,F", daysOpen: 3, xrNeed: true },
  JC: { full: "JenCare", contract: "F", daysOpen: 1, xrNeed: false },
  NW: { full: "Near West", contract: "M-F", daysOpen: 3, xrNeed: true },
  SK: { full: "Skokie", contract: "M-F", daysOpen: 3, xrNeed: true },
  GOH: { full: "Glen Oaks", contract: "Surgery", daysOpen: 5, xrNeed: false, isSurgery: true },
  HPH: { full: "Humboldt Park Hospital", contract: "Surgery", daysOpen: 5, xrNeed: false, isSurgery: true },
  "West Sub": { full: "West Suburban", contract: "Surgery", daysOpen: 5, xrNeed: false, isSurgery: true },
}

export const seedClinicOrder = [
  "SC", "OB", "LV", "AR", "JO", "WG", "HP", "GU", "PCC", "EW", "JC", "NW", "SK",
  "GOH", "HPH", "West Sub",
]

export const seedStaffingRules: StaffingRule[] = [
  { minPts: 0, maxPts: 15, totalStaff: 1, breakdown: "1 XRT" },
  { minPts: 16, maxPts: 25, totalStaff: 2, breakdown: "1 XRT + 1 FD" },
  { minPts: 26, maxPts: 42, totalStaff: 3, breakdown: "1 XRT + 1 FD + 1 MA" },
  { minPts: 43, maxPts: 64, totalStaff: 4, breakdown: "1 XRT + 1 FD + 2 MAs" },
  { minPts: 65, maxPts: 999, totalStaff: 5, breakdown: "1 XRT + 1 FD + 3 MAs" },
]

export const seedDailyTasks: DailyTask[] = [
  { name: "CC Rep", MON: [], TUE: [], WED: [], THU: [], FRI: [] },
  {
    name: "Voicemail (CV)",
    MON: ["AA", "CK", "ASA"], TUE: ["AA", "CK", "ASA"], WED: ["AA", "CK", "ASA"],
    THU: ["AA", "CK", "ASA"], FRI: ["AA", "CK", "ASA"],
  },
  {
    name: "Referrals",
    MON: ["All FD"], TUE: ["All FD"], WED: ["All FD"], THU: ["All FD"], FRI: ["All FD"],
  },
  {
    name: "PT Notes",
    MON: ["STC", "OB", "LV"], TUE: ["STC", "OB", "LV"], WED: ["STC", "OB", "LV"],
    THU: ["STC", "OB", "LV"], FRI: ["STC", "OB", "LV"],
  },
  {
    name: "Spanish Calls",
    MON: ["Call Center", "MAs"], TUE: ["Call Center", "MAs"], WED: ["Call Center", "MAs"],
    THU: ["Call Center", "MAs"], FRI: ["Call Center", "MAs"],
  },
]

/** An empty A/B week for every clinic in `order`. */
export function emptyWeekSchedule(order: string[]): WeekSchedule {
  const out: WeekSchedule = {}
  for (const c of order) {
    out[c] = {}
    for (const day of DAYS) out[c][day] = []
  }
  return out
}

export function makeSeedState(): SchedulingData {
  return {
    version: 10,
    settings: { ...DEFAULT_SETTINGS },

    providers: [],
    currentStaff: [],
    incomingInterns: [],
    customRoles: [],

    clinicMeta: JSON.parse(JSON.stringify(seedClinicMeta)),
    clinicOrder: [...seedClinicOrder],
    clinicRegions: {},
    staffRegions: {},

    scheduleA: emptyWeekSchedule(seedClinicOrder),
    scheduleB: emptyWeekSchedule(seedClinicOrder),
    pendingScheduleA: null,
    pendingScheduleB: null,
    pendingScheduleStartDate: "",

    ptoEntries: [],
    scheduleOverrides: [],
    recurringRules: [],
    dailyTasks: JSON.parse(JSON.stringify(seedDailyTasks)),
    onCallPASchedule: {},
    msNotes: {},

    staffingRules: JSON.parse(JSON.stringify(seedStaffingRules)),
    staffingRulesExtra: 15,

    iaPreferences: {},
    iaExcludedClinics: {},
    iaRotationHistory: {},

    xrtPreferences: {},
    xrtAssignments: {},
    xrtRotationHistory: {},

    surgLocations: [],
    surgAssignments: {},
    surgLog: [],

    rawVolume: [],

    scheduleLocks: [],
    optimizerRules: [],
  }
}
