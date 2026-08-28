"use client"

import { useState, useTransition, useEffect, useRef } from "react"
import Link from "next/link"
import { Phone, ChevronDown, ChevronUp, Loader2, Columns3 } from "lucide-react"
import BulkActionBar, { bulkBtn } from "@/components/ui/bulk-action-bar"
import { useColumnResize, ColResizer } from "@/components/ui/use-column-resize"
import ColumnChooserModal from "@/components/ui/column-chooser"
import { associationColumns, readAssocValue, type AssociationGroup } from "@/lib/association-columns"
import { PipelineChip } from "@/components/pipeline-chip"
import { useColumnPrefs } from "@/components/ui/use-column-prefs"
import { useCardReorder } from "@/components/use-card-reorder"
import { frozenMap, frozenHeadStyle, frozenCellStyle, frozenClass } from "@/lib/frozen-columns"
import { cn } from "@/lib/utils"
import { StatusBadge } from "@/components/status-badge"
import { OptionValue } from "@/components/option-value"
import { formatNumber } from "@/lib/number-format"
import { formatDate, formatPhone, STATUS_LABELS } from "@/lib/utils"
import { EditableCell } from "@/components/ui/editable-cell"
import { cpToFieldDef } from "@/lib/cp-field-def"
import { updateRecordField } from "@/app/actions/record-fields"
import { setRecordOwner } from "@/app/actions/record-owner"
import { type RecordFieldDef } from "@/lib/record-field-catalog"
import { moveReferralsToPipeline, bulkUpdateStatus } from "@/app/actions/referrals"
import { bulkAddTag, bulkRemoveTag } from "@/app/actions/tags"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Tag as TagIcon } from "lucide-react"

interface Pipeline {
  id: string
  name: string
  color: string
}

interface Tag {
  id: string
  name: string
  color: string
}

interface CustomPropertyDef {
  id: string
  name: string
  type: string
  optionLabels?: Record<string, string> | null
  optionColors?: Record<string, string> | null
  optionStyle?: string | null
  numberFormat?: string | null
}

interface Referral {
  id: string
  patientFirstName: string
  patientLastName: string
  patientPhone: string | null
  patientEmail: string | null
  patientMrn: string | null
  genesisMrn: string | null
  patientDob: string | Date | null
  referringDoctorName: string | null
  referringNpi: string | null
  referringPhone: string | null
  referringAddress: string | null
  insuranceProvider: string | null
  insuranceMemberId: string | null
  insuranceGroup: string | null
  authStatus: string | null
  imagingType: string | null
  pipelineId: string | null
  notes: string | null
  assignedTo: { id: string; name: string | null; email: string } | null
  customProperties: Record<string, any> | null
  referringPractice: { name: string } | null
  referringDoctor: { name: string | null; title: string | null; specialty: string | null; npi: string | null; phone: string | null } | null
  referringLocation: { name: string | null; address: string | null } | null
  tags: { tag: Tag }[]
  referralDate: string | Date
  appointmentDate: string | Date | null
  status: string
  _count: { callAttempts: number }
}

interface Props {
  referrals: Referral[]
  pipelines: Pipeline[]
  pipelineColorStyle?: string
  allTags: Tag[]
  customProps?: CustomPropertyDef[]
  associations?: AssociationGroup[]
  listUrl: string
  total: number
  allMatchingIds: string[]
  canEdit?: boolean
  users?: { id: string; label: string }[]
}

