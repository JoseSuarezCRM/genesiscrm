// Seed defaults ported verbatim from the original Operations Dashboard's initial
// literals. Used when there is no saved org-wide state yet; saved state merges over
// these (same field-by-field logic as the dashboard's import/hydrate).
import type {
  ClinicMeta, DailyTask, IncomingStaff, Provider, SchedulingData, Settings,
  StaffMember, StaffingRule, SurgLocation, VolumeEntry, WeekSchedule,
} from "./types"

export const DEFAULT_SETTINGS: Settings = {
  targetPts: "30",
  daysPerMonth: "21",
  growthPct: "2",
  weeksProject: "26",
  orientDays: "7",
  calWeeks: "26",
  startWeek: "2026-04-13",
}

export const seedRawVolume: VolumeEntry[] = [
  { month: "January", year: 2025, clinic: "AR", visits: 71 }, { month: "January", year: 2025, clinic: "EW", visits: 33 }, { month: "January", year: 2025, clinic: "GU", visits: 90 }, { month: "January", year: 2025, clinic: "HP", visits: 77 }, { month: "January", year: 2025, clinic: "JO", visits: 51 }, { month: "January", year: 2025, clinic: "LV", visits: 415 }, { month: "January", year: 2025, clinic: "OB", visits: 330 }, { month: "January", year: 2025, clinic: "SC", visits: 660 }, { month: "January", year: 2025, clinic: "WG", visits: 349 },
  { month: "February", year: 2025, clinic: "AR", visits: 162 }, { month: "February", year: 2025, clinic: "EW", visits: 36 }, { month: "February", year: 2025, clinic: "GU", visits: 114 }, { month: "February", year: 2025, clinic: "HP", visits: 120 }, { month: "February", year: 2025, clinic: "JO", visits: 56 }, { month: "February", year: 2025, clinic: "LV", visits: 763 }, { month: "February", year: 2025, clinic: "OB", visits: 752 }, { month: "February", year: 2025, clinic: "SC", visits: 1075 }, { month: "February", year: 2025, clinic: "WG", visits: 556 },
  { month: "March", year: 2025, clinic: "AR", visits: 134 }, { month: "March", year: 2025, clinic: "EW", visits: 50 }, { month: "March", year: 2025, clinic: "GU", visits: 109 }, { month: "March", year: 2025, clinic: "HP", visits: 115 }, { month: "March", year: 2025, clinic: "JO", visits: 60 }, { month: "March", year: 2025, clinic: "LV", visits: 806 }, { month: "March", year: 2025, clinic: "OB", visits: 666 }, { month: "March", year: 2025, clinic: "SC", visits: 1175 }, { month: "March", year: 2025, clinic: "WG", visits: 574 },
  { month: "April", year: 2025, clinic: "AR", visits: 148 }, { month: "April", year: 2025, clinic: "EW", visits: 92 }, { month: "April", year: 2025, clinic: "GU", visits: 129 }, { month: "April", year: 2025, clinic: "HP", visits: 144 }, { month: "April", year: 2025, clinic: "JO", visits: 74 }, { month: "April", year: 2025, clinic: "LV", visits: 951 }, { month: "April", year: 2025, clinic: "OB", visits: 847 }, { month: "April", year: 2025, clinic: "SC", visits: 1154 }, { month: "April", year: 2025, clinic: "WG", visits: 653 },
  { month: "May", year: 2025, clinic: "AR", visits: 176 }, { month: "May", year: 2025, clinic: "EW", visits: 66 }, { month: "May", year: 2025, clinic: "GU", visits: 100 }, { month: "May", year: 2025, clinic: "HP", visits: 145 }, { month: "May", year: 2025, clinic: "JO", visits: 87 }, { month: "May", year: 2025, clinic: "LV", visits: 735 }, { month: "May", year: 2025, clinic: "OB", visits: 677 }, { month: "May", year: 2025, clinic: "SC", visits: 1229 }, { month: "May", year: 2025, clinic: "WG", visits: 712 },
  { month: "June", year: 2025, clinic: "AR", visits: 198 }, { month: "June", year: 2025, clinic: "EW", visits: 73 }, { month: "June", year: 2025, clinic: "GU", visits: 115 }, { month: "June", year: 2025, clinic: "HP", visits: 89 }, { month: "June", year: 2025, clinic: "JO", visits: 50 }, { month: "June", year: 2025, clinic: "LV", visits: 886 }, { month: "June", year: 2025, clinic: "OB", visits: 744 }, { month: "June", year: 2025, clinic: "SC", visits: 1102 }, { month: "June", year: 2025, clinic: "WG", visits: 610 },
  { month: "July", year: 2025, clinic: "AR", visits: 208 }, { month: "July", year: 2025, clinic: "EW", visits: 98 }, { month: "July", year: 2025, clinic: "GU", visits: 76 }, { month: "July", year: 2025, clinic: "HP", visits: 170 }, { month: "July", year: 2025, clinic: "JO", visits: 38 }, { month: "July", year: 2025, clinic: "LV", visits: 949 }, { month: "July", year: 2025, clinic: "OB", visits: 786 }, { month: "July", year: 2025, clinic: "SC", visits: 1213 }, { month: "July", year: 2025, clinic: "WG", visits: 706 },
  { month: "August", year: 2025, clinic: "AR", visits: 138 }, { month: "August", year: 2025, clinic: "EW", visits: 94 }, { month: "August", year: 2025, clinic: "GU", visits: 95 }, { month: "August", year: 2025, clinic: "HP", visits: 180 }, { month: "August", year: 2025, clinic: "JO", visits: 74 }, { month: "August", year: 2025, clinic: "LV", visits: 763 }, { month: "August", year: 2025, clinic: "OB", visits: 628 }, { month: "August", year: 2025, clinic: "SC", visits: 1093 }, { month: "August", year: 2025, clinic: "WG", visits: 697 },
  { month: "September", year: 2025, clinic: "AR", visits: 167 }, { month: "September", year: 2025, clinic: "EW", visits: 94 }, { month: "September", year: 2025, clinic: "GU", visits: 80 }, { month: "September", year: 2025, clinic: "HP", visits: 157 }, { month: "September", year: 2025, clinic: "JO", visits: 55 }, { month: "September", year: 2025, clinic: "LV", visits: 791 }, { month: "September", year: 2025, clinic: "OB", visits: 783 }, { month: "September", year: 2025, clinic: "SC", visits: 1049 }, { month: "September", year: 2025, clinic: "WG", visits: 699 },
  { month: "October", year: 2025, clinic: "AR", visits: 184 }, { month: "October", year: 2025, clinic: "EW", visits: 123 }, { month: "October", year: 2025, clinic: "GU", visits: 120 }, { month: "October", year: 2025, clinic: "HP", visits: 213 }, { month: "October", year: 2025, clinic: "JO", visits: 57 }, { month: "October", year: 2025, clinic: "LV", visits: 1011 }, { month: "October", year: 2025, clinic: "OB", visits: 819 }, { month: "October", year: 2025, clinic: "SC", visits: 1290 }, { month: "October", year: 2025, clinic: "WG", visits: 783 },
  { month: "November", year: 2025, clinic: "AR", visits: 103 }, { month: "November", year: 2025, clinic: "EW", visits: 112 }, { month: "November", year: 2025, clinic: "GU", visits: 101 }, { month: "November", year: 2025, clinic: "HP", visits: 81 }, { month: "November", year: 2025, clinic: "JO", visits: 53 }, { month: "November", year: 2025, clinic: "LV", visits: 595 }, { month: "November", year: 2025, clinic: "OB", visits: 624 }, { month: "November", year: 2025, clinic: "SC", visits: 853 }, { month: "November", year: 2025, clinic: "WG", visits: 613 },
  { month: "December", year: 2025, clinic: "AR", visits: 180 }, { month: "December", year: 2025, clinic: "EW", visits: 121 }, { month: "December", year: 2025, clinic: "GU", visits: 80 }, { month: "December", year: 2025, clinic: "HP", visits: 63 }, { month: "December", year: 2025, clinic: "JO", visits: 42 }, { month: "December", year: 2025, clinic: "LV", visits: 784 }, { month: "December", year: 2025, clinic: "OB", visits: 842 }, { month: "December", year: 2025, clinic: "SC", visits: 905 }, { month: "December", year: 2025, clinic: "WG", visits: 648 },
  { month: "January", year: 2026, clinic: "AR", visits: 163 }, { month: "January", year: 2026, clinic: "EW", visits: 113 }, { month: "January", year: 2026, clinic: "GU", visits: 105 }, { month: "January", year: 2026, clinic: "HP", visits: 105 }, { month: "January", year: 2026, clinic: "JO", visits: 80 }, { month: "January", year: 2026, clinic: "LV", visits: 864 }, { month: "January", year: 2026, clinic: "OB", visits: 707 }, { month: "January", year: 2026, clinic: "SC", visits: 1030 }, { month: "January", year: 2026, clinic: "WG", visits: 753 },
  { month: "February", year: 2026, clinic: "AR", visits: 172 }, { month: "February", year: 2026, clinic: "EW", visits: 87 }, { month: "February", year: 2026, clinic: "GU", visits: 72 }, { month: "February", year: 2026, clinic: "HP", visits: 92 }, { month: "February", year: 2026, clinic: "JO", visits: 72 }, { month: "February", year: 2026, clinic: "LV", visits: 824 }, { month: "February", year: 2026, clinic: "OB", visits: 739 }, { month: "February", year: 2026, clinic: "SC", visits: 802 }, { month: "February", year: 2026, clinic: "WG", visits: 734 },
]

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
  "SC", "OB", "LV", "AR", "JO", "WG", "HP", "GU", "PCC", "EW", "JC", "NW", "SK", "GOH", "HPH", "West Sub",
]

