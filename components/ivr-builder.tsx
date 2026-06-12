"use client"

import StyledSelect from "@/components/ui/styled-select"
import { useState, useTransition } from "react"
import { Plus, Trash2, GripVertical, Phone, CheckCircle2, AlertCircle, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { saveIvrConfig, IvrOptionInput } from "@/app/actions/ivr"
import { IvrAction } from "@prisma/client"

const DIGITS = ["1","2","3","4","5","6","7","8","9","0"]

const ACTION_LABELS: Record<IvrAction, string> = {
  PLAY_MESSAGE:  "Play a message",
  FORWARD_CALL:  "Forward to a number",
  HANG_UP:       "Hang up",
}

interface IvrConfig {
  id: string
  isActive: boolean
  greeting: string
  noInputMessage: string
  invalidMessage: string
  gatherTimeout: number
  options: IvrOptionInput[]
}

interface Props {
  initialConfig: IvrConfig | null
}

function OptionRow({
  opt,
  usedDigits,
  onChange,
  onRemove,
}: {
  opt: IvrOptionInput
  usedDigits: string[]
  onChange: (updated: IvrOptionInput) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
      <GripVertical className="h-4 w-4 text-slate-300 mt-2 shrink-0 cursor-grab" />

      {/* Digit */}
      <div className="w-20 shrink-0">
        <label className="text-xs text-slate-500 block mb-1">Digit</label>
        <StyledSelect
          value={opt.digit}
          onChange={(e) => onChange({ ...opt, digit: e.target.value })}
          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          {DIGITS.map((d) => (
            <option key={d} value={d} disabled={d !== opt.digit && usedDigits.includes(d)}>
              {d}
            </option>
          ))}
        </StyledSelect>
      </div>

      {/* Label */}
      <div className="flex-1 min-w-0">
        <label className="text-xs text-slate-500 block mb-1">Menu label (read aloud)</label>
        <input
          value={opt.label}
          onChange={(e) => onChange({ ...opt, label: e.target.value })}
          placeholder="e.g. to confirm your appointment"
          className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Action */}
      <div className="w-44 shrink-0">
        <label className="text-xs text-slate-500 block mb-1">Action</label>
        <StyledSelect
          value={opt.action}
          onChange={(e) => onChange({ ...opt, action: e.target.value as IvrAction, message: "", forwardTo: "" })}
          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          {(Object.keys(ACTION_LABELS) as IvrAction[]).map((a) => (
            <option key={a} value={a}>{ACTION_LABELS[a]}</option>
          ))}
        </StyledSelect>
      </div>

      {/* Action detail */}
      <div className="flex-1 min-w-0">
        {opt.action === "PLAY_MESSAGE" && (
          <>
            <label className="text-xs text-slate-500 block mb-1">Message to play</label>
            <input
              value={opt.message ?? ""}
              onChange={(e) => onChange({ ...opt, message: e.target.value })}
              placeholder="e.g. Thank you. Your appointment is confirmed."
              className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </>
        )}
        {opt.action === "FORWARD_CALL" && (
          <>
            <label className="text-xs text-slate-500 block mb-1">Forward to number</label>
            <input
              value={opt.forwardTo ?? ""}
              onChange={(e) => onChange({ ...opt, forwardTo: e.target.value })}
              placeholder="+1 555 000 0000"
              className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </>
        )}
        {opt.action === "HANG_UP" && (
          <>
            <label className="text-xs text-slate-500 block mb-1">Goodbye message</label>
            <input
              value={opt.message ?? ""}
              onChange={(e) => onChange({ ...opt, message: e.target.value })}
              placeholder="e.g. Thank you for calling. Goodbye."
              className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </>
        )}
      </div>

      <button
        onClick={onRemove}
        className="mt-6 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

export default function IvrBuilder({ initialConfig }: Props) {
  const [isActive, setIsActive]           = useState(initialConfig?.isActive ?? false)
  const [greeting, setGreeting]           = useState(initialConfig?.greeting ?? "Thank you for calling Genesis Ortho. Please listen to the following options.")
  const [noInput, setNoInput]             = useState(initialConfig?.noInputMessage ?? "We did not receive your input. Goodbye.")
  const [invalid, setInvalid]             = useState(initialConfig?.invalidMessage ?? "That is not a valid option. Please try again.")
  const [timeout, setTimeout_]            = useState(initialConfig?.gatherTimeout ?? 5)
  const [options, setOptions]             = useState<IvrOptionInput[]>(initialConfig?.options ?? [])
  const [success, setSuccess]             = useState("")
  const [error, setError]                 = useState("")
  const [isPending, startTransition]      = useTransition()

  const usedDigits = options.map((o) => o.digit)

  function addOption() {
    const available = DIGITS.find((d) => !usedDigits.includes(d))
    if (!available) return
    setOptions((prev) => [
      ...prev,
      { digit: available, label: "", action: "PLAY_MESSAGE", message: "", order: prev.length },
    ])
  }

  function updateOption(idx: number, updated: IvrOptionInput) {
    setOptions((prev) => prev.map((o, i) => (i === idx ? updated : o)))
  }

  function removeOption(idx: number) {
    setOptions((prev) => prev.filter((_, i) => i !== idx).map((o, i) => ({ ...o, order: i })))
  }

  function handleSave() {
    setSuccess("")
    setError("")
    startTransition(async () => {
      const res = await saveIvrConfig({
        isActive,
        greeting,
        noInputMessage: noInput,
        invalidMessage: invalid,
        gatherTimeout: timeout,
        options: options.map((o, i) => ({ ...o, order: i })),
      })
      if (res.success) setSuccess("IVR configuration saved.")
      else setError(res.error ?? "Save failed.")
    })
  }

  // Build a live preview of what the caller will hear
  const previewText = options.length
    ? `${greeting} ${options.map((o) => `Press ${o.digit} ${o.label}.`).join(" ")}`
    : greeting

  return (
    <div className="space-y-6">
      {/* Status + webhook hint */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">Voice IVR Menu</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Set your voice webhook in Twilio to{" "}
            <code className="bg-slate-100 px-1 py-0.5 rounded text-xs font-mono">
              https://genesiscrm.vercel.app/api/webhooks/twilio-voice
            </code>
          </p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-sm text-slate-600">{isActive ? "Active" : "Inactive"}</span>
          <div
            onClick={() => setIsActive((v) => !v)}
            className={cn(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
              isActive ? "bg-blue-600" : "bg-slate-200"
            )}
          >
            <span
              className={cn(
                "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                isActive ? "translate-x-6" : "translate-x-1"
              )}
            />
          </div>
        </label>
      </div>

      {success && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <CheckCircle2 className="h-4 w-4 shrink-0" />{success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* General settings */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">General Settings</h3>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Greeting message</label>
            <textarea
              rows={2}
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">No input message</label>
              <input
                value={noInput}
                onChange={(e) => setNoInput(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Invalid key message</label>
              <input
                value={invalid}
                onChange={(e) => setInvalid(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="w-40">
            <label className="text-xs font-medium text-slate-500 block mb-1">Input timeout (seconds)</label>
            <input
              type="number"
              min={3}
              max={30}
              value={timeout}
              onChange={(e) => setTimeout_(Number(e.target.value))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Menu options */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Menu Options</h3>
          <button
            onClick={addOption}
            disabled={usedDigits.length >= DIGITS.length}
            className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 rounded-lg disabled:opacity-40 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add option
          </button>
        </div>

        {options.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
            No menu options yet — click "Add option" to get started.
          </div>
        ) : (
          <div className="space-y-2">
            {options.map((opt, i) => (
              <OptionRow
                key={i}
                opt={opt}
                usedDigits={usedDigits.filter((_, j) => j !== i)}
                onChange={(updated) => updateOption(i, updated)}
                onRemove={() => removeOption(i)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Preview */}
      {options.length > 0 && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <Phone className="h-3.5 w-3.5" /> Caller will hear
          </div>
          <p className="text-sm text-slate-700 italic">"{previewText}"</p>
        </div>
      )}

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
        >
          {isPending ? "Saving…" : "Save IVR Configuration"}
        </button>
      </div>
    </div>
  )
}
