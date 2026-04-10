"use client"

import { useState, useTransition } from "react"
import { mergePractice, mergeLocation, mergeDoctor } from "@/app/actions/referring-doctors"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, Building2, MapPin, User, Check, Loader2, X } from "lucide-react"

// ─── Types ───────────────────────────────────────────────────────────────────

interface PracticeItem {
  id: string
  name: string
  address: string | null
  _count: { referrals: number }
}

interface LocationItem {
  id: string
  name: string
  address: string | null
  _count: { referrals: number }
}

interface DoctorItem {
  id: string
  name: string
  title: string | null
  practice: { id: string; name: string }
  _count: { referrals: number }
}

interface Props {
  practicePairs: { a: PracticeItem; b: PracticeItem }[]
  locationPairs: { practice: { id: string; name: string }; a: LocationItem; b: LocationItem }[]
  doctorPairs: { a: DoctorItem; b: DoctorItem }[]
}

// ─── Merge dialog ─────────────────────────────────────────────────────────────

type MergeKind = "practice" | "location" | "doctor"

interface MergeTarget {
  kind: MergeKind
  a: { id: string; label: string; sub?: string; referrals: number }
  b: { id: string; label: string; sub?: string; referrals: number }
  pairKey: string
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DuplicateManager({ practicePairs, locationPairs, doctorPairs }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [mergeTarget, setMergeTarget] = useState<MergeTarget | null>(null)
  const [keepId, setKeepId] = useState<string>("")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [merged, setMerged] = useState<Set<string>>(new Set())

  function dismiss(key: string) {
    setDismissed((prev) => new Set([...prev, key]))
  }

  function openMerge(target: MergeTarget) {
    setMergeTarget(target)
    // Default: keep the one with more referrals
    setKeepId(target.a.referrals >= target.b.referrals ? target.a.id : target.b.id)
    setError(null)
  }

  function handleMerge() {
    if (!mergeTarget || !keepId) return
    const { kind, a, b, pairKey } = mergeTarget
    const sourceId = keepId === a.id ? b.id : a.id

    startTransition(async () => {
      let result: { error?: string | null } | undefined

      if (kind === "practice") result = await mergePractice(sourceId, keepId)
      else if (kind === "location") result = await mergeLocation(sourceId, keepId)
      else if (kind === "doctor") result = await mergeDoctor(sourceId, keepId)

      if (result?.error) {
        setError(result.error)
      } else {
        setMerged((prev) => new Set([...prev, pairKey]))
        setMergeTarget(null)
        setSuccess(`Merged successfully.`)
        setTimeout(() => setSuccess(null), 4000)
      }
    })
  }

  const visiblePracticePairs = practicePairs.filter(
    ({ a, b }) => !dismissed.has(`p-${a.id}-${b.id}`) && !merged.has(`p-${a.id}-${b.id}`)
  )
  const visibleLocationPairs = locationPairs.filter(
    ({ a, b }) => !dismissed.has(`l-${a.id}-${b.id}`) && !merged.has(`l-${a.id}-${b.id}`)
  )
  const visibleDoctorPairs = doctorPairs.filter(
    ({ a, b }) => !dismissed.has(`d-${a.id}-${b.id}`) && !merged.has(`d-${a.id}-${b.id}`)
  )

  const totalVisible = visiblePracticePairs.length + visibleLocationPairs.length + visibleDoctorPairs.length

  return (
    <>
      {success && (
        <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          <Check className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      {totalVisible === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50">
          <Check className="h-10 w-10 text-green-400 mb-3" />
          <p className="font-medium text-slate-700">No duplicates to review</p>
          <p className="text-sm text-slate-500 mt-1">All records look clean.</p>
        </div>
      )}

      {/* ── Practices ──────────────────────────────── */}
      {visiblePracticePairs.length > 0 && (
        <section className="space-y-3">
          <SectionHeader icon={Building2} label="Organizations / Practices" count={visiblePracticePairs.length} />
          {visiblePracticePairs.map(({ a, b }) => {
            const key = `p-${a.id}-${b.id}`
            return (
              <DuplicateCard
                key={key}
                a={{ id: a.id, label: a.name, sub: a.address ?? undefined, referrals: a._count.referrals }}
                b={{ id: b.id, label: b.name, sub: b.address ?? undefined, referrals: b._count.referrals }}
                onMerge={() =>
                  openMerge({
                    kind: "practice",
                    pairKey: key,
                    a: { id: a.id, label: a.name, referrals: a._count.referrals },
                    b: { id: b.id, label: b.name, referrals: b._count.referrals },
                  })
                }
                onDismiss={() => dismiss(key)}
              />
            )
          })}
        </section>
      )}

      {/* ── Locations ──────────────────────────────── */}
      {visibleLocationPairs.length > 0 && (
        <section className="space-y-3">
          <SectionHeader icon={MapPin} label="Locations (same practice)" count={visibleLocationPairs.length} />
          {visibleLocationPairs.map(({ practice, a, b }) => {
            const key = `l-${a.id}-${b.id}`
            return (
              <DuplicateCard
                key={key}
                context={`Practice: ${practice.name}`}
                a={{ id: a.id, label: a.name, sub: a.address ?? undefined, referrals: a._count.referrals }}
                b={{ id: b.id, label: b.name, sub: b.address ?? undefined, referrals: b._count.referrals }}
                onMerge={() =>
                  openMerge({
                    kind: "location",
                    pairKey: key,
                    a: { id: a.id, label: a.name, sub: practice.name, referrals: a._count.referrals },
                    b: { id: b.id, label: b.name, sub: practice.name, referrals: b._count.referrals },
                  })
                }
                onDismiss={() => dismiss(key)}
              />
            )
          })}
        </section>
      )}

      {/* ── Providers ──────────────────────────────── */}
      {visibleDoctorPairs.length > 0 && (
        <section className="space-y-3">
          <SectionHeader icon={User} label="Providers" count={visibleDoctorPairs.length} />
          {visibleDoctorPairs.map(({ a, b }) => {
            const key = `d-${a.id}-${b.id}`
            return (
              <DuplicateCard
                key={key}
                a={{
                  id: a.id,
                  label: [a.name, a.title].filter(Boolean).join(", "),
                  sub: a.practice.name,
                  referrals: a._count.referrals,
                }}
                b={{
                  id: b.id,
                  label: [b.name, b.title].filter(Boolean).join(", "),
                  sub: b.practice.name,
                  referrals: b._count.referrals,
                }}
                onMerge={() =>
                  openMerge({
                    kind: "doctor",
                    pairKey: key,
                    a: { id: a.id, label: a.name, sub: a.practice.name, referrals: a._count.referrals },
                    b: { id: b.id, label: b.name, sub: b.practice.name, referrals: b._count.referrals },
                  })
                }
                onDismiss={() => dismiss(key)}
              />
            )
          })}
        </section>
      )}

      {/* ── Merge confirm dialog ─────────────────── */}
      <Dialog open={!!mergeTarget} onOpenChange={(o) => !o && setMergeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge Duplicates</DialogTitle>
          </DialogHeader>

          {mergeTarget && (
            <div className="space-y-4 py-1">
              <p className="text-sm text-slate-500">
                Choose which record to <strong>keep</strong>. The other will be deleted and all its referrals,
                locations, and links will be transferred.
              </p>

              {[mergeTarget.a, mergeTarget.b].map((item) => (
                <label
                  key={item.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    keepId === item.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="keep"
                    value={item.id}
                    checked={keepId === item.id}
                    onChange={() => setKeepId(item.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 text-sm">{item.label}</p>
                    {item.sub && <p className="text-xs text-slate-500 mt-0.5">{item.sub}</p>}
                    <Badge variant="secondary" className="mt-1 text-xs">
                      {item.referrals} referral{item.referrals !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  {keepId === item.id && <Check className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />}
                </label>
              ))}

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleMerge} disabled={isPending || !keepId}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  label,
  count,
}: {
  icon: React.ElementType
  label: string
  count: number
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-slate-500" />
      <h2 className="font-semibold text-slate-700 text-sm">{label}</h2>
      <Badge variant="destructive" className="text-xs">
        {count} flagged
      </Badge>
    </div>
  )
}

function DuplicateCard({
  a,
  b,
  context,
  onMerge,
  onDismiss,
}: {
  a: { id: string; label: string; sub?: string; referrals: number }
  b: { id: string; label: string; sub?: string; referrals: number }
  context?: string
  onMerge: () => void
  onDismiss: () => void
}) {
  return (
    <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        {context && <p className="text-xs text-slate-500 font-medium">{context}</p>}
        <div className="grid grid-cols-2 gap-3">
          <RecordCard item={a} />
          <RecordCard item={b} />
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <Button size="sm" variant="outline" className="text-xs h-8 bg-white" onClick={onMerge}>
          Merge
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-xs h-8 text-slate-400 hover:text-slate-600"
          title="Dismiss"
          onClick={onDismiss}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

function RecordCard({ item }: { item: { id: string; label: string; sub?: string; referrals: number } }) {
  return (
    <div className="bg-white border border-amber-100 rounded-lg px-3 py-2 min-w-0">
      <p className="font-medium text-sm text-slate-800 truncate">{item.label}</p>
      {item.sub && <p className="text-xs text-slate-500 truncate mt-0.5">{item.sub}</p>}
      <p className="text-xs text-slate-400 mt-1">{item.referrals} referral{item.referrals !== 1 ? "s" : ""}</p>
    </div>
  )
}