export const seedStaffingRules: StaffingRule[] = [
  { minPts: 0, maxPts: 15, totalStaff: 1, breakdown: "1 XRT" },
  { minPts: 16, maxPts: 25, totalStaff: 2, breakdown: "1 XRT + 1 FD" },
  { minPts: 26, maxPts: 42, totalStaff: 3, breakdown: "1 XRT + 1 FD + 1 MA" },
  { minPts: 43, maxPts: 64, totalStaff: 4, breakdown: "1 XRT + 1 FD + 2 MAs" },
  { minPts: 65, maxPts: 999, totalStaff: 5, breakdown: "1 XRT + 1 FD + 3 MAs" },
]

export const seedProviders: Provider[] = [
  { name: "Brittney", init: "BR", ptsDay: 30, clinicDays: 5, freq: "every", clinics: "GU,OB,PCC,WG", leave: "", ret: "", start: "", color: "#3b82f6" },
  { name: "Horner", init: "NH", ptsDay: 65, clinicDays: 3, freq: "every", clinics: "OB,LV,SC", leave: "", ret: "", start: "", color: "#ef4444" },
  { name: "Diamond", init: "MD", ptsDay: 30, clinicDays: 5, freq: "every", clinics: "LV,OB,SC,WG", leave: "", ret: "", start: "", color: "#22c55e" },
  { name: "Wang", init: "JW", ptsDay: 30, clinicDays: 4, freq: "every", clinics: "SC,WG,LV,AR,OB", leave: "", ret: "", start: "", color: "#a855f7" },
  { name: "Kelsey", init: "KG", ptsDay: 30, clinicDays: 4, freq: "every", clinics: "JO,AR,OB", leave: "", ret: "", start: "2026-08-03", color: "#f97316" },
  { name: "Lisa", init: "EA", ptsDay: 30, clinicDays: 2, freq: "every", clinics: "OB,AR", leave: "2026-05-18", ret: "2026-08-18", start: "", color: "#14b8a6" },
  { name: "Shadid", init: "HS", ptsDay: 30, clinicDays: 2, freq: "every", clinics: "LV,HP", leave: "", ret: "", start: "", color: "#ec4899" },
  { name: "Juraj", init: "JZ", ptsDay: 30, clinicDays: 5, freq: "eow", clinics: "EW,LV,JC,HP", leave: "", ret: "", start: "", color: "#0ea5e9" },
  { name: "Delaney", init: "DL", ptsDay: 30, clinicDays: 3, freq: "every", clinics: "LV,EW", leave: "", ret: "", start: "", color: "#84cc16" },
  { name: "Elliot", init: "EJ", ptsDay: 30, clinicDays: 3, freq: "every", clinics: "SC,JO", leave: "", ret: "", start: "", color: "#f59e0b" },
  { name: "Cavalenes", init: "MC", ptsDay: 30, clinicDays: 2, freq: "every", clinics: "WG", leave: "", ret: "", start: "", color: "#6366f1" },
  { name: "Derrick", init: "DB", ptsDay: 30, clinicDays: 1, freq: "eow", clinics: "OB", leave: "", ret: "", start: "", color: "#10b981" },
  { name: "Bill", init: "WH", ptsDay: 30, clinicDays: 5, freq: "every", clinics: "LV,WG,JC,HP", leave: "", ret: "", start: "2026-07-13", color: "#0d9488" },
  { name: "Fellow 1", init: "F1", ptsDay: 30, clinicDays: 0, freq: "every", clinics: "", leave: "", ret: "", start: "", color: "#d97706" },
  { name: "Fellow 2", init: "F2", ptsDay: 30, clinicDays: 0, freq: "every", clinics: "", leave: "", ret: "", start: "", color: "#06b6d4" },
  { name: "Emad (CSA)", init: "EM", ptsDay: 30, clinicDays: 0, freq: "every", clinics: "", leave: "", ret: "", start: "", color: "#7c3aed" },
]

