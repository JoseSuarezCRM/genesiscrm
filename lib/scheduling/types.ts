// Mirrors the standalone Operations Dashboard's `version: 10` export payload
// (docs/GenesisDashboard-3.html, exportData()) field-for-field, so saved org-wide
// state round-trips identically between the two.
//
// Anything the prototype keeps only for payload compatibility (scheduleLocks,
// optimizerRules, the growthPct/orientDays settings) is typed here too — dropping
// a field would silently discard it on the next save.

export type DayName = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT"

/** Per-day availability of a staff member, cycled in the roster. */
export type AvailState = "available" | "lastresort" | "unavailable"

export interface Provider {
  name: string
  init: string
  color?: string
  /** Patients per day — NH runs ~65, everyone else ~30. */
  ptsDay: number
  /** Clinic days per week; also the denominator of the A/B summary's "Xd / Yd". */
  clinicDays: number
  /** "every" | "eow" — every week, or every other week. */
  freq: string
  /** Comma-separated clinic codes; display-only legacy field. */
  clinics?: string
  mainRegion?: string
  secondRegion?: string
  /** Free-text city / area. New in v10. */
  location?: string
  /** ISO date the provider starts; before it they render as inactive. */
  start?: string
  leave?: string
  ret?: string
}

export interface StaffMember {
  name: string
  init?: string
  /** One of BASE_ROLES or a customRoles entry. */
  role: string
  /** Legacy 0–1 availability; still the source for the dayAvail migration. */
  avail?: number
  /** Per-day availability. Authoritative once migrated. */
  dayAvail?: Partial<Record<DayName, AvailState>>
  /** Full-time equivalent, 0–1. New in v10; defaults to 1.0. */
  fte?: number
  /** ISO start date. New in v10. */
  startDate?: string
  /** ISO last day; past it the person renders as inactive. */
  lastDay?: string
  lastResort?: boolean
  clinicPref?: string
  notes?: string
}

export interface IncomingStaff {
  name: string
  start?: string
  avail?: number
  role?: string
}

export interface ClinicMeta {
  full: string
  contract: string
  daysOpen: number
  /** Needs an XR tech — drives the XRT engine and the Visit Count XR badge. */
  xrNeed?: boolean
  /** Surgery sites render in their own grouped block and take no interns/XRTs. */
  isSurgery?: boolean
}

export interface PtoEntry {
  person: string
  startDate: string
  endDate: string
  note?: string
}

export type OverrideAction = "out-all" | "out-clinic" | "cover" | "late-start"

export interface ScheduleOverride {
  date: string
  init: string
  action: OverrideAction
  /** "" means all clinics (only valid for out-all). */
  clinic: string
  note?: string
  /** late-start only: "HH:MM", defaults to 11:00. New in v10. */
  time?: string
}

export type RecurringFreq = "1st" | "2nd" | "3rd" | "4th" | "last" | "every" | "every-other"

export interface RecurringRule {
  person: string
  freq: RecurringFreq
  /** 1 = Monday … 5 = Friday (JS getDay numbering). */
  dayOfWeek: number
  action: "out-all" | "out-clinic" | "at-clinic"
  clinic: string
  startDate?: string
  note?: string
}

export interface StaffingRule {
  minPts: number
  maxPts: number
  totalStaff: number
  breakdown: string
}

/** Per-day assignee lists. Legacy payloads hold strings or a single `assignees`. */
export interface DailyTask {
  name: string
  MON: string[]
  TUE: string[]
  WED: string[]
  THU: string[]
  FRI: string[]
}

export interface SurgLocation {
  name: string
  abbrev: string
  provider?: string
  notes?: string
}

export interface SurgLogEntry {
  date: string
  location: string
  locationName?: string
  intern: string
  internName?: string
  provider?: string
  notes?: string
}

export interface VolumeEntry {
  month: string
  year: number
  clinic: string
  visits: number
  _added?: boolean
}

/** clinic code -> { DAY -> provider initials } */
export type WeekSchedule = Record<string, Partial<Record<DayName, string[]>>>

/**
 * On-call PA, keyed by the week's Monday (yyyy-mm-dd). v10 stores one PA per day;
 * v9 stored a single string for the whole week, which mergeSavedState upgrades.
 */
export type OnCallWeek = Partial<Record<DayName, string>>

export interface Settings {
  targetPts: string
  daysPerMonth: string
  weeksProject: string
  calWeeks: string
  startWeek: string
  /** v10 keeps these as hidden inputs for removed analytics — no UI, but persisted. */
  growthPct: string
  orientDays: string
}

/** Inert in v10 (the optimizer was removed) but still carried in the payload. */
export interface ScheduleLock {
  [key: string]: unknown
}
export interface OptimizerRule {
  [key: string]: unknown
}

export interface SchedulingData {
  version: number
  settings: Settings

  providers: Provider[]
  currentStaff: StaffMember[]
  incomingInterns: IncomingStaff[]
  /** Role names added by hand in the roster. New in v10. */
  customRoles: string[]

  clinicMeta: Record<string, ClinicMeta>
  clinicOrder: string[]
  clinicRegions: Record<string, string[]>
  /** staff/provider key -> region name */
  staffRegions: Record<string, string>

  scheduleA: WeekSchedule
  scheduleB: WeekSchedule
  pendingScheduleA: WeekSchedule | null
  pendingScheduleB: WeekSchedule | null
  pendingScheduleStartDate: string

  ptoEntries: PtoEntry[]
  scheduleOverrides: ScheduleOverride[]
  recurringRules: RecurringRule[]
  dailyTasks: DailyTask[]
  onCallPASchedule: Record<string, OnCallWeek>
  /** Free-text cell notes on the Full Schedule grid, keyed "CLINIC-DAY-WEEKTYPE". New in v10. */
  msNotes: Record<string, string>

  staffingRules: StaffingRule[]
  staffingRulesExtra: number

  iaPreferences: Record<string, string[]>
  iaExcludedClinics: Record<string, string[]>
  iaRotationHistory: Record<string, Record<string, number>>

  xrtPreferences: Record<string, string[]>
  xrtAssignments: Record<string, string>
  xrtRotationHistory: Record<string, Record<string, number>>

  surgLocations: SurgLocation[]
  surgAssignments: Record<string, string>
  surgLog: SurgLogEntry[]

  rawVolume: VolumeEntry[]

  scheduleLocks: ScheduleLock[]
  optimizerRules: OptimizerRule[]
}
