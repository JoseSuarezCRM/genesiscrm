"use client"

/**
 * Settings → On-call AI: what the AI pulls from a pasted call, and where it
 * puts it. General instructions, one standing instruction per field, which
 * fields the AI fills, and — for fields admins added to the call log — whether
 * they appear in the surgeon text or the Epic note.
 */

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronDown, Plus, RotateCcw, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import Switch from "@/components/ui/switch"
import { NotesTextarea } from "@/components/ui/notes-textarea"
import { showToast, showErrorToast } from "@/components/toast"
import type { CustomObjectProperty } from "@/app/actions/custom-objects"
import { saveExtractionRules } from "@/app/actions/referral-call-ai"
import { BUILTIN_AI_FIELDS, buildExtractionPlan } from "@/lib/referral-calls/ai-prompt"
import { AI_FILLABLE_TYPES, TEXT_SHOWABLE_TYPES, type FieldRule, type FieldRules } from "@/lib/referral-calls/extras"
import { RC_MAX_EXTRA_AI_FIELDS } from "@/lib/referral-calls/constants"

const TYPE_LABEL: Record<CustomObjectProperty["type"], string> = {
  TEXT: "Text", LONG_TEXT: "Long text", NUMBER: "Number", EMAIL: "Email", PHONE: "Phone", DATE: "Date",
  DATE_TIME: "Date & time", CHECKBOX: "Checkbox", DROPDOWN: "Dropdown", MULTI_SELECT: "Multi-select", URL: "URL", USER: "User",
}

const textareaClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm leading-relaxed text-zinc-900 placeholder:text-zinc-400 " +
  "focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400"