export const seedScheduleA: WeekSchedule = {
  SC: { MON: ["JW", "MD"], TUE: [], WED: ["JZ"], THU: ["NH"], FRI: ["EJ", "EA"], SAT: [] },
  OB: { MON: ["NH"], TUE: ["EA", "JZ"], WED: ["MD"], THU: [], FRI: ["JW"], SAT: ["DB"] },
  LV: { MON: ["EJ", "DL"], TUE: ["HS", "MD"], WED: ["NH"], THU: ["MD", "DL"], FRI: [], SAT: [] },
  AR: { MON: [], TUE: [], WED: ["JW"], THU: ["EA", "JZ"], FRI: [], SAT: [] },
  JO: { MON: [], TUE: ["EJ"], WED: [], THU: [], FRI: [], SAT: [] },
  WG: { MON: [], TUE: ["JW", "BR"], WED: [], THU: ["BR", "MC"], FRI: ["MD", "MC"], SAT: [] },
  HP: { MON: [], TUE: [], WED: [], THU: [], FRI: ["DL", "HS"], SAT: [] },
  GU: { MON: [], TUE: [], WED: ["BR"], THU: [], FRI: ["BR"], SAT: [] },
  PCC: { MON: ["BR"], TUE: [], WED: [], THU: [], FRI: [], SAT: [] },
  EW: { MON: ["JZ"], TUE: [], WED: ["DL"], THU: [], FRI: ["JZ"], SAT: [] },
  JC: { MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [] },
  NW: { MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [] },
  SK: { MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [] },
  GOH: { MON: ["EM"], TUE: ["NH", "DL", "EM"], WED: ["MC", "MD", "EM"], THU: ["JW", "EM"], FRI: ["NH", "EM"], SAT: [] },
  HPH: { MON: [], TUE: [], WED: ["NH"], THU: [], FRI: [], SAT: [] },
  "West Sub": { MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [] },
}

