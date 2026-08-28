"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { upsertStage, deleteStage, reorderStages, updatePipeline, deletePipeline, setStageConditionalFields, setPipelineRule } from "@/app/actions/pipelines"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import { useCardReorder } from "@/components/use-card-reorder"
import { ChevronLeft, ChevronDown, Plus, Check, X, Copy, GripVertical, Trash2 } from "lucide-react"

interface Stage { id: string; name: string; order: number; probability: number | null; isClosed: boolean; isWon: boolean; color: string | null; recordCount: number }
interface Sibling { id: string; name: string }

const TABS = ["Configure", "Pipeline Rules", "Automate", "Tags"] as const
const PCT = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

// The probability cell's current selection encodes Won/Lost terminal stages.
function probValue(s: Stage): string {
  if (s.isWon) return "won"
  if (s.isClosed && !s.isWon) return "lost"
  return s.probability != null ? String(s.probability) : ""
}
function probPatch(v: string): Partial<Stage> {
  if (v === "won") return { probability: 100, isClosed: true, isWon: true }
  if (v === "lost") return { probability: 0, isClosed: true, isWon: false }
  return { probability: v === "" ? null : Number(v), isClosed: false, isWon: false }
}

export default function PipelineManage({ pipeline, stages: initial, siblings, colorStyle, objectLabel, recordNoun, objectProperties = [], stageRules: initialRules = {}, pipelineRules: initialPipelineRules = {} }: {
  pipeline: { id: string; name: string; color: string; objectType: string }
  stages: Stage[]; siblings: Sibling[]; colorStyle: string; objectLabel: string; recordNoun: string
  objectProperties?: { id: string; name: string }[]; stageRules?: Record<string, string[]>
  pipelineRules?: Record<string, string[]>
}) {
  const router = useRouter()
  const [tab, setTab] = useState<(typeof TABS)[number]>("Configure")
  const [stages, setStages] = useState(initial)
  const [rules, setRules] = useState<Record<string, string[]>>(initialRules)
  const [ruleStage, setRuleStage] = useState<Stage | null>(null) // stage whose rule modal is open
  const [ruleDraft, setRuleDraft] = useState<Set<string>>(new Set())
  const [savingRule, setSavingRule] = useState(false)
  const conditionalSupported = !pipeline.objectType.startsWith("CO:") && objectProperties.length > 0
  const [pRules, setPRules] = useState<Record<string, string[]>>(initialPipelineRules)
  function toggleAllowed(fromId: string, toId: string) {
    setPRules((prev) => {
      const cur = prev[fromId] ?? []
      const next = cur.includes(toId) ? cur.filter((x) => x !== toId) : [...cur, toId]
      startTransition(() => { setPipelineRule(pipeline.id, fromId, next).catch(() => {}) })
      return { ...prev, [fromId]: next }
    })
  }
  const propName = (id: string) => objectProperties.find((p) => p.id === id)?.name ?? id
  function openRules(s: Stage) { setRuleStage(s); setRuleDraft(new Set(rules[s.id] ?? [])) }
  function saveRules() {
    if (!ruleStage) return
    const stageId = ruleStage.id, ids = Array.from(ruleDraft)
    setSavingRule(true)
    startTransition(async () => {
      await setStageConditionalFields(pipeline.objectType, stageId, ids).catch(() => {})
      setRules((prev) => ({ ...prev, [stageId]: ids }))
      setSavingRule(false); setRuleStage(null)
    })
  }
  const [editId, setEditId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState("")
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState("")
  const [copied, setCopied] = useState<string | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [, startTransition] = useTransition()

  const reorder = useCardReorder(stages, (s) => s.id, (ids) => {
    setStages((prev) => ids.map((id) => prev.find((s) => s.id === id)!).filter(Boolean))
    startTransition(() => { reorderStages(pipeline.id, ids).catch(() => {}) })
  })

  function saveStage(id: string, patch: Partial<Stage>) {
    setStages((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s))
    const s = { ...stages.find((x) => x.id === id)!, ...patch }
    startTransition(() => { upsertStage(pipeline.id, { id, name: s.name, probability: s.probability, isClosed: s.isClosed, isWon: s.isWon }).catch(() => {}) })
  }
  function commitName(id: string) {
    const name = draftName.trim(); if (!name) { setEditId(null); return }
    saveStage(id, { name }); setEditId(null)
  }
  function addStage() {
    const name = newName.trim(); if (!name) return
    setAdding(false); setNewName("")
    startTransition(async () => { await upsertStage(pipeline.id, { name }); router.refresh() })
  }
  async function removeStage(s: Stage) {
    if (!(await confirmDialog(`Delete stage "${s.name}"? Records in it keep their pipeline but lose the stage.`))) return
    setStages((prev) => prev.filter((x) => x.id !== s.id))
    startTransition(() => { deleteStage(s.id).catch(() => {}) })
  }
  function copyId(id: string) { navigator.clipboard?.writeText(id).catch(() => {}); setCopied(id); setTimeout(() => setCopied((c) => c === id ? null : c), 1200) }
  async function renamePipeline() {
    setActionsOpen(false)
    const name = window.prompt("Rename pipeline", pipeline.name)?.trim()
    if (!name) return
    startTransition(async () => { await updatePipeline(pipeline.id, { name }); router.refresh() })
  }
  async function removePipeline() {
    setActionsOpen(false)
    if (!(await confirmDialog(`Delete pipeline "${pipeline.name}"?`))) return
    startTransition(async () => { const r = await deletePipeline(pipeline.id); if ((r as any)?.error) { alert((r as any).error); return } router.push("/settings/pipelines" + (pipeline.objectType === "REFERRAL" ? "" : `?object=${encodeURIComponent(pipeline.objectType)}`)) })
  }

  const sel = "h-8 rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-slate-400"

  return (
    <div className="space-y-5">
      <Link href={`/settings/pipelines${pipeline.objectType === "REFERRAL" ? "" : `?object=${encodeURIComponent(pipeline.objectType)}`}`}
        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"><ChevronLeft className="h-4 w-4" /> Back to Pipelines</Link>

      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Manage {pipeline.name}</h1>
        <div className="relative">
          <button onClick={() => setActionsOpen((o) => !o)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:border-slate-400">
            Actions <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </button>
          {actionsOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setActionsOpen(false)} />
              <div className="absolute right-0 top-10 z-20 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                <button onClick={renamePipeline} className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50">Rename pipeline</button>
                <button onClick={removePipeline} className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50">Delete pipeline</button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Pipeline switcher */}
      <div className="flex items-center gap-3">
        <select value={pipeline.id} onChange={(e) => router.push(`/settings/pipelines/${e.target.value}`)} className={`${sel} h-9 min-w-[220px] font-medium`}>
          {siblings.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span className="text-xs text-slate-400">{objectLabel}</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-1 pb-2.5 text-sm font-medium transition-colors ${tab === t ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Configure" ? (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5 font-semibold">Stage name</th>
                <th className="px-3 py-2.5 font-semibold">Probability</th>
                <th className="px-3 py-2.5 text-right font-semibold">Used in</th>
                <th className="px-3 py-2.5 font-semibold">Conditional logic rules</th>
                <th className="px-3 py-2.5 font-semibold">Stage ID</th>
                <th className="w-10 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reorder.order.map((s) => (
                <tr key={s.id} {...reorder.cardProps(s.id)} className={`bg-white transition-colors hover:bg-slate-50 ${reorder.dragging === s.id ? "opacity-50" : ""}`}>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span {...reorder.handleProps(s.id)} className="text-slate-300 hover:text-slate-500"><GripVertical className="h-4 w-4" /></span>
                      {editId === s.id ? (
                        <input autoFocus value={draftName} onChange={(e) => setDraftName(e.target.value)}
                          onBlur={() => commitName(s.id)} onKeyDown={(e) => { if (e.key === "Enter") commitName(s.id); if (e.key === "Escape") setEditId(null) }}
                          className="w-full max-w-[220px] rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-blue-500" />
                      ) : (
                        <button onClick={() => { setEditId(s.id); setDraftName(s.name) }} className="rounded px-1 py-0.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-100">{s.name}</button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <select value={probValue(s)} onChange={(e) => saveStage(s.id, probPatch(e.target.value))}
                      className={`${sel} ${s.isWon ? "text-emerald-600" : s.isClosed ? "text-red-600" : "text-slate-700"}`}>
                      <option value="">—</option>
                      {PCT.map((p) => <option key={p} value={p}>{p}%</option>)}
                      <option value="won">Won (100%)</option>
                      <option value="lost">Lost (0%)</option>
                    </select>
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{s.recordCount} {recordNoun}{s.recordCount !== 1 ? "s" : ""}</td>
                  <td className="px-3 py-2.5">
                    {conditionalSupported ? (
                      (rules[s.id]?.length ?? 0) > 0 ? (
                        <button onClick={() => openRules(s)} title={rules[s.id].map(propName).join(", ")} className="text-sm text-blue-600 hover:underline">{rules[s.id].length} field rule{rules[s.id].length !== 1 ? "s" : ""}</button>
                      ) : (
                        <button onClick={() => openRules(s)} className="text-sm text-slate-400 hover:text-blue-600">Add rule</button>
                      )
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <button onClick={() => copyId(s.id)} className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-500 hover:text-slate-800">
                      {s.id}{copied === s.id ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 opacity-60" />}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={() => removeStage(s)} className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              ))}
              <tr className="bg-white">
                <td className="px-3 py-2.5" colSpan={6}>
                  {adding ? (
                    <div className="flex items-center gap-2">
                      <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") addStage(); if (e.key === "Escape") setAdding(false) }}
                        placeholder="Stage name…" className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-blue-500" />
                      <button onClick={addStage} disabled={!newName.trim()} className="rounded-md bg-blue-600 p-1.5 text-white hover:bg-blue-700 disabled:opacity-50"><Check className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setAdding(false)} className="p-1.5 text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ) : (
                    <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"><Plus className="h-4 w-4" /> Add stage</button>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : tab === "Pipeline Rules" ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Restrict which stage a {recordNoun} can move to from each stage. Select the allowed next stages; leave all unchecked to allow any move.</p>
          <div className="space-y-3">
            {stages.map((from) => {
              const allowed = pRules[from.id] ?? []
              return (
                <div key={from.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="mb-2 text-sm font-semibold text-slate-800">From <span className="rounded bg-slate-100 px-1.5 py-0.5">{from.name}</span> can move to:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {stages.filter((t) => t.id !== from.id).map((to) => {
                      const on = allowed.includes(to.id)
                      return (
                        <button key={to.id} onClick={() => toggleAllowed(from.id, to.id)}
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${on ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}>
                          {to.name}
                        </button>
                      )
                    })}
                    {stages.length <= 1 && <span className="text-xs text-slate-400">Add more stages to define rules.</span>}
                  </div>
                  {allowed.length === 0 && stages.length > 1 && <p className="mt-2 text-xs text-slate-400">No restriction — any stage move is allowed.</p>}
                </div>
              )
            })}
          </div>
        </div>
      ) : tab === "Automate" ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          <p>Moving a {recordNoun} into a stage fires automation triggers automatically. Build a workflow that watches the <strong>Stage</strong> property to send emails, create tasks, or update fields when a record enters a stage.</p>
          <Link href="/automations" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 font-medium text-white hover:bg-blue-700">Open Automations</Link>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          <p>Tags let you label and filter {recordNoun}s on the board and in lists. Time-in-stage and date-entered-stage are tracked automatically for every stage and are available as fields in the Report Builder (stage calculated properties).</p>
          <Link href={pipeline.objectType === "REFERRAL" ? "/referrals" : `/objects/${pipeline.objectType.slice(3)}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 font-medium text-slate-700 hover:border-slate-400">Go to {objectLabel}</Link>
        </div>
      )}

      {ruleStage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setRuleStage(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">Conditional logic — {ruleStage.name}</h3>
            <p className="mt-1 text-sm text-slate-500">Choosing this stage will show these fields on the record.</p>
            <div className="mt-3 max-h-72 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 p-1">
              {objectProperties.length === 0 ? (
                <p className="px-2 py-3 text-sm text-slate-400">This object has no custom properties yet.</p>
              ) : objectProperties.map((p) => {
                const on = ruleDraft.has(p.id)
                return (
                  <button key={p.id} onClick={() => setRuleDraft((prev) => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50">
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? "border-blue-600 bg-blue-600" : "border-slate-300"}`}>{on && <Check className="h-3 w-3 text-white" />}</span>
                    <span className="text-slate-700">{p.name}</span>
                  </button>
                )
              })}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setRuleStage(null)} className="h-9 rounded-lg px-3 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
              <button onClick={saveRules} disabled={savingRule} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{savingRule ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
