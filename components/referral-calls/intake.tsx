"use client"

/**
 * The on-call intake: paste a call (or a screenshot of it), let the rules and
 * the AI fill the form, finish it by hand, then log it and copy the text for
 * the surgeon.
 *
 * Three sources fill a field — the ported parser (instant), the AI (a second
 * or two later) and the person — and the person always wins: see
 * lib/referral-calls/merge.ts. Once a call is saved (or opened from the log)
 * every field is pinned to what was saved; anything the AI or the rules find
 * afterwards is offered as a suggestion, never applied behind the person's back.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { ImagePlus, Loader2, PhoneIncoming, RefreshCw, Sparkles, X, AlertTriangle, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import StyledSelect from "@/components/ui/styled-select"
import PropertyInput from "@/components/ui/property-input"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import { showToast, showErrorToast } from "@/components/toast"
import type { CustomObjectProperty } from "@/app/actions/custom-objects"
import type { RecordFieldDef, RecordFieldType } from "@/lib/record-field-catalog"
import { saveReferralCall } from "@/app/actions/referral-calls"
import {
  RC_BLOOD_THINNER_PICKS, RC_DECISION_MAKERS, RC_DEFAULT_STATUS, RC_OUTCOMES, RC_SOCIAL_PICKS, RC_STATUSES,
  type RcStatus,
} from "@/lib/referral-calls/constants"
import { parseReferral } from "@/lib/referral-calls/parse"
import { resolveFields, sourceKey, type AiReading, type Manual } from "@/lib/referral-calls/merge"
import { applyThinnerPick, isPickOn, toggleOutcome, toggleSocialPick } from "@/lib/referral-calls/picks"
import { fieldsToValues, valuesToFields, type RcPropId } from "@/lib/referral-calls/schema"
import { surgeonTextWithExtras, telNoteWithExtras, buildIntakeText } from "@/lib/referral-calls/text"
import { textExtrasFor, type FieldRules } from "@/lib/referral-calls/extras"
import { initialsFor } from "@/lib/referral-calls/initials"
import { normalizeDobInput, parseDob } from "@/lib/referral-calls/dob"
import { snapshotToValues, type ExtraValue, type ReferralCallSnapshot } from "@/lib/referral-calls/snapshot"
import type { FieldKey, ReferralCallFields } from "@/lib/referral-calls/types"
import { imageFromTransfer, prepareImage, releaseImage, ImageReadError, type PreparedImage } from "@/lib/referral-calls/image"
import { useExtraction, type Reading } from "./use-extraction"
import {
  Chip, ChipRow, CopyButton, CopyFallback, FieldShell, LongInput, Section, TextInput, copyText, inputClass,
  type FieldOrigin,
} from "./fields"

export interface IntakeUser { id: string; name: string | null; email: string }

export interface IntakeProps {
  me: IntakeUser
  users: IntakeUser[]
  /** Admin-added properties on the call log, in order. */
  addedProperties: CustomObjectProperty[]
  /** The saved AI rules — here for the "show in text / note" flags. */
  rules: FieldRules
  /** Current names of the intake's own properties (admins may rename them). */
  labels: Partial<Record<RcPropId, string>>
  awaiting: number
  aiEnabled: boolean
  canViewLog: boolean
  record?: { id: string; recordNumber: number | null; ownerId: string | null; snapshot: ReferralCallSnapshot }
}

const SESSION_REFRESH_MS = 5 * 60 * 1000

const isFilled = (v: unknown) =>
  v !== undefined && v !== null && v !== "" && v !== false && !(Array.isArray(v) && v.length === 0)

const PROP_TYPE: Partial<Record<CustomObjectProperty["type"], RecordFieldType>> = {
  TEXT: "text", LONG_TEXT: "long_text", NUMBER: "number", EMAIL: "email", PHONE: "text", URL: "text",
  DATE: "date", DATE_TIME: "datetime", CHECKBOX: "checkbox", DROPDOWN: "select", MULTI_SELECT: "select", USER: "user",
}

/**
 * What exists only in this tab's memory — the screenshot, the AI's reading —
 * carried across the one navigation a new call makes after its first save
 * (/on-call → /on-call/<id>). Without it the form would remount from the saved
 * record and the screenshot and the AI's reading would vanish mid-call.
 * Never persisted anywhere.
 */
interface Handoff {
  at: number
  image: PreparedImage | null
  ai: AiReading | null
  aiExtras: Record<string, ExtraValue>
  pinnedAuto: ReferralCallFields
  pinnedAiExtras: Record<string, ExtraValue>
  sourceKey: string | null
}
const handoffs = new Map<string, Handoff>()
const HANDOFF_TTL_MS = 60_000
function peekHandoff(id: string | undefined): Handoff | null {
  if (!id) return null
  const h = handoffs.get(id)
  return h && Date.now() - h.at < HANDOFF_TTL_MS ? h : null
}