export const seedScheduleB: WeekSchedule = {
  SC: { MON: ["JW", "MD"], TUE: [], WED: [], THU: ["NH"], FRI: ["EJ", "EA"], SAT: [] },
  OB: { MON: ["NH"], TUE: ["EA", "HS"], WED: ["MD"], THU: [], FRI: ["JW"], SAT: ["DB"] },
  LV: { MON: ["EJ", "DL"], TUE: ["JW", "MD"], WED: ["NH"], THU: ["MD", "DL"], FRI: [], SAT: [] },
  AR: { MON: [], TUE: [], WED: ["JW"], THU: ["EA"], FRI: [], SAT: [] },
  JO: { MON: [], TUE: ["EJ"], WED: [], THU: [], FRI: [], SAT: [] },
  WG: { MON: [], TUE: ["MC", "BR"], WED: [], THU: ["BR", "MC"], FRI: ["MD", "MC"], SAT: [] },
  HP: { MON: [], TUE: [], WED: [], THU: [], FRI: ["DL", "HS"], SAT: [] },
  GU: { MON: [], TUE: [], WED: ["BR"], THU: [], FRI: ["BR"], SAT: [] },
  PCC: { MON: ["BR"], TUE: [], WED: [], THU: [], FRI: [], SAT: [] },
  EW: { MON: [], TUE: [], WED: ["DL"], THU: [], FRI: [], SAT: [] },
  JC: { MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [] },
  NW: { MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [] },
  SK: { MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [] },
  GOH: { MON: ["EM"], TUE: ["NH", "DL", "EM"], WED: ["MC", "MD", "EM"], THU: ["JW", "EM"], FRI: ["NH", "EM"], SAT: [] },
  HPH: { MON: [], TUE: [], WED: ["NH"], THU: [], FRI: [], SAT: [] },
  "West Sub": { MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [] },
}

