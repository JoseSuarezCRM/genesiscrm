import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import DuplicateManager from "@/components/duplicate-manager"

// Words that are too common to count as a meaningful shared prefix
const STOP_WORDS = new Set([
  "the", "and", "of", "at", "in", "for", "de", "la", "los", "las",
  "health", "medical", "clinic", "care", "center", "centre", "group",
  "associates", "services", "practice", "office", "institute",
])

function normalizeName(s: string) {
  return s
    .toLowerCase()
    .replace(/[.,\-']/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeAddress(s: string) {
  return s
    .toLowerCase()
    .replace(/\b(\d{5})-\d{4}\b/, "$1")
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

type MatchReason = "exact" | "similar"

/**
 * Returns the match reason if the two names are considered duplicates, or null if not.
 * - "exact"   : identical after normalization
 * - "similar" : share a meaningful leading word (≥5 chars, not a stop word)
 *               OR one name starts with the other's full normalized form
 */
function matchReason(a: string, b: string): MatchReason | null {
  const na = normalizeName(a)
  const nb = normalizeName(b)

  if (na === nb) return "exact"

  // One is a prefix of the other (e.g. "VNA Health" vs "VNA Health Care Peds")
  if (na.startsWith(nb + " ") || nb.startsWith(na + " ")) return "similar"

  // Shared first meaningful word (≥5 chars and not a generic stop word)
  const firstA = na.split(" ")[0]
  const firstB = nb.split(" ")[0]
  if (
    firstA === firstB &&
    firstA.length >= 5 &&
    !STOP_WORDS.has(firstA)
  ) {
    return "similar"
  }

  return null
}

export default async function DuplicatesPage() {
  const session = await auth()
  if ((session?.user as { role?: string })?.role !== "ADMIN") {
    redirect("/")
  }

  const practices = await prisma.referringPractice.findMany({
    select: {
      id: true,
      name: true,
      address: true,
      _count: { select: { referrals: true } },
      locations: {
        select: {
          id: true,
          name: true,
          address: true,
          _count: { select: { referrals: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  })

  const doctors = await prisma.referringDoctor.findMany({
    select: {
      id: true,
      name: true,
      title: true,
      practiceId: true,
      practice: { select: { id: true, name: true } },
      _count: { select: { referrals: true } },
    },
    orderBy: { name: "asc" },
  })

  // --- Detect duplicate practices ---
  type PracticeRow = (typeof practices)[number]
  const practicePairs: { a: PracticeRow; b: PracticeRow; reason: MatchReason }[] = []
  for (let i = 0; i < practices.length; i++) {
    for (let j = i + 1; j < practices.length; j++) {
      const reason = matchReason(practices[i].name, practices[j].name)
      if (reason) practicePairs.push({ a: practices[i], b: practices[j], reason })
    }
  }

  // --- Detect duplicate locations within the same practice ---
  type LocationRow = PracticeRow["locations"][number]
  const locationPairs: {
    practice: Pick<PracticeRow, "id" | "name">
    a: LocationRow
    b: LocationRow
    reason: MatchReason
  }[] = []
  for (const practice of practices) {
    const locs = practice.locations
    for (let i = 0; i < locs.length; i++) {
      for (let j = i + 1; j < locs.length; j++) {
        const addrA = locs[i].address ? normalizeAddress(locs[i].address!) : null
        const addrB = locs[j].address ? normalizeAddress(locs[j].address!) : null
        if (addrA && addrB && addrA === addrB) {
          locationPairs.push({
            practice: { id: practice.id, name: practice.name },
            a: locs[i],
            b: locs[j],
            reason: "exact",
          })
        }
      }
    }
  }

  // --- Detect duplicate providers (by name, across all practices) ---
  type DoctorRow = (typeof doctors)[number]
  const doctorPairs: { a: DoctorRow; b: DoctorRow; reason: MatchReason }[] = []
  for (let i = 0; i < doctors.length; i++) {
    for (let j = i + 1; j < doctors.length; j++) {
      const reason = matchReason(doctors[i].name, doctors[j].name)
      if (reason) doctorPairs.push({ a: doctors[i], b: doctors[j], reason })
    }
  }

  const total = practicePairs.length + locationPairs.length + doctorPairs.length

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Duplicate Detection</h1>
        <p className="text-sm text-slate-500">
          {total === 0
            ? "No potential duplicates found."
            : `${total} potential duplicate${total !== 1 ? "s" : ""} flagged across practices, locations, and providers.`}
        </p>
      </div>

      <DuplicateManager
        practicePairs={practicePairs as any}
        locationPairs={locationPairs as any}
        doctorPairs={doctorPairs as any}
      />
    </div>
  )
}
