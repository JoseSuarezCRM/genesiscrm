// Data model for the native Operations Planner ("Scheduling v2"). Mirrors the
// original standalone dashboard's `version: 9` export payload field-for-field so
// saved org-wide state round-trips identically.

export type DayName = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT"

export type DaySchedule = Record<string, string[]> // dayName -> provider inits
export type WeekSchedule = Record<string, DaySchedule> // clinicCode -> DaySchedule

export interface Provider {
  name: string
  init: string
  ptsDay: number
  clinicDays: number
  freq: "every" | "eow"
  clinics: string
  mainRegion?: string
  secondRegion?: string
  leave: string
  ret: string
  start: string
  color: string
}

export type AvailState = "available" | "lastresort" | "unavailable"

export interface StaffMember {
  name: string
  init: string
  role: string
  lastDay: string
  avail: number
  clinicPref?: string
  notes: string
  lastResort?: boolean
  dayAvail?: Partial<Record<DayName, AvailState>>
}

export interface IncomingStaff {
  name: string
  start: string
  avail: number
  clinicPref?: string
  notes: string
}

export interface ClinicMeta {
  full: string
  contract: string
  daysOpen: number
  xrNeed: boolean
  isSurgery?: boolean
}

export interface PtoEntry {
  person: string
  startDate: string
  endDate: string
  note: string
}

export interface ScheduleOverride {
  date: string
  init: string
  action: "out-all" | "out-clinic" | "cover"
  clinic: string
  note: string
}

export interface RecurringRule {
  person: string
  freq: "1st" | "2nd" | "3rd" | "4th" | "last" | "every" | "every-other"
  dayOfWeek: number
  action: "out-all" | "out-clinic" | "at-clinic"
  clinic: string
  startDate: string
  note: string
}

export interface VolumeEntry {
  month: string
  year: number
  clinic: string
  visits: number
  _added?: boolean
}

export interface StaffingRule {
  minPts: number
  maxPts: number
  totalStaff: number
  breakdown: string
}

export interface DailyTask {
  name: string
  MON: string[] | string
  TUE: string[] | string
  WED: string[] | string
  THU: string[] | string
  FRI: string[] | string
}

export interface SurgLocation {
  name: string
  abbrev: string
  provider: string
  notes: string
}

export interface SurgLogEntry {
  date: string
  location: string
  locationName?: string
  intern: string
  internName?: string
  provider: string
  notes: string
}

export interface ScheduleLock {
  init: string
  clinic: string
  day: DayName
  week: "A" | "B" | "both"
}

export interface OptimizerRule {
  type: "unique-clinics" | "max-days-at-clinic" | "single-clinic-only" | "same-region" | "no-clinic"
  target: string
  extra: number
  clinic: string
}

export interface Settings {
  targetPts: string
  daysPerMonth: string
  growthPct: string
  weeksProject: string
  orientDays: string
  calWeeks: string
  startWeek: string
}

// The full persisted state (excludes week-scoped ephemera like iaVolumes/iaAssignments).
export interface SchedulingData {
  version?: number
  settings: Settings
  providers: Provider[]
  currentStaff: StaffMember[]
  incomingInterns: IncomingStaff[]
  ptoEntries: PtoEntry[]
  scheduleOverrides: ScheduleOverride[]
  scheduleA: WeekSchedule
  scheduleB: WeekSchedule
  rawVolume: VolumeEntry[]
  iaPreferences: Record<string, string[]>
  iaExcludedClinics: Record<string, string[]>
  iaRotationHistory: Record<string, Record<string, number>>
  clinicMeta: Record<string, ClinicMeta>
  clinicOrder: string[]
  surgLocations: SurgLocation[]
  surgAssignments: Record<string, string>
  surgLog: SurgLogEntry[]
  staffingRules: StaffingRule[]
  staffingRulesExtra: number
  xrtPreferences: Record<string, string[]>
  xrtAssignments: Record<string, string>
  xrtRotationHistory: Record<string, Record<string, number>>
  dailyTasks: DailyTask[]
  recurringRules: RecurringRule[]
  clinicRegions: Record<string, string[]>
  staffRegions: Record<string, string>
  onCallPASchedule: Record<string, Record<string, string> | string>
  pendingScheduleA: WeekSchedule | null
  pendingScheduleB: WeekSchedule | null
  pendingScheduleStartDate: string
  scheduleLocks: ScheduleLock[]
  optimizerRules: OptimizerRule[]
}