export const seedCurrentStaff: StaffMember[] = [
  { name: "Carmen", init: "CL", role: "Lead Intern", lastDay: "", avail: 1.0, clinicPref: "", notes: "" },
  { name: "Angelo", init: "AL", role: "Lead Intern", lastDay: "", avail: 1.0, clinicPref: "", notes: "", dayAvail: { MON: "available", TUE: "available", WED: "available", THU: "available", FRI: "available", SAT: "available" } },
  { name: "Ahmed", init: "AA", role: "Intern 2026", lastDay: "", avail: 1.0, clinicPref: "", notes: "" },
  { name: "Rafael", init: "RS", role: "Intern 2026", lastDay: "", avail: 1.0, clinicPref: "", notes: "" },
  { name: "Micai", init: "MH", role: "Intern 2025", lastDay: "2026-08-15", avail: 1.0, clinicPref: "", notes: "" },
  { name: "Ashley", init: "AT", role: "Careerist", lastDay: "", avail: 0.4, clinicPref: "", notes: "" },
  { name: "Chris", init: "CW", role: "Intern 2025", lastDay: "2026-05-01", avail: 1.0, clinicPref: "", notes: "" },
  { name: "Ariana", init: "ASA", role: "Intern 2025", lastDay: "2026-05-31", avail: 1.0, clinicPref: "", notes: "" },
  { name: "Christine", init: "CK", role: "Intern 2025", lastDay: "2026-06-02", avail: 1.0, clinicPref: "", notes: "" },
  { name: "Vera", init: "VZ", role: "Intern 2025", lastDay: "2026-06-07", avail: 1.0, clinicPref: "", notes: "" },
  { name: "Alex", init: "AS", role: "Intern 2025", lastDay: "2026-06-01", avail: 0.2, clinicPref: "", notes: "" },
  { name: "Zach", init: "ZM", role: "Intern 2025", lastDay: "2026-06-30", avail: 1.0, clinicPref: "", notes: "" },
  { name: "Jessie", init: "JA", role: "Intern 2026", lastDay: "", avail: 1.0, clinicPref: "", notes: "", lastResort: true },
  { name: "Abby", init: "AK", role: "Front Desk", lastDay: "", avail: 1.0, clinicPref: "", notes: "" },
  { name: "Gloria", init: "GH", role: "Front Desk", lastDay: "", avail: 1.0, clinicPref: "", notes: "" },
  { name: "Rubi", init: "RP", role: "Front Desk", lastDay: "", avail: 1.0, clinicPref: "", notes: "" },
  { name: "Char'rell Watson", init: "CRW", role: "XR Tech", lastDay: "", avail: 1.0, clinicPref: "", notes: "", dayAvail: { MON: "unavailable", TUE: "available", WED: "unavailable", THU: "available", FRI: "unavailable" } },
  { name: "Cynthia Guzman", init: "CG", role: "XR Tech", lastDay: "", avail: 1.0, clinicPref: "", notes: "" },
  { name: "Erica Burns", init: "EB", role: "XR Tech", lastDay: "", avail: 1.0, clinicPref: "", notes: "" },
  { name: "Fran Sanaghan", init: "FS", role: "XR Tech", lastDay: "", avail: 1.0, clinicPref: "", notes: "", dayAvail: { MON: "available", TUE: "unavailable", WED: "unavailable", THU: "unavailable", FRI: "available" } },
  { name: "Harold Gonzalez", init: "HG", role: "XR Tech", lastDay: "", avail: 1.0, clinicPref: "", notes: "" },
  { name: "Jessie Smith", init: "JS", role: "XR Tech", lastDay: "", avail: 1.0, clinicPref: "", notes: "", dayAvail: { MON: "unavailable", TUE: "available", WED: "unavailable", THU: "available", FRI: "unavailable" } },
  { name: "John Crosby", init: "JC2", role: "XR Tech", lastDay: "", avail: 1.0, clinicPref: "", notes: "" },
  { name: "Michael Obeng", init: "MO", role: "XR Tech", lastDay: "", avail: 1.0, clinicPref: "", notes: "" },
]