// Editable native referral columns → the Prisma column to patch + its field type.
// (Relations/computed/status keep their read-only renderers.)
const REFERRAL_EDIT: Record<string, RecordFieldDef & { field: string; get: (r: Referral) => any }> = {
  phone: { key: "phone", field: "patientPhone", label: "Phone", type: "phone", get: (r) => r.patientPhone },
  email: { key: "email", field: "patientEmail", label: "Email", type: "email", get: (r) => r.patientEmail },
  mrn: { key: "mrn", field: "patientMrn", label: "Referring MRN", type: "text", get: (r) => r.patientMrn },
  genesisMrn: { key: "genesisMrn", field: "genesisMrn", label: "Genesis MRN", type: "text", get: (r) => r.genesisMrn },
  dob: { key: "dob", field: "patientDob", label: "Date of Birth", type: "date", get: (r) => r.patientDob },
  providerName: { key: "providerName", field: "referringDoctorName", label: "Provider Name", type: "text", get: (r) => r.referringDoctor?.name ?? r.referringDoctorName },
  npi: { key: "npi", field: "referringNpi", label: "Referring NPI", type: "text", get: (r) => r.referringDoctor?.npi ?? r.referringNpi },
  referringPhone: { key: "referringPhone", field: "referringPhone", label: "Referring Phone", type: "phone", get: (r) => r.referringDoctor?.phone ?? r.referringPhone },
  referringAddress: { key: "referringAddress", field: "referringAddress", label: "Referring Address", type: "text", get: (r) => r.referringLocation?.address ?? r.referringAddress },
  insurance: { key: "insurance", field: "insuranceProvider", label: "Insurance", type: "text", get: (r) => r.insuranceProvider },
  insuranceMemberId: { key: "insuranceMemberId", field: "insuranceMemberId", label: "Insurance Member ID", type: "text", get: (r) => r.insuranceMemberId },
  insuranceGroup: { key: "insuranceGroup", field: "insuranceGroup", label: "Insurance Group", type: "text", get: (r) => r.insuranceGroup },
  authStatus: { key: "authStatus", field: "authStatus", label: "Auth Status", type: "text", get: (r) => r.authStatus },
  imagingType: { key: "imagingType", field: "imagingType", label: "Imaging Type", type: "text", get: (r) => r.imagingType },
  notes: { key: "notes", field: "notes", label: "Notes", type: "long_text", get: (r) => r.notes },
  referralDate: { key: "referralDate", field: "referralDate", label: "Referral Date", type: "date", get: (r) => r.referralDate },
  apptDate: { key: "apptDate", field: "appointmentDate", label: "Appt Date", type: "date", get: (r) => r.appointmentDate },
}

// Every choosable referral column — special/computed + native fields (custom
// properties are appended at runtime). Only server-supported keys are sortable.
const STATIC_REFERRAL_COLUMNS: { key: string; label: string; sortable?: boolean }[] = [
  { key: "patient", label: "Patient", sortable: true },
  { key: "phone", label: "Phone", sortable: true },
  { key: "email", label: "Email" },
  { key: "mrn", label: "Referring MRN" },
  { key: "genesisMrn", label: "Genesis MRN" },
  { key: "dob", label: "Date of Birth" },
  { key: "practice", label: "Referring Practice", sortable: true },
  { key: "providerName", label: "Provider Name" },
  { key: "npi", label: "Referring NPI" },
  { key: "referringPhone", label: "Referring Phone" },
  { key: "referringAddress", label: "Referring Address" },
  { key: "insurance", label: "Insurance" },
  { key: "insuranceMemberId", label: "Insurance Member ID" },
  { key: "insuranceGroup", label: "Insurance Group" },
  { key: "authStatus", label: "Auth Status" },
  { key: "imagingType", label: "Imaging Type" },
  { key: "pipeline", label: "Pipeline" },
  { key: "assignedTo", label: "Assigned To" },
  { key: "tags", label: "Tags" },
  { key: "referralDate", label: "Referral Date", sortable: true },
  { key: "apptDate", label: "Appt Date", sortable: true },
  { key: "calls", label: "Calls", sortable: true },
  { key: "notes", label: "Notes" },
  { key: "status", label: "Status", sortable: true },
]
export const DEFAULT_REFERRAL_COLS = ["patient", "phone", "practice", "tags", "referralDate", "apptDate", "calls", "status"]
const REFERRAL_COL_W: Record<string, number> = {
  patient: 200, phone: 150, email: 200, mrn: 140, genesisMrn: 140, dob: 130, practice: 220,
  providerName: 180, npi: 140, referringPhone: 150, referringAddress: 220, insurance: 170,
  insuranceMemberId: 170, insuranceGroup: 150, authStatus: 140, imagingType: 150, pipeline: 150,
  assignedTo: 160, tags: 180, referralDate: 130, apptDate: 130, calls: 90, notes: 240, status: 150,
}

