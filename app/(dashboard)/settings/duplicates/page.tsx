import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import DuplicateManager from "@/components/duplicate-manager"

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
  const practicePairs: { a: PracticeRow; b: PracticeRow }[] = []
  for (let i = 0; i < practices.length; i++) {
    for (let j = i + 1; j < practices.length; j++) {
      if (normalizeName(practices[i].name) === normalizeName(practices[j].name)) {
        practicePairs.push({ a: practices[i], b: practices[j] })
      }
    }
  }

  // --- Detect duplicate locations within the same practice ---
  type LocationRow = PracticeRow["locations"][number]
  const locationPairs: { practice: Pick<PracticeRow, "id" | "name">; a: LocationRow; b: LocationRow }[] = []
  for (const practice of practices) {
    const locs = practice.locations
    for (let i = 0; i < locs.length; i++) {
      for (let j = i + 1; j < locs.length; j++) {
        const addrA = locs[i].address ? normalizeAddress(locs[i].address!) : null
        const addrB = locs[j].address ? normalizeAddress(locs[j].address!) : null
        if (addrA && addrB && addrA === addrB) {
          locationPairs.push({ practice: { id: practice.id, name: practice.name }, a: locs[i], b: locs[j] })
        }
      }
    }
  }

  // --- Detect duplicate providers (by normalized name, across all practices) ---
  type DoctorRow = (typeof doctors)[number]
  const doctorPairs: { a: DoctorRow; b: DoctorRow }[] = []
  for (let i = 0; i < doctors.length; i++) {
    for (let j = i + 1; j < doctors.length; j++) {
      if (normalizeName(doctors[i].name) === normalizeName(doctors[j].name)) {
        doctorPairs.push({ a: doctors[i], b: doctors[j] })
      }
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