export const seedIncomingInterns: IncomingStaff[] = [
  { name: "Britt Nerad", start: "2026-05-25", avail: 1.0, clinicPref: "", notes: "Bridge for June departure wave" },
  { name: "Cassie Dumelle", start: "2026-05-26", avail: 1.0, clinicPref: "", notes: "Bridge for June departure wave" },
  { name: "Saanvi Kandanelli", start: "2026-06-01", avail: 1.0, clinicPref: "", notes: "Push to 5/28 if possible" },
  { name: "Kate Kasica", start: "2026-06-01", avail: 1.0, clinicPref: "", notes: "" },
  { name: "Colin Ortiz", start: "2026-06-08", avail: 1.0, clinicPref: "GU", notes: "Key for Gurnee — train before Zach leaves" },
  { name: "Rujuta Durwas", start: "2026-06-08", avail: 1.0, clinicPref: "", notes: "" },
  { name: "Pavitra Madala", start: "2026-06-15", avail: 1.0, clinicPref: "", notes: "Ready for Bill (7/13)" },
  { name: "Arshia Sazi", start: "2026-06-20", avail: 1.0, clinicPref: "", notes: "" },
  { name: "Maya Stone", start: "2026-06-22", avail: 1.0, clinicPref: "", notes: "" },
  { name: "Selene Sosa", start: "2026-06-22", avail: 1.0, clinicPref: "", notes: "" },
  { name: "Allen Perales", start: "2026-08-10", avail: 1.0, clinicPref: "", notes: "Ready for Kelsey (8/3)" },
]

export const seedDailyTasks: DailyTask[] = [
  { name: "CC Rep", MON: "", TUE: "", WED: "", THU: "", FRI: "" },
  { name: "Voicemail (CV)", MON: "AA/CK/ASA", TUE: "AA/CK/ASA", WED: "AA/CK/ASA", THU: "AA/CK/ASA", FRI: "AA/CK/ASA" },
  { name: "Referrals", MON: "All FD", TUE: "All FD", WED: "All FD", THU: "All FD", FRI: "All FD" },
  { name: "PT Notes", MON: "STC/OB/LV", TUE: "STC/OB/LV", WED: "STC/OB/LV", THU: "STC/OB/LV", FRI: "STC/OB/LV" },
  { name: "Spanish Calls", MON: "Call Center / MAs", TUE: "Call Center / MAs", WED: "Call Center / MAs", THU: "Call Center / MAs", FRI: "Call Center / MAs" },
]

export const seedClinicRegions: Record<string, string[]> = {
  North: ["GU", "SK"],
  South: ["JO"],
  West: ["OB", "SC", "AR"],
  City: [],
}

export const seedSurgLocations: SurgLocation[] = [
  { name: "Glen Oaks", abbrev: "GOH", provider: "", notes: "" },
  { name: "Humboldt Park", abbrev: "HPH", provider: "", notes: "" },
  { name: "West Suburban", abbrev: "West Sub", provider: "", notes: "" },
]

// A fresh, fully-seeded state used when nothing is saved yet.
export function makeSeedState(): SchedulingData {
  return {
    version: 9,
    settings: { ...DEFAULT_SETTINGS },
    providers: structuredClone(seedProviders),
    currentStaff: structuredClone(seedCurrentStaff),
    incomingInterns: structuredClone(seedIncomingInterns),
    ptoEntries: [],
    scheduleOverrides: [],
    scheduleA: structuredClone(seedScheduleA),
    scheduleB: structuredClone(seedScheduleB),
    rawVolume: structuredClone(seedRawVolume),
    iaPreferences: {},
    iaExcludedClinics: {},
    iaRotationHistory: {},
    clinicMeta: structuredClone(seedClinicMeta),
    clinicOrder: [...seedClinicOrder],
    surgLocations: structuredClone(seedSurgLocations),
    surgAssignments: {},
    surgLog: [],
    staffingRules: structuredClone(seedStaffingRules),
    staffingRulesExtra: 15,
    xrtPreferences: {},
    xrtAssignments: {},
    xrtRotationHistory: {},
    dailyTasks: structuredClone(seedDailyTasks),
    recurringRules: [],
    clinicRegions: structuredClone(seedClinicRegions),
    staffRegions: {},
    onCallPASchedule: {},
    pendingScheduleA: null,
    pendingScheduleB: null,
    pendingScheduleStartDate: "",
    scheduleLocks: [],
    optimizerRules: [],
  }
}