function fieldDefFor(p: CustomObjectProperty): RecordFieldDef {
  return {
    key: p.id, label: p.name, type: PROP_TYPE[p.type] ?? "text", multi: p.type === "MULTI_SELECT",
    options: p.options ?? [], optionLabels: p.optionLabels, optionColors: p.optionColors, optionStyle: p.optionStyle,
    numberFormat: p.numberFormat,
  }
}

export default function ReferralCallIntake(props: IntakeProps) {
  const { me, users, addedProperties, rules, labels, awaiting, aiEnabled, canViewLog, record } = props
  const L = (id: RcPropId, fallback: string) => labels[id] ?? fallback
  const router = useRouter()
  // Read in initialisers (StrictMode may run them twice), dropped after mount.
  const [carried] = useState(() => peekHandoff(record?.id))
  useEffect(() => { if (record?.id) handoffs.delete(record.id) }, [record?.id])
  const extraIds = useMemo(() => new Set(addedProperties.map((p) => p.id)), [addedProperties])

  /* ── The source ─────────────────────────────────────────────────────────── */
  const [source, setSource] = useState(record?.snapshot.sourceText ?? "")
  const [image, setImage] = useState<PreparedImage | null>(carried?.image ?? null)
  const [imageBusy, setImageBusy] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const parsed = useMemo(() => parseReferral(source), [source])
  const currentKey = sourceKey(source, image?.key ?? null)

  /* ── What fills the fields ──────────────────────────────────────────────── */
  const [ai, setAi] = useState<AiReading | null>(carried?.ai ?? null)
  const [aiExtras, setAiExtras] = useState<Record<string, ExtraValue>>(carried?.aiExtras ?? {})
  const [manual, setManual] = useState<Manual>(() => (record ? { ...record.snapshot.fields } : {}))
  const [extrasManual, setExtrasManual] = useState<Record<string, ExtraValue>>(() => (record ? { ...record.snapshot.extras } : {}))
  // Set once the call is saved or opened: the automatic values at that moment.
  // Anything that differs from them later is a new suggestion.
  const [pinnedAuto, setPinnedAuto] = useState<ReferralCallFields | null>(() =>
    carried?.pinnedAuto ?? (record ? parseReferral(record.snapshot.sourceText) : null))
  const [pinnedAiExtras, setPinnedAiExtras] = useState<Record<string, ExtraValue>>(carried?.pinnedAiExtras ?? {})
  const pinned = pinnedAuto !== null

  const fields = useMemo(() => resolveFields(parsed, ai, manual, currentKey), [parsed, ai, manual, currentKey])
  const auto = useMemo(() => resolveFields(parsed, ai, {}, currentKey), [parsed, ai, currentKey])
  const extrasValues = useMemo(() => {
    const out: Record<string, ExtraValue> = {}
    for (const p of addedProperties) {
      if (p.id in extrasManual) out[p.id] = extrasManual[p.id]!
      else if (p.id in aiExtras) out[p.id] = aiExtras[p.id]!
    }
    return out
  }, [addedProperties, extrasManual, aiExtras])

  const aiValidFor = (k: FieldKey) =>
    !!ai && (ai.sourceKey === currentKey || parsed[k] === ai.rulesAtRequest[k]) && isFilled(ai.values[k])
  const origin = (k: FieldKey): FieldOrigin =>
    k in manual ? "manual" : aiValidFor(k) ? "ai" : isFilled(auto[k]) ? "rules" : "empty"

  const setField = useCallback(<K extends FieldKey>(k: K, v: ReferralCallFields[K]) => {
    setManual((m) => ({ ...m, [k]: v }))
  }, [])
  const suggestionFor = (k: FieldKey) =>
    !pinned && k in manual && isFilled(auto[k]) && auto[k] !== manual[k]
      ? () => setManual((m) => { const n = { ...m }; delete n[k]; return n })
      : undefined

  /* ── The rest of the call ───────────────────────────────────────────────── */
  const [status, setStatus] = useState<RcStatus>(record?.snapshot.status ?? RC_DEFAULT_STATUS)
  const [charted, setCharted] = useState(record?.snapshot.charted ?? false)
  const [surgeonEdited, setSurgeonEdited] = useState(record?.snapshot.surgeonTextEdited ?? false)
  const [surgeonDraft, setSurgeonDraft] = useState(record?.snapshot.surgeonText ?? "")
  const [epicEdited, setEpicEdited] = useState(record?.snapshot.epicNoteEdited ?? false)
  const [epicDraft, setEpicDraft] = useState(record?.snapshot.epicNote ?? "")
  const [ownerId, setOwnerId] = useState(record?.ownerId ?? me.id)
  const [recordId, setRecordId] = useState<string | null>(record?.id ?? null)
  const [recordNumber, setRecordNumber] = useState<number | null>(record?.recordNumber ?? null)
  const [baseline, setBaseline] = useState<ReferralCallSnapshot | null>(record?.snapshot ?? null)
  const [baselineOwnerId, setBaselineOwnerId] = useState<string | null>(record?.ownerId ?? null)
  const [saving, setSaving] = useState(false)
  const [dobError, setDobError] = useState<string | null>(null)

  /* ── The texts ──────────────────────────────────────────────────────────── */
  const owner = users.find((u) => u.id === ownerId) ?? me
  const prov = initialsFor(owner)
  // Built from the fields exactly as they will be stored (trimmed, DOB
  // normalised) — the same input the server rebuilds from, so the text copied
  // now is the text saved.
  const textFields = useMemo(() => valuesToFields(fieldsToValues(fields)), [fields])
  const extraLines = useMemo(() => textExtrasFor(addedProperties, rules, extrasValues), [addedProperties, rules, extrasValues])
  const builtSurgeon = useMemo(() => surgeonTextWithExtras({ ...textFields, prov }, extraLines.surgeon), [textFields, prov, extraLines])
  const builtEpic = useMemo(() => telNoteWithExtras({ ...textFields, prov }, extraLines.note), [textFields, prov, extraLines])
  const surgeonText = surgeonEdited ? surgeonDraft : builtSurgeon
  const epicNote = epicEdited ? epicDraft : builtEpic

  /* ── The AI ─────────────────────────────────────────────────────────────── */
  const onReading = useCallback((r: Reading) => {
    setAi({ sourceKey: r.key, values: { ...r.rulesAtRequest, ...r.fields }, rulesAtRequest: r.rulesAtRequest })
    setAiExtras(r.extras)
  }, [])
  const extraction = useExtraction({
    enabled: aiEnabled,
    text: source,
    image,
    initialKey: carried ? carried.sourceKey : record ? sourceKey(record.snapshot.sourceText, null) : null,
    onReading,
  })

  const addImage = useCallback(async (file: File) => {
    setImageBusy(true)
    setImageError(null)
    try {
      const img = await prepareImage(file)
      extraction.readSoon()
      setImage(img)
    } catch (e) {
      setImageError(e instanceof ImageReadError ? e.message : "That image couldn't be read.")
    } finally {
      setImageBusy(false)
    }
  }, [extraction])

  // Release a replaced screenshot's preview. Not on unmount: a handed-off
  // screenshot is still on screen after the first save's navigation.
  const shownImage = useRef<PreparedImage | null>(image)
  useEffect(() => {
    if (shownImage.current && shownImage.current !== image) releaseImage(shownImage.current)
    shownImage.current = image
  }, [image])

  /* ── Suggestions after saving ───────────────────────────────────────────── */
  const suggestions = useMemo(() => {
    if (!pinnedAuto) return { fields: [] as FieldKey[], extras: [] as string[] }
    const f = (Object.keys(auto) as FieldKey[]).filter(
      (k) => isFilled(auto[k]) && auto[k] !== pinnedAuto[k] && auto[k] !== fields[k],
    )
    const x = Object.keys(aiExtras).filter(
      (k) => isFilled(aiExtras[k]) && JSON.stringify(aiExtras[k]) !== JSON.stringify(pinnedAiExtras[k])
        && JSON.stringify(aiExtras[k]) !== JSON.stringify(extrasValues[k]),
    )
    return { fields: f, extras: x }
  }, [pinnedAuto, auto, fields, aiExtras, pinnedAiExtras, extrasValues])
  const suggestionCount = suggestions.fields.length + suggestions.extras.length

  const applySuggestions = () => {
    setManual((m) => {
      const n = { ...m }
      for (const k of suggestions.fields) (n as Record<string, unknown>)[k] = auto[k]
      return n
    })
    setExtrasManual((m) => {
      const n = { ...m }
      for (const k of suggestions.extras) n[k] = aiExtras[k]!
      return n
    })
    setPinnedAuto(auto)
    setPinnedAiExtras(aiExtras)
  }
  const dismissSuggestions = () => { setPinnedAuto(auto); setPinnedAiExtras(aiExtras) }

  /* ── Saving ─────────────────────────────────────────────────────────────── */
  const current: ReferralCallSnapshot = {
    fields, status, charted, surgeonText, surgeonTextEdited: surgeonEdited, epicNote, epicNoteEdited: epicEdited,
    sourceText: source, extras: extrasValues,
  }
  const comparable = (s: ReferralCallSnapshot) => {
    const v = snapshotToValues(s, extraIds)
    // A text that builds itself is derived, not an edit.
    if (!s.surgeonTextEdited) delete v["surgeon_text"]
    if (!s.epicNoteEdited) delete v["epic_note"]
    return JSON.stringify(v)
  }
  const hasContent = !!source.trim() || !!image || Object.values(fields).some(isFilled) || Object.values(extrasValues).some(isFilled)
  const dirty = baseline
    ? comparable(current) !== comparable(baseline) || ownerId !== baselineOwnerId
    : hasContent

  const save = async (opts: { copySurgeon?: boolean } = {}) => {
    // Start the clipboard write inside the tap itself; iOS refuses it after an await.
    const copied = opts.copySurgeon ? copyText(surgeonText) : null
    if (saving) return
    const dob = fields.dob.trim()
    if (dob && !parseDob(dob)) {
      setDobError("Not a valid date — use MM/DD/YYYY")
      showErrorToast("Check the date of birth. Nothing was saved.")
      return
    }
    setDobError(null)
    setSaving(true)
    let res: Awaited<ReturnType<typeof saveReferralCall>>
    try {
      res = await saveReferralCall({
        recordId: recordId ?? undefined,
        ownerId,
        current,
        baseline,
        baselineOwnerId,
      })
    } catch {
      res = { ok: false, error: "The call couldn't be saved. Check your connection and try again." }
    } finally {
      setSaving(false)
    }
    if (!res.ok) {
      if (res.fieldErrors?.dob) setDobError(res.fieldErrors.dob)
      showErrorToast(res.error)
      return
    }
    const wasNew = !recordId
    const didCopy = copied ? await copied : false
    const saved = wasNew ? "Call logged" : "Call updated"
    showToast(copied ? (didCopy ? `Surgeon text copied · ${saved.toLowerCase()}` : `${saved} — copy the text below`) : saved)
    if (wasNew) {
      // Give the call its own address. The form remounts there from the saved
      // record; what only lives in memory rides along.
      handoffs.set(res.id, {
        at: Date.now(), image, ai, aiExtras, pinnedAuto: auto, pinnedAiExtras: aiExtras,
        // A reading still on its way is lost with this instance: read again there.
        sourceKey: extraction.status.phase === "reading" ? null : currentKey,
      })
      router.replace(`/on-call/${res.id}`, { scroll: false })
      return
    }
    setRecordId(res.id)
    setRecordNumber(res.recordNumber)
    setBaseline(res.snapshot)
    setBaselineOwnerId(res.ownerId)
    setOwnerId(res.ownerId)
    // Pin every field to what was saved (which may include a colleague's change).
    setManual({ ...res.snapshot.fields })
    setExtrasManual({ ...res.snapshot.extras })
    setStatus(res.snapshot.status)
    setCharted(res.snapshot.charted)
    if (res.snapshot.surgeonTextEdited) setSurgeonDraft(res.snapshot.surgeonText)
    if (res.snapshot.epicNoteEdited) setEpicDraft(res.snapshot.epicNote)
    setPinnedAuto(auto)
    setPinnedAiExtras(aiExtras)
  }

  const reset = () => {
    extraction.reset()
    setSource(""); setImage(null); setImageError(null)
    setAi(null); setAiExtras({}); setManual({}); setExtrasManual({})
    setPinnedAuto(null); setPinnedAiExtras({})
    setStatus(RC_DEFAULT_STATUS); setCharted(false)
    setSurgeonEdited(false); setSurgeonDraft(""); setEpicEdited(false); setEpicDraft("")
    setOwnerId(me.id); setRecordId(null); setRecordNumber(null); setBaseline(null); setBaselineOwnerId(null)
    setDobError(null)
    document.getElementById("rc-top")?.scrollIntoView({ block: "start" })
  }
  const newCall = () => {
    // A saved call has its own page; a new one starts on /on-call.
    if (recordId) router.push("/on-call")
    else reset()
  }
  const clear = async () => {
    if (dirty && !(await confirmDialog({
      title: recordId ? "Discard your changes?" : "Clear this call?",
      description: recordId ? "Changes since the last save will be lost. The saved call stays in the log." : "Anything not logged will be lost.",
      confirmLabel: recordId ? "Discard" : "Clear",
      destructive: true,
    }))) return
    if (recordId && baseline) {
      // Back to what was saved. The pasted source and the AI's reading stay.
      setManual({ ...baseline.fields })
      setExtrasManual({ ...baseline.extras })
      setStatus(baseline.status)
      setCharted(baseline.charted)
      setSurgeonEdited(baseline.surgeonTextEdited); setSurgeonDraft(baseline.surgeonText)
      setEpicEdited(baseline.epicNoteEdited); setEpicDraft(baseline.epicNote)
      setOwnerId(baselineOwnerId ?? me.id)
      setSource(baseline.sourceText)
      setDobError(null)
      return
    }
    reset()
  }

  /* ── Page behaviour ─────────────────────────────────────────────────────── */
  // Warn before leaving with an unsaved call.
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = "" }
    window.addEventListener("beforeunload", h)
    return () => window.removeEventListener("beforeunload", h)
  }, [dirty])

  // Typing a long call is activity: keep the session alive while the form has
  // unsaved work, so the idle logoff doesn't take the call with it.
  const { update } = useSession()
  const lastRefresh = useRef(Date.now())
  const onActivity = () => {
    if (!dirty || Date.now() - lastRefresh.current < SESSION_REFRESH_MS) return
    lastRefresh.current = Date.now()
    void update()
  }

  // Keep toasts above the sticky action bar.
  useEffect(() => {
    document.documentElement.style.setProperty("--toast-offset", "76px")
    return () => { document.documentElement.style.removeProperty("--toast-offset") }
  }, [])

  /* ── Rendering helpers ──────────────────────────────────────────────────── */
  const text = (k: Exclude<FieldKey, "urgent" | "dm">, label: string, o: { copy?: boolean; placeholder?: string; inputMode?: "numeric" | "tel" | "text"; long?: boolean; rows?: number; className?: string; autoCapitalize?: string } = {}) => (
    <FieldShell
      label={label}
      htmlFor={`rc-${k}`}
      origin={origin(k)}
      onUseSuggestion={suggestionFor(k)}
      copyValue={o.copy ? String(fields[k] ?? "") : undefined}
      className={o.className}
    >
      {o.long ? (
        <LongInput id={`rc-${k}`} value={String(fields[k] ?? "")} onChange={(v) => setField(k, v)} placeholder={o.placeholder} rows={o.rows} />
      ) : (
        <TextInput id={`rc-${k}`} value={String(fields[k] ?? "")} onChange={(v) => setField(k, v)} placeholder={o.placeholder} inputMode={o.inputMode} autoCapitalize={o.autoCapitalize} />
      )}
    </FieldShell>
  )

  const title = recordId ? `Referral call${recordNumber ? ` #${recordNumber}` : ""}` : "New referral call"
  const aiStatus = extraction.status
  const patientName = [fields.first, fields.last].filter((s) => s.trim()).join(" ")

  return (
    <div className="flex min-h-full flex-col bg-zinc-50" onInputCapture={onActivity}>
      <div id="rc-top" className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 pb-6 pt-5 sm:px-6">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <PhoneIncoming className="h-5 w-5 text-zinc-400" />
              <h1 className="truncate text-lg font-semibold tracking-tight text-zinc-900">{title}</h1>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              {saving ? "Saving…" : !recordId ? (hasContent ? "Not logged yet" : "Paste a page or your notes to start") : dirty ? "Unsaved changes" : "Saved"}
              {canViewLog && (
                <>
                  {" · "}
                  <Link href="/objects/referral-calls" className="font-medium text-zinc-700 hover:underline">
                    {awaiting} awaiting surgeon
                  </Link>
                </>
              )}
            </p>
          </div>
          <div className="w-full sm:w-56">
            <label className="mb-1 block text-xs font-medium text-zinc-500">Call taken by</label>
            <StyledSelect searchable className={cn(inputClass, "h-10")} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name || u.email}</option>
              ))}
            </StyledSelect>
          </div>
        </header>

        {suggestionCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
            <p className="flex items-center gap-2 text-sm text-violet-900">
              <Sparkles className="h-4 w-4 shrink-0" />
              {suggestionCount} new suggestion{suggestionCount === 1 ? "" : "s"} from the pasted call since it was saved.
            </p>
            <div className="flex gap-1.5">
              <button type="button" onClick={dismissSuggestions} className="h-8 rounded-lg px-3 text-xs font-medium text-violet-800 hover:bg-violet-100">Dismiss</button>
              <button type="button" onClick={applySuggestions} className="h-8 rounded-lg bg-violet-700 px-3 text-xs font-semibold text-white hover:bg-violet-800">Apply</button>
            </div>
          </div>
        )}

        {/* 1 — Paste */}
        <Section step={1} title="Paste the page or your notes">
          <div
            onDragOver={(e) => { if (Array.from(e.dataTransfer.types).includes("Files")) { e.preventDefault(); setDragging(true) } }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              const f = imageFromTransfer(e.dataTransfer)
              setDragging(false)
              if (f) { e.preventDefault(); void addImage(f) }
            }}
            className={cn("rounded-lg transition-shadow", dragging && "ring-2 ring-violet-400 ring-offset-2")}
          >
            <textarea
              value={source}
              onChange={(e) => setSource(e.target.value)}
              onPaste={(e) => {
                const f = imageFromTransfer(e.clipboardData)
                const hasText = !!e.clipboardData.getData("text/plain")
                if (f) {
                  if (!hasText) e.preventDefault()
                  void addImage(f)
                }
                if (hasText) extraction.readSoon()
              }}
              spellCheck={false}
              placeholder="Paste the answering-service page or your call notes — or paste or drop a screenshot."
              className={cn(inputClass, "min-h-[140px] resize-y font-mono text-[13px] leading-relaxed sm:text-[13px]")}
            />
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void addImage(f) }}
            />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={imageBusy}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
              {imageBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              {image ? "Replace screenshot" : "Add screenshot"}
            </button>
            {aiEnabled && (source.trim() || image) && aiStatus.phase !== "reading" && (
              <button type="button" onClick={() => extraction.readNow()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-zinc-600 hover:bg-zinc-100">
                <RefreshCw className="h-3.5 w-3.5" /> Read again
              </button>
            )}
            <AiStatusLine phase={aiStatus.phase} message={aiStatus.message} />
          </div>

          {imageError && <p className="mt-2 text-xs font-medium text-red-600">{imageError}</p>}
          {image && (
            <div className="mt-3 flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.previewUrl} alt="Pasted screenshot" className="max-h-40 rounded-lg border border-zinc-200 object-contain" />
              <div className="space-y-1 text-xs text-zinc-500">
                <p>Read by the AI, never saved.</p>
                <button type="button" onClick={() => { extraction.readSoon(); setImage(null) }}
                  className="inline-flex items-center gap-1 font-medium text-zinc-700 hover:underline">
                  <X className="h-3 w-3" /> Remove
                </button>
              </div>
            </div>
          )}
        </Section>

        {/* 2 — Referral */}
        <Section
          step={2}
          title={<span className="truncate">{patientName || "Referral"}</span>}
          action={
            <>
              <Chip on={fields.urgent} tone="urgent" onClick={() => setField("urgent", !fields.urgent)} title="Tap to change">
                {fields.urgent ? "Urgent" : "Routine"}
              </Chip>
              <CopyButton text={() => buildIntakeText(fields)} label="Copy intake" />
            </>
          }
          className={cn(fields.urgent && "border-red-200 ring-1 ring-red-100")}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {text("first", L("first_name", "Patient first name"), { copy: true })}
            {text("last", L("last_name", "Patient last name"), { copy: true })}
            <FieldShell label={L("dob", "DOB")} htmlFor="rc-dob" origin={origin("dob")} onUseSuggestion={suggestionFor("dob")} error={dobError ?? undefined}>
              <TextInput id="rc-dob" value={fields.dob} inputMode="numeric" placeholder="MM/DD/YYYY" invalid={!!dobError}
                onChange={(v) => { setDobError(null); setField("dob", v) }}
                onBlur={() => { const n = normalizeDobInput(fields.dob); if (n !== fields.dob) setField("dob", n) }} />
            </FieldShell>
            {text("room", L("room", "Room"))}
            {text("caller", L("caller", "Caller"))}
            {text("callback", L("callback", "Callback"), { copy: true, inputMode: "tel" })}
            {text("patientPhone", L("patient_phone", "Patient phone"), { copy: true, inputMode: "tel", placeholder: "Not indicated", className: "sm:col-span-2" })}
            {text("referredFrom", L("referred_from", "Referred from"), { copy: true, className: "sm:col-span-2" })}
            {text("reason", L("reason", "Reason for referral"), { copy: true, className: "sm:col-span-2" })}
            {text("notes", L("notes", "Notes"), { copy: true, long: true, placeholder: "Caller ID, MRN, anything else", className: "sm:col-span-2" })}
          </div>
        </Section>

        {/* 3 — Call details */}
        <Section step={3} title="Call details">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {text("hpi", L("hpi", "Short HPI"), { long: true, rows: 4, placeholder: "Mechanism, injury, imaging done", className: "sm:col-span-2" })}
            {text("labs", L("labs_imaging", "Pertinent labs / imaging"), { long: true, placeholder: "e.g., XR L hip: IT fx. CT head/neck neg. INR 2.8, Hgb 11.2", className: "sm:col-span-2" })}
            {text("pmhx", L("pmhx", "PMHx"), { placeholder: "e.g., PE, HTN, DM2", className: "sm:col-span-2" })}
            {text("meds", L("meds", "Meds"), { placeholder: "e.g., metoprolol, metformin", className: "sm:col-span-2" })}
            {text("anticoag", L("blood_thinner", "Blood thinner"), { placeholder: "None / agent" })}
            {text("lastDose", L("blood_thinner_last_dose", "Last dose"), { placeholder: "Date / time" })}
            <ChipRow className="sm:col-span-2 -mt-1">
              {RC_BLOOD_THINNER_PICKS.map((p) => (
                <Chip key={p} on={fields.anticoag.trim().toLowerCase() === p.toLowerCase()} onClick={() => {
                  const r = applyThinnerPick(fields.anticoag, p)
                  setField("anticoag", r.value)
                  if (r.clearLastDose) setField("lastDose", "")
                }}>{p}</Chip>
              ))}
            </ChipRow>
            {text("npo", L("npo_since", "NPO since"), { placeholder: "e.g., breakfast, 0600, midnight", className: "sm:col-span-2" })}
            <div className="space-y-2 sm:col-span-2">
              {text("social", L("social", "Social / historian"), { long: true, placeholder: "One per line" })}
              <ChipRow>
                {RC_SOCIAL_PICKS.map((p) => (
                  <Chip key={p} on={isPickOn(fields.social, p)} onClick={() => setField("social", toggleSocialPick(fields.social, p))}>{p}</Chip>
                ))}
              </ChipRow>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <FieldShell label={L("decision_maker", "Decision maker")} origin={origin("dm")} onUseSuggestion={suggestionFor("dm")}>
                <ChipRow>
                  {RC_DECISION_MAKERS.map((d) => (
                    <Chip key={d.value} on={fields.dm === d.field} onClick={() => setField("dm", fields.dm === d.field ? "" : d.field)}>{d.label}</Chip>
                  ))}
                </ChipRow>
              </FieldShell>
              {fields.dm === "POA" && (
                <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-2">
                  {text("poa", L("poa_name", "POA name / relationship"), { placeholder: "e.g., Daughter, Maria" })}
                  {text("poaPhone", L("poa_phone", "POA phone"), { inputMode: "tel", placeholder: "If needed" })}
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* Admin-added fields */}
        {addedProperties.length > 0 && (
          <Section title="Additional fields">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {addedProperties.map((p) => {
                const fromAi = !(p.id in extrasManual) && isFilled(aiExtras[p.id])
                return (
                  <FieldShell key={p.id} label={p.name} origin={fromAi ? "ai" : undefined}
                    className={p.type === "LONG_TEXT" ? "sm:col-span-2" : undefined}>
                    <PropertyInput
                      def={fieldDefFor(p)}
                      value={extrasValues[p.id] ?? (p.type === "MULTI_SELECT" ? [] : p.type === "CHECKBOX" ? false : "")}
                      users={users.map((u) => ({ id: u.id, label: u.name || u.email }))}
                      onChange={(v) => setExtrasManual((m) => ({ ...m, [p.id]: v === undefined ? null : (v as ExtraValue) }))}
                    />
                  </FieldShell>
                )
              })}
            </div>
          </Section>
        )}

        {/* 4 — Text to surgeon */}
        <Section
          step={4}
          title="Text to surgeon"
          action={
            <>
              {surgeonEdited && (
                <button type="button" onClick={() => setSurgeonEdited(false)} className="h-8 rounded-md px-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100">
                  Rebuild from fields
                </button>
              )}
              <CopyButton text={surgeonText} />
            </>
          }
        >
          <LongInput
            value={surgeonText}
            rows={9}
            onChange={(v) => { setSurgeonDraft(v); setSurgeonEdited(true) }}
            className="text-[15px] sm:text-sm"
          />
          <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-zinc-500">
            <span>{surgeonEdited ? "Edited by hand. Field changes won't update it until you rebuild." : "Builds itself from the fields above. You can edit it here too."}</span>
            <span className="shrink-0 tabular-nums">{surgeonText.length} characters</span>
          </div>
        </Section>

        {/* 5 — Outcome */}
        <Section step={5} title="Outcome">
          <p className="-mt-1 mb-3 text-xs text-zinc-500">Fill in after the surgeon responds. It goes in the log and the Epic note, not the text.</p>
          <div className="space-y-4">
            <FieldShell label={L("status", "Status")}>
              <StyledSelect className={cn(inputClass, "h-10")} value={status} onChange={(e) => setStatus(e.target.value as RcStatus)}>
                {RC_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </StyledSelect>
            </FieldShell>
            <FieldShell label="Select all that apply" origin={origin("outcome")} onUseSuggestion={suggestionFor("outcome")}>
              <ChipRow>
                {RC_OUTCOMES.map((o) => (
                  <Chip key={o.value} on={isPickOn(fields.outcome, o.label)} onClick={() => setField("outcome", toggleOutcome(fields.outcome, o.label))}>{o.label}</Chip>
                ))}
              </ChipRow>
            </FieldShell>
            {(isPickOn(fields.outcome, "Abx") || fields.abx.trim()) && text("abx", L("abx_detail", "Abx"), { placeholder: "e.g., Ancef 2 g IV given 1400" })}
            {text("otherNotes", L("other_notes", "Other notes"), { long: true, placeholder: "Anything else for the surgeon or the log" })}
          </div>
        </Section>

        {/* 6 — Epic note */}
        <Section
          step={6}
          title="Telephone encounter note"
          action={
            <>
              {epicEdited && (
                <button type="button" onClick={() => setEpicEdited(false)} className="h-8 rounded-md px-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100">
                  Rebuild from fields
                </button>
              )}
              <CopyButton text={epicNote} label="Copy note" />
            </>
          }
        >
          <LongInput
            value={epicNote}
            rows={12}
            onChange={(v) => { setEpicDraft(v); setEpicEdited(true) }}
            className="font-mono text-[13px] sm:text-xs"
          />
          <p className="mt-1.5 text-xs text-zinc-500">
            {epicEdited ? "Edited by hand. Field changes won't update it until you rebuild." : "For the Epic telephone encounter. Builds itself from everything above, including the outcome."}
          </p>
        </Section>

        {/* Charted */}
        <label className={cn(
          "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3.5 transition-colors",
          charted ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-white hover:bg-zinc-50",
        )}>
          <input type="checkbox" checked={charted} onChange={(e) => setCharted(e.target.checked)} className="h-5 w-5 rounded border-zinc-300 accent-zinc-900" />
          <span className="text-sm font-medium text-zinc-900">{L("charted", "Charted in Epic")}</span>
          <span className="ml-auto text-xs text-zinc-500">Saved with the initials of whoever ticks it.</span>
        </label>

        <CopyFallback />
      </div>

      {/* Actions */}
      <div className="sticky bottom-0 z-20 border-t border-zinc-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-3 sm:px-6" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <p className="mr-auto hidden items-center gap-1.5 text-xs text-zinc-500 sm:flex">
            {recordId && !dirty && <Check className="h-3.5 w-3.5 text-emerald-600" />}
            {recordId ? (dirty ? "Unsaved changes" : `Saved${recordNumber ? ` · #${recordNumber}` : ""}`) : ""}
          </p>
          {recordId && !dirty ? (
            <button type="button" onClick={newCall} className="h-11 flex-1 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 sm:flex-none">
              New call
            </button>
          ) : (
            <button type="button" onClick={clear} disabled={saving} className="h-11 flex-1 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 sm:flex-none">
              {recordId ? "Discard" : "Clear"}
            </button>
          )}
          <button type="button" onClick={() => void save()} disabled={saving || (!!recordId && !dirty) || (!recordId && !hasContent)}
            className="h-11 flex-1 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 sm:flex-none">
            {saving ? "Saving…" : recordId ? (dirty ? "Update log" : "Saved") : "Log call"}
          </button>
          <button type="button" onClick={() => {
              if (recordId && !dirty) {
                void copyText(surgeonText).then((ok) => { if (ok) showToast("Surgeon text copied") })
              } else void save({ copySurgeon: true })
            }} disabled={saving || (!recordId && !hasContent)}
            className="h-11 flex-[1.6] rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 sm:flex-none">
            {recordId && !dirty ? "Copy surgeon text" : "Copy text & log"}
          </button>
        </div>
      </div>
    </div>
  )
}

function AiStatusLine({ phase, message }: { phase: string; message: string | null }) {
  if (phase === "reading") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-700">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading with AI…
      </span>
    )
  }
  if (phase === "off") {
    return <span className="text-xs text-zinc-500">AI reading isn&apos;t set up — the fields fill from the rules.</span>
  }
  if (!message) return null
  if (phase === "done") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-700">
        <Sparkles className="h-3.5 w-3.5" /> {message}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {message}
    </span>
  )
}