export default function ReferralTable({ referrals, pipelines, pipelineColorStyle = "dot", allTags, customProps = [], associations = [], listUrl, total, allMatchingIds, canEdit = false, users = [] }: Props) {
  const ownerUserMap = Object.fromEntries(users.map((u) => [u.id, u.label]))
  // Full column catalog = static columns + every referral custom property.
  const { columns: assocColumns, byKey: assocByKey } = associationColumns(associations)
  const REFERRAL_COLUMNS = [...STATIC_REFERRAL_COLUMNS, ...customProps.map((p) => ({ key: `cp_${p.id}`, label: p.name })), ...assocColumns]
  const cpDefById = Object.fromEntries(customProps.map((p) => [p.id, p]))
  const pipelineNameById = Object.fromEntries(pipelines.map((p) => [p.id, p.name]))
  const pipelineById = Object.fromEntries(pipelines.map((p) => [p.id, p]))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [allPagesSelected, setAllPagesSelected] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [tagAddOpen, setTagAddOpen] = useState(false)
  const [tagRemoveOpen, setTagRemoveOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const menuRef = useRef<HTMLDivElement>(null)
  const tagAddRef = useRef<HTMLDivElement>(null)
  const tagRemoveRef = useRef<HTMLDivElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const headerCheckRef = useRef<HTMLInputElement>(null)
  const { colWidth, startResize } = useColumnResize("referralColWidths")
  const { columns: visibleCols, frozen: frozenCount, apply: applyCols, setColumns: setVisibleCols } = useColumnPrefs("referralCols", DEFAULT_REFERRAL_COLS)
  // Re-apply column prefs when a saved view is applied (the views bar writes them
  // to localStorage and dispatches this event before navigating).
  useEffect(() => {
    const onApplied = () => {
      try {
        const r = JSON.parse(localStorage.getItem("referralCols") || "null")
        if (r && Array.isArray(r.columns)) applyCols(r.columns, typeof r.frozen === "number" ? r.frozen : 0)
      } catch {}
    }
    window.addEventListener("referral-view-applied", onApplied)
    return () => window.removeEventListener("referral-view-applied", onApplied)
  }, [applyCols])
  const [colModalOpen, setColModalOpen] = useState(false)
  // Render in the user's chosen order, with the required "patient" column first.
  const orderedKeys = ["patient", ...visibleCols.filter((k) => k !== "patient")]
  const cols = (orderedKeys.map((k) => REFERRAL_COLUMNS.find((c) => c.key === k)).filter(Boolean) as { key: string; label: string; sortable?: boolean }[])
  const reorderableCols = cols.filter((c) => c.key !== "patient")
  const colReorder = useCardReorder(reorderableCols, (c) => c.key, (ids) => setVisibleCols(["patient", ...ids]))
  const orderedCols = [cols.find((c) => c.key === "patient")!, ...colReorder.order].filter(Boolean) as typeof cols
  const widthOf = (k: string) => colWidth(k) ?? REFERRAL_COL_W[k] ?? 160
  const fmap = frozenMap(orderedCols.map((c) => c.key), frozenCount, widthOf, 40)
  const cbFrozen = frozenCount > 0
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const sortKey = searchParams.get("sort") ?? "referralDate"
  const sortDir: "asc" | "desc" = searchParams.get("dir") === "asc" ? "asc" : "desc"
  // Server-side sort: update the URL (reset to page 1) so it covers all pages.
  // Text columns start A→Z; date/number columns start newest/highest first.
  const DESC_FIRST = new Set(["referralDate", "apptDate", "calls"])
  function toggleSort(key: string) {
    const params = new URLSearchParams(searchParams.toString())
    const nextDir = sortKey === key ? (sortDir === "asc" ? "desc" : "asc") : (DESC_FIRST.has(key) ? "desc" : "asc")
    params.set("sort", key); params.set("dir", nextDir); params.set("page", "1")
    router.push(`${pathname}?${params.toString()}`)
  }

  const allPageChecked = referrals.length > 0 && referrals.every((r) => selected.has(r.id))
  const allChecked = allPageChecked
  const someChecked = selected.size > 0 && !allPageChecked
  const showSelectAllBanner = allPageChecked && !allPagesSelected && total > referrals.length

  useEffect(() => {
    if (headerCheckRef.current) {
      headerCheckRef.current.indeterminate = someChecked
    }
  }, [someChecked])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    if (menuOpen) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [menuOpen])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (tagAddRef.current && !tagAddRef.current.contains(e.target as Node)) setTagAddOpen(false)
    }
    if (tagAddOpen) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [tagAddOpen])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (tagRemoveRef.current && !tagRemoveRef.current.contains(e.target as Node)) setTagRemoveOpen(false)
    }
    if (tagRemoveOpen) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [tagRemoveOpen])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false)
    }
    if (statusOpen) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [statusOpen])

  function toggleAll() {
    if (allPageChecked) {
      setSelected(new Set())
      setAllPagesSelected(false)
    } else {
      setSelected(new Set(referrals.map((r) => r.id)))
      setAllPagesSelected(false)
    }
  }

  function selectAllPages() {
    setSelected(new Set(allMatchingIds))
    setAllPagesSelected(true)
  }

  function clearSelection() {
    setSelected(new Set())
    setAllPagesSelected(false)
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function moveTo(pipelineId: string | null) {
    startTransition(async () => {
      await moveReferralsToPipeline(Array.from(selected), pipelineId)
      clearSelection()
      setMenuOpen(false)
      router.refresh()
    })
  }

  function addTag(tagId: string) {
    startTransition(async () => {
      await bulkAddTag(Array.from(selected), tagId)
      setTagAddOpen(false)
      router.refresh()
    })
  }

  function removeTag(tagId: string) {
    startTransition(async () => {
      await bulkRemoveTag(Array.from(selected), tagId)
      setTagRemoveOpen(false)
      router.refresh()
    })
  }

  function changeStatus(status: string) {
    startTransition(async () => {
      await bulkUpdateStatus(Array.from(selected), status as any)
      setStatusOpen(false)
      clearSelection()
      router.refresh()
    })
  }

  function renderCustomProp(r: Referral, id: string) {
    const raw = r.customProperties?.[id]
    if (raw == null || raw === "" || (Array.isArray(raw) && raw.length === 0)) return <span className="text-slate-300">—</span>
    const def = cpDefById[id]
    if (def?.type === "DROPDOWN" || def?.type === "MULTI_SELECT") return <OptionValue value={raw} optionLabels={(def as any).optionLabels} optionColors={(def as any).optionColors} optionStyle={(def as any).optionStyle} />
    if (Array.isArray(raw)) return <span className="text-slate-600">{raw.join(", ")}</span>
    if (def?.type === "NUMBER") return <span className="text-slate-600">{formatNumber(raw, (def as any).numberFormat)}</span>
    if (def?.type === "DATE" || def?.type === "DATE_TIME") return <span className="text-slate-600">{formatDate(raw)}</span>
    return <span className="text-slate-600">{String(raw)}</span>
  }

  const txt = (v: any) => <span className="text-slate-600">{v || "—"}</span>

  // For an editable column, the descriptor + current value + Prisma field to patch
  // (+ an optional read node so colored chips keep their look while editing shows a dropdown).
  function refEditable(r: Referral, key: string): { def: RecordFieldDef; value: any; field: string; read?: React.ReactNode; owner?: boolean } | null {
    if (key.startsWith("cp_")) {
      const id = key.slice(3); const p = cpDefById[id]; if (!p) return null
      return { def: cpToFieldDef(p, key), value: r.customProperties?.[id], field: key }
    }
    if (key === "assignedTo") {
      return { def: { key: "assignedTo", label: "Assigned To", type: "user" }, value: r.assignedTo?.id ?? "", field: "assignedToId", owner: true }
    }
    if (key === "status") {
      return {
        def: { key: "status", label: "Status", type: "select", options: Object.keys(STATUS_LABELS), optionLabels: STATUS_LABELS as any },
        value: r.status, field: "status", read: <StatusBadge status={r.status as any} />,
      }
    }
    const m = REFERRAL_EDIT[key]
    if (!m) return null
    const { field, get, ...def } = m
    return { def: def as RecordFieldDef, value: get(r), field }
  }

  function renderReferralCell(r: Referral, key: string) {
    if (key.startsWith("cp_")) return renderCustomProp(r, key.slice(3))
    if (assocByKey[key]) { const v = readAssocValue(r, assocByKey[key]); return v ? <span className="text-slate-600">{v}</span> : <span className="text-slate-300">—</span> }
    switch (key) {
      case "patient":
        return <Link href={`/referrals/${r.id}?from=${encodeURIComponent(listUrl)}`} className="font-medium text-slate-900 hover:text-blue-600">{r.patientFirstName} {r.patientLastName}</Link>
      case "phone": return <span className="text-slate-600">{formatPhone(r.patientPhone)}</span>
      case "email": return txt(r.patientEmail)
      case "mrn": return txt(r.patientMrn)
      case "genesisMrn": return txt(r.genesisMrn)
      case "dob": return <span className="text-slate-600">{r.patientDob ? formatDate(r.patientDob) : "—"}</span>
      case "practice": return <span className="text-slate-600">{r.referringPractice?.name ?? "—"}</span>
      case "providerName": return txt(r.referringDoctor?.name ?? r.referringDoctorName)
      case "npi": return txt(r.referringDoctor?.npi ?? r.referringNpi)
      case "referringPhone": return <span className="text-slate-600">{formatPhone(r.referringDoctor?.phone ?? r.referringPhone)}</span>
      case "referringAddress": return txt(r.referringLocation?.address ?? r.referringAddress)
      case "insurance": return txt(r.insuranceProvider)
      case "insuranceMemberId": return txt(r.insuranceMemberId)
      case "insuranceGroup": return txt(r.insuranceGroup)
      case "authStatus": return txt(r.authStatus)
      case "imagingType": return txt(r.imagingType)
      case "pipeline": {
        if (!r.pipelineId) return <span className="text-slate-300">—</span>
        const p = pipelineById[r.pipelineId]
        return p ? <PipelineChip name={p.name} color={p.color} style={pipelineColorStyle} /> : txt(pipelineNameById[r.pipelineId])
      }
      case "assignedTo": return txt(r.assignedTo?.name ?? r.assignedTo?.email)
      case "notes": return txt(r.notes)
      case "tags":
        return r.tags.length > 0
          ? <div className="flex gap-1">{r.tags.map(({ tag }) => <span key={tag.id} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium text-white shrink-0" style={{ backgroundColor: tag.color }}>{tag.name}</span>)}</div>
          : <span className="text-slate-400">—</span>
      case "referralDate": return <span className="text-slate-600">{formatDate(r.referralDate)}</span>
      case "apptDate": return <span className="text-slate-600">{formatDate(r.appointmentDate)}</span>
      case "calls":
        return r._count.callAttempts > 0
          ? <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600"><Phone className="h-3 w-3" />{r._count.callAttempts}/3</span>
          : <span className="text-slate-300 text-xs">—</span>
      case "status":
        return <StatusBadge status={r.status as any} />
      default:
        return null
    }
  }

  return (
    <>
      {/* Bulk action bar */}
      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              disabled={isPending}
              className={bulkBtn}
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  Move to pipeline
                  <ChevronDown className="h-3.5 w-3.5" />
                </>
              )}
            </button>

            {menuOpen && (
              <div className="absolute top-full mt-2 left-0 z-50 bg-white text-slate-900 rounded-xl shadow-xl border border-zinc-200 min-w-48 overflow-hidden">
                {pipelines.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => moveTo(p.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-slate-50 text-left transition-colors"
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                    {p.name}
                  </button>
                ))}
                {pipelines.length > 0 && <div className="border-t border-zinc-100" />}
                <button
                  onClick={() => moveTo(null)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-slate-50 text-left text-slate-400 transition-colors"
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-slate-300" />
                  Remove from pipeline
                </button>
              </div>
            )}
          </div>

          {allTags.length > 0 && (
            <>
              <span className="w-px h-5 bg-slate-200 mx-0.5" />

              {/* Add tag */}
              <div className="relative" ref={tagAddRef}>
                <button
                  onClick={() => { setTagAddOpen((v) => !v); setTagRemoveOpen(false) }}
                  disabled={isPending}
                  className={bulkBtn}
                >
                  <TagIcon className="h-3.5 w-3.5" />
                  Add tag
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                {tagAddOpen && (
                  <div className="absolute top-full mt-2 left-0 z-50 bg-white text-slate-900 rounded-xl shadow-xl border border-zinc-200 min-w-48 overflow-hidden">
                    <p className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide border-b border-zinc-100">Add tag to selected</p>
                    {allTags.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => addTag(t.id)}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-slate-50 text-left transition-colors"
                      >
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Remove tag */}
              <div className="relative" ref={tagRemoveRef}>
                <button
                  onClick={() => { setTagRemoveOpen((v) => !v); setTagAddOpen(false) }}
                  disabled={isPending}
                  className={bulkBtn}
                >
                  <TagIcon className="h-3.5 w-3.5" />
                  Remove tag
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                {tagRemoveOpen && (
                  <div className="absolute top-full mt-2 left-0 z-50 bg-white text-slate-900 rounded-xl shadow-xl border border-zinc-200 min-w-48 overflow-hidden">
                    <p className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide border-b border-zinc-100">Remove tag from selected</p>
                    {allTags.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => removeTag(t.id)}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-slate-50 text-left transition-colors"
                      >
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          <span className="w-px h-5 bg-slate-200 mx-0.5" />

          {/* Change status */}
          <div className="relative" ref={statusRef}>
            <button
              onClick={() => { setStatusOpen((v) => !v); setMenuOpen(false); setTagAddOpen(false); setTagRemoveOpen(false) }}
              disabled={isPending}
              className={bulkBtn}
            >
              Change status
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {statusOpen && (
              <div className="absolute top-full mt-2 left-0 z-50 bg-white text-slate-900 rounded-xl shadow-xl border border-zinc-200 min-w-48 overflow-hidden">
                <p className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide border-b border-zinc-100">Set status for selected</p>
                {[
                  { value: "NEW", label: "New" },
                  { value: "READY_FOR_CALL", label: "Ready for Call" },
                  { value: "CONTACTED", label: "Contacted" },
                  { value: "SCHEDULED", label: "Scheduled" },
                  { value: "COMPLETED", label: "Completed" },
                  { value: "NO_SHOW", label: "No Show" },
                ].map((s) => (
                  <button
                    key={s.value}
                    onClick={() => changeStatus(s.value)}
                    className="w-full flex items-center px-3 py-2.5 text-sm hover:bg-slate-50 text-left transition-colors"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

      </BulkActionBar>

      <div className="flex justify-end mb-2">
        <button onClick={() => setColModalOpen(true)}
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-600 hover:border-zinc-400">
          <Columns3 className="h-3.5 w-3.5" /> Columns <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto rounded-xl">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col style={{ width: 40 }} />
            {orderedCols.map((c) => <col key={c.key} style={{ width: widthOf(c.key) }} />)}
          </colgroup>
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <th style={cbFrozen ? { position: "sticky", left: 0, zIndex: 30 } : undefined} className={cn("px-3 py-2 w-10", cbFrozen && "bg-slate-50")}>
                <input
                  ref={headerCheckRef}
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  className="rounded border-slate-300 cursor-pointer"
                />
              </th>
              {orderedCols.map((c) => {
                const draggable = c.key !== "patient"
                return (
                  <th key={c.key}
                    {...(draggable ? { ...colReorder.handleProps(c.key), ...colReorder.cardProps(c.key) } : {})}
                    style={frozenHeadStyle(fmap.get(c.key))}
                    className={cn("text-left px-3 py-2 font-semibold relative overflow-hidden transition-colors", draggable && "cursor-grab active:cursor-grabbing", (draggable && colReorder.dragging === c.key) ? "bg-slate-200/70" : cn("hover:bg-slate-100", frozenClass(fmap.get(c.key), "bg-slate-50")))}>
                    {c.sortable ? (
                      <button onClick={() => toggleSort(c.key)} className="flex items-center gap-1 w-full min-w-0 hover:text-slate-800">
                        <span className="flex-1 min-w-0 truncate text-left">{c.label}</span>
                        {sortKey === c.key && (sortDir === "asc" ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />)}
                      </button>
                    ) : <span className="block truncate">{c.label}</span>}
                    <ColResizer onMouseDown={(e) => startResize(c.key, e)} />
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {/* Select-all-pages banner */}
            {(showSelectAllBanner || allPagesSelected) && (
              <tr>
                <td colSpan={orderedCols.length + 1} className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 text-center text-sm text-blue-800">
                  {allPagesSelected ? (
                    <>
                      All <span className="font-semibold">{total}</span> records are selected.{" "}
                      <button onClick={clearSelection} className="underline font-medium hover:text-blue-600">
                        Clear selection
                      </button>
                    </>
                  ) : (
                    <>
                      All <span className="font-semibold">{referrals.length}</span> records on this page are selected.{" "}
                      <button onClick={selectAllPages} className="underline font-medium hover:text-blue-600">
                        Select all {total} records
                      </button>
                    </>
                  )}
                </td>
              </tr>
            )}
            {referrals.length === 0 ? (
              <tr>
                <td colSpan={orderedCols.length + 1} className="px-6 py-12 text-center text-slate-400">
                  No referrals found.{" "}
                  <Link href="/referrals/new" className="text-blue-600 hover:underline">
                    Create one
                  </Link>
                  .
                </td>
              </tr>
            ) : (
              referrals.map((r) => (
                <tr
                  key={r.id}
                  className={`border-b transition-colors ${
                    selected.has(r.id) ? "bg-blue-50" : "hover:bg-slate-50"
                  }`}
                >
                  <td style={cbFrozen ? { position: "sticky", left: 0, zIndex: 10 } : undefined} className={cn("px-3 py-2.5", cbFrozen && "bg-white")}>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleRow(r.id)}
                      className="rounded border-slate-300 cursor-pointer"
                    />
                  </td>
                  {orderedCols.map((c) => {
                    const ed = canEdit ? refEditable(r, c.key) : null
                    return (
                    <td key={c.key} style={{ maxWidth: widthOf(c.key), ...frozenCellStyle(fmap.get(c.key)) }} className={cn(ed ? "p-0 align-middle" : "px-3 py-2.5 truncate", frozenClass(fmap.get(c.key)))}>
                      {ed
                        ? <EditableCell def={ed.def} value={ed.value} values={r.customProperties ?? {}} canEdit={canEdit} renderRead={ed.read}
                            users={ed.owner ? users : undefined} userMap={ed.owner ? ownerUserMap : undefined}
                            onSaveOwner={ed.owner ? (uid) => setRecordOwner("REFERRAL", r.id, uid) : undefined}
                            onSave={ed.owner ? ((uid) => setRecordOwner("REFERRAL", r.id, uid as any)) : ((v) => updateRecordField("REFERRAL", r.id, ed.field, v))} />
                        : renderReferralCell(r, c.key)}
                    </td>
                  )})}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </div>

      <ColumnChooserModal
        open={colModalOpen}
        onClose={() => setColModalOpen(false)}
        columns={REFERRAL_COLUMNS}
        required={["patient"]}
        selected={visibleCols}
        frozen={frozenCount}
        onApply={(sel, fr) => applyCols(sel, fr)}
      />
    </>
  )
}
