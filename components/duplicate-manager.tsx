"use client"

import { useState, useTransition } from "react"
import { mergePractice, mergeLocation, mergeDoctor, mergeExactDuplicates } from "@/app/actions/referring-doctors"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, Building2, MapPin, User, Check, Loader2, X, Merge } from "lucide-react"

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

type MatchReason = "exact" | "similar"

interface Props {
  practicePairs: { a: PracticeItem; b: PracticeItem; reason: MatchReason }[]
  locationPairs: { practice: { id: string; name: string }; a: LocationItem; b: LocationItem; reason: MatchReason }[]
  doctorPairs: { a: DoctorItem; b: DoctorItem; reason: MatchReason }[]
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
  const [dismissed, setDismissed] = useState<string[]>([])
  const [mergeTarget, setMergeTarget] = useState<MergeTarget | null>(null)
  const [keepId, setKeepId] = useState<string>("")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [merged, setMerged] = useState<string[]>([])
  const [confirmMergeAll, setConfirmMergeAll] = useState(false)
  const [mergingAll, startMergeAll] = useTransition()

  function dismiss(key: string) {
    setDismissed((prev) => [...prev, key])
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
        setMerged((prev) => [...prev, pairKey])
        setMergeTarget(null)
        setSuccess(`Merged successfully.`)
        setTimeout(() => setSuccess(null), 4000)
      }
    })
  }

  const visiblePracticePairs = practicePairs.filter(
    ({ a, b }) => !dismissed.includes(`p-${a.id}-${b.id}`) && !merged.includes(`p-${a.id}-${b.id}`)
  )
  const visibleLocationPairs = locationPairs.filter(
    ({ a, b }) => !dismissed.includes(`l-${a.id}-${b.id}`) && !merged.includes(`l-${a.id}-${b.id}`)
  )
  const visibleDoctorPairs = doctorPairs.filter(
    ({ a, b }) => !dismissed.includes(`d-${a.id}-${b.id}`) && !merged.includes(`d-${a.id}-${b.id}`)
  )

  const totalVisible = visiblePracticePairs.length + visibleLocationPairs.length + visibleDoctorPairs.length

  // Every visible "Exact" pair, ready for a one-click batch merge. Keep the record
  // with more referrals (same default as the single-merge dialog).
  const exactPractice = visiblePracticePairs.filter((p) => p.reason === "exact")
  const exactLocation = visibleLocationPairs.filter((p) => p.reason === "exact")
  const exactDoctor = visibleDoctorPairs.filter((p) => p.reason === "exact")
  const exactCount = exactPractice.length + exactLocation.length + exactDoctor.length

  function handleMergeAllExact() {
    const keepMore = (a: { id: string; referrals: number }, b: { id: string; referrals: number }) =>
      a.referrals >= b.referrals ? { keepId: a.id, sourceId: b.id } : { keepId: b.id, sourceId: a.id }

    const pairs = [
      ...exactPractice.map(({ a, b }) => ({ kind: "practice" as const, ...keepMore({ id: a.id, referrals: a._count.referrals }, { id: b.id, referrals: b._count.referrals }) })),
      ...exactLocation.map(({ a, b }) => ({ kind: "location" as const, ...keepMore({ id: a.id, referrals: a._count.referrals }, { id: b.id, referrals: b._count.referrals }) })),
      ...exactDoctor.map(({ a, b }) => ({ kind: "doctor" as const, ...keepMore({ id: a.id, referrals: a._count.referrals }, { id: b.id, referrals: b._count.referrals }) })),
    ]
    const keys = [
      ...exactPractice.map(({ a, b }) => `p-${a.id}-${b.id}`),
      ...exactLocation.map(({ a, b }) => `l-${a.id}-${b.id}`),
      ...exactDoctor.map(({ a, b }) => `d-${a.id}-${b.id}`),
    ]

    setError(null)
    startMergeAll(async () => {
      const res = await mergeExactDuplicates(pairs)
      setConfirmMergeAll(false)
      if (res?.errors?.length) setError(`${res.errors.length} merge${res.errors.length !== 1 ? "s" : ""} failed. ${res.errors[0]}`)
      setMerged((prev) => [...prev, ...keys])
      if (res?.mergedCount) {
        setSuccess(`Merged ${res.mergedCount} exact duplicate${res.mergedCount !== 1 ? "s" : ""}.`)
        setTimeout(() => setSuccess(null), 4000)
      }
    })
  }

  return (
    <>
      {success && (
        <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          <Check className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      {exactCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-sm text-red-800 flex-1 min-w-0">
            <strong>{exactCount}</strong> exact duplicate{exactCount !== 1 ? "s" : ""} found. Merging keeps the record with more referrals and transfers everything from the other.
          </p>
          <Button size="sm" onClick={() => setConfirmMergeAll(true)} disabled={mergingAll} className="shrink-0 bg-red-600 hover:bg-red-700">
            {mergingAll ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Merge className="h-4 w-4 mr-2" />}
            Merge all exact duplicates
          </Button>
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
          {visiblePracticePairs.map(({ a, b, reason }) => {
            const key = `p-${a.id}-${b.id}`
            return (
              <DuplicateCard
                key={key}
                reason={reason}
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
          {visibleLocationPairs.map(({ practice, a, b, reason }) => {
            const key = `l-${a.id}-${b.id}`
            return (
              <DuplicateCard
                key={key}
                reason={reason}
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
          {visibleDoctorPairs.map(({ a, b, reason }) => {
            const key = `d-${a.id}-${b.id}`
            return (
              <DuplicateCard
                key={key}
                reason={reason}
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

      {/* ── Merge-all confirm dialog ─────────────── */}
      <Dialog open={confirmMergeAll} onOpenChange={(o) => !o && setConfirmMergeAll(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge all exact duplicates?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1 text-sm text-slate-600">
            <p>
              This will merge <strong>{exactCount}</strong> exact duplicate pair{exactCount !== 1 ? "s" : ""}. For each pair, the record with
              more referrals is kept and the other is deleted — its referrals, locations, and links are transferred.
            </p>
            <p className="text-slate-500">This can&apos;t be undone. &quot;Similar&quot; (amber) pairs are left untouched.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmMergeAll(false)} disabled={mergingAll}>Cancel</Button>
            <Button onClick={handleMergeAllExact} disabled={mergingAll} className="bg-red-600 hover:bg-red-700">
              {mergingAll && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Merge {exactCount} duplicate{exactCount !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
  reason,
  onMerge,
  onDismiss,
}: {
  a: { id: string; label: string; sub?: string; referrals: number }
  b: { id: string; label: string; sub?: string; referrals: number }
  context?: string
  reason: MatchReason
  onMerge: () => void
  onDismiss: () => void
}) {
  const isExact = reason === "exact"
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${isExact ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
      <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${isExact ? "text-red-400" : "text-amber-400"}`} />
      <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${isExact ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
        {isExact ? "Exact" : "Similar"}
      </span>
      {context && <span className="text-xs text-slate-400 shrink-0">{context} ·</span>}
      <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden">
        <span className="font-medium text-slate-800 truncate">{a.label}</span>
        {a.sub && <span className="text-slate-400 text-xs truncate hidden sm:inline">({a.sub})</span>}
        <span className="text-xs text-slate-400 shrink-0">{a.referrals}r</span>
        <span className="text-slate-300 shrink-0">vs</span>
        <span className="font-medium text-slate-800 truncate">{b.label}</span>
        {b.sub && <span className="text-slate-400 text-xs truncate hidden sm:inline">({b.sub})</span>}
        <span className="text-xs text-slate-400 shrink-0">{b.referrals}r</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button size="sm" variant="outline" className="text-xs h-7 px-2 bg-white" onClick={onMerge}>
          Merge
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-300 hover:text-slate-500" title="Dismiss" onClick={onDismiss}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}