export default function AiRulesEditor({
  properties, added, initialInstructions, initialFields, updatedAt,
}: {
  /** Every property of the call log (for labels and the prompt preview). */
  properties: CustomObjectProperty[]
  /** The admin-added ones, in order. */
  added: CustomObjectProperty[]
  initialInstructions: string
  initialFields: FieldRules
  updatedAt: string | null
}) {
  const [instructions, setInstructions] = useState(initialInstructions)
  const [fields, setFields] = useState<FieldRules>(initialFields)
  const [saved, setSaved] = useState({ instructions: initialInstructions, fields: initialFields })
  const [saving, setSaving] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const [lastSaved, setLastSaved] = useState(updatedAt)

  const labelOf = (id: string) => properties.find((p) => p.id === id)?.name ?? id
  const setRule = (id: string, patch: Partial<FieldRule>) =>
    setFields((f) => ({ ...f, [id]: { ...(f[id] ?? {}), ...patch } }))

  const dirty = instructions !== saved.instructions || JSON.stringify(fields) !== JSON.stringify(saved.fields)
  const aiAddedCount = added.filter((p) => fields[p.id]?.extract === true && AI_FILLABLE_TYPES.has(p.type)).length
  const plan = useMemo(() => buildExtractionPlan(properties, { instructions, fields }), [properties, instructions, fields])

  const save = async () => {
    setSaving(true)
    try {
      const res = await saveExtractionRules({ instructions, fields })
      if (!res.ok) { showErrorToast(res.error); return }
      setSaved({ instructions, fields })
      setLastSaved(res.updatedAt)
      showToast("On-call AI rules saved")
    } catch {
      showErrorToast("The rules couldn't be saved. Try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 pb-24">
      {/* General */}
      <section className="rounded-xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">General instructions</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Apply to every call the AI reads. Write rules, not examples from real calls — don&apos;t paste patient details here.
          </p>
        </div>
        <div className="px-5 py-4">
          <NotesTextarea
            commit="input"
            rows={4}
            value={instructions}
            onChange={setInstructions}
            placeholder={'e.g. "Our surgeons only take calls from Northshore and St. Mary — put any other facility in Notes as well."'}
            className={textareaClass}
          />
          <p className="mt-1 text-right text-[11px] tabular-nums text-zinc-400">{instructions.length} / 4000</p>
        </div>
      </section>

      {/* Built-in fields */}
      <section className="rounded-xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">The intake&apos;s fields</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            What the AI should put in each field. Edit an instruction to change what it pulls; turn a field off to leave it to the rules and the person taking the call.
          </p>
        </div>
        <ul className="divide-y divide-zinc-100">
          {BUILTIN_AI_FIELDS.map((b) => {
            const rule = fields[b.propId] ?? {}
            const on = rule.extract !== false
            const value = rule.instruction ?? b.defaultInstruction
            const custom = value.trim() !== b.defaultInstruction
            return (
              <li key={b.propId} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">{labelOf(b.propId)}</p>
                    {custom && on && <p className="text-[11px] font-medium text-violet-700">Custom instruction</p>}
                  </div>
                  <label className="flex shrink-0 items-center gap-2 text-xs text-zinc-600">
                    AI fills this
                    <Switch checked={on} onChange={(v) => setRule(b.propId, { extract: v ? undefined : false })} label={`Let AI fill ${labelOf(b.propId)}`} />
                  </label>
                </div>
                {on && (
                  <div className="mt-2.5">
                    <NotesTextarea
                      commit="input"
                      rows={2}
                      value={value}
                      onChange={(v) => setRule(b.propId, { instruction: v })}
                      className={textareaClass}
                    />
                    {custom && (
                      <button type="button" onClick={() => setRule(b.propId, { instruction: undefined })}
                        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-800">
                        <RotateCcw className="h-3 w-3" /> Reset to default
                      </button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {/* Added fields */}
      <section className="rounded-xl border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Fields you added</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Fields added to Referral Calls appear here. Tell the AI what to pull into them, and choose whether they show in the texts.
              {" "}{aiAddedCount} of {RC_MAX_EXTRA_AI_FIELDS} filled by AI.
            </p>
          </div>
          <Link href="/settings/objects?key=referral-calls"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
            <Plus className="h-3.5 w-3.5" /> Add a field
          </Link>
        </div>
        {added.length === 0 ? (
          <p className="px-5 py-6 text-sm text-zinc-500">
            No added fields yet. Add one — say, &ldquo;Attending physician&rdquo; — and it appears here for the AI to fill.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {added.map((p) => {
              const rule = fields[p.id] ?? {}
              const fillable = AI_FILLABLE_TYPES.has(p.type)
              const showable = TEXT_SHOWABLE_TYPES.has(p.type)
              const on = fillable && rule.extract === true
              const atCap = !on && aiAddedCount >= RC_MAX_EXTRA_AI_FIELDS
              const pickList = p.type === "DROPDOWN" || p.type === "MULTI_SELECT"
              return (
                <li key={p.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-sm font-medium text-zinc-900">{p.name}</p>
                      <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">{TYPE_LABEL[p.type]}</span>
                    </div>
                    <label className={cn("flex shrink-0 items-center gap-2 text-xs", fillable ? "text-zinc-600" : "text-zinc-400")}>
                      AI fills this
                      <Switch checked={on} disabled={!fillable || atCap} onChange={(v) => setRule(p.id, { extract: v || undefined })} label={`Let AI fill ${p.name}`} />
                    </label>
                  </div>
                  {!fillable && <p className="mt-1 text-xs text-zinc-500">The AI can&apos;t fill {TYPE_LABEL[p.type].toLowerCase()} fields.</p>}
                  {atCap && <p className="mt-1 text-xs text-amber-700">The AI already fills {RC_MAX_EXTRA_AI_FIELDS} added fields — turn one off first.</p>}
                  {on && (
                    <div className="mt-2.5">
                      <NotesTextarea
                        commit="input"
                        rows={2}
                        value={rule.instruction ?? ""}
                        onChange={(v) => setRule(p.id, { instruction: v })}
                        placeholder={pickList
                          ? `When to pick each option, e.g. "Pick 'Level 1' when the caller says trauma activation."`
                          : `What goes here, e.g. "The attending's name, as written, without credentials."`}
                        className={textareaClass}
                      />
                      {pickList && !(p.options ?? []).length && (
                        <p className="mt-1 text-xs text-amber-700">This field has no options yet, so the AI can&apos;t fill it.</p>
                      )}
                    </div>
                  )}
                  {showable && (
                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                      <label className="flex items-center gap-2 text-xs text-zinc-600">
                        <Switch checked={!!rule.inSurgeonText} onChange={(v) => setRule(p.id, { inSurgeonText: v || undefined })} label={`Show ${p.name} in the surgeon text`} />
                        Show in text to surgeon
                      </label>
                      <label className="flex items-center gap-2 text-xs text-zinc-600">
                        <Switch checked={!!rule.inEpicNote} onChange={(v) => setRule(p.id, { inEpicNote: v || undefined })} label={`Show ${p.name} in the Epic note`} />
                        Show in Epic note
                      </label>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* What the AI is told */}
      <section className="rounded-xl border border-zinc-200 bg-white">
        <button type="button" onClick={() => setShowPrompt((v) => !v)} className="flex w-full items-center justify-between px-5 py-4 text-left">
          <span>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900"><Sparkles className="h-4 w-4 text-violet-600" /> What the AI is told</span>
            <span className="mt-0.5 block text-xs text-zinc-500">The exact instructions sent with every call, built from the rules above. The call itself is sent separately.</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 text-zinc-400 transition-transform", showPrompt && "rotate-180")} />
        </button>
        {showPrompt && (
          <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap border-t border-zinc-100 px-5 py-4 font-mono text-[11px] leading-relaxed text-zinc-700">
            {plan.system}
          </pre>
        )}
      </section>

      {/* Save */}
      <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-end gap-3 border-t border-zinc-200 bg-white/95 px-1 py-3 backdrop-blur">
        <p className="mr-auto text-xs text-zinc-500">
          {dirty ? "Unsaved changes" : lastSaved ? `Saved ${new Date(lastSaved).toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" })}` : "Using the default rules"}
        </p>
        {dirty && (
          <button type="button" onClick={() => { setInstructions(saved.instructions); setFields(saved.fields) }}
            className="h-9 rounded-lg px-3 text-sm font-medium text-zinc-600 hover:bg-zinc-100">
            Discard
          </button>
        )}
        <button type="button" onClick={() => void save()} disabled={!dirty || saving}
          className="h-9 rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50">
          {saving ? "Saving…" : "Save rules"}
        </button>
      </div>
    </div>
  )
}
