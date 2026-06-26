"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Loader2, X, Pencil, Trash2, MessageSquare, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RichTextEditor, tokensFromStrings } from "@/components/rich-text-editor"
import {
  createMessageTemplate, updateMessageTemplate, deleteMessageTemplate, toggleMessageTemplate,
} from "@/app/actions/message-templates"
import { cn } from "@/lib/utils"

interface Template {
  id: string
  name: string
  channel: "SMS" | "EMAIL"
  subject: string | null
  body: string
  isActive: boolean
  updatedAt: string | Date
}

const TOKENS = tokensFromStrings(["first_name", "last_name", "patient_name", "provider_name", "practice_name"])

const labelCls = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1"
const inputCls = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-slate-400"

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
}

export default function MessageTemplateManager({ channel, templates }: { channel: "SMS" | "EMAIL"; templates: Template[] }) {
  const router = useRouter()
  const isEmail = channel === "EMAIL"
  const Icon = isEmail ? Mail : MessageSquare
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [form, setForm] = useState({ name: "", subject: "", body: "" })

  function openNew() { setEditId(null); setForm({ name: "", subject: "", body: "" }); setError(""); setOpen(true) }
  function openEdit(t: Template) { setEditId(t.id); setForm({ name: t.name, subject: t.subject ?? "", body: t.body }); setError(""); setOpen(true) }
  function close() { setOpen(false); setEditId(null); setError("") }

  function save() {
    if (!form.name.trim()) { setError("Template name is required"); return }
    startTransition(async () => {
      const res = editId
        ? await updateMessageTemplate(editId, { name: form.name, subject: form.subject, body: form.body })
        : await createMessageTemplate({ name: form.name, channel, subject: form.subject, body: form.body })
      if ((res as any)?.error) { setError((res as any).error); return }
      close(); router.refresh()
    })
  }
  function remove(id: string) {
    if (!confirm("Delete this template? This cannot be undone.")) return
    startTransition(async () => { await deleteMessageTemplate(id); router.refresh() })
  }
  function toggle(t: Template) {
    startTransition(async () => { await toggleMessageTemplate(t.id, !t.isActive); router.refresh() })
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isEmail ? "Email Templates" : "SMS Templates"}</h1>
          <p className="text-sm text-slate-500">{templates.length} template{templates.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> New template</Button>
      </div>

      {templates.length === 0 ? (
        <div className="bg-white border rounded-xl py-16 text-center space-y-3">
          <Icon className="h-10 w-10 text-slate-300 mx-auto" />
          <p className="text-slate-500 font-medium">No {isEmail ? "email" : "SMS"} templates yet</p>
          <p className="text-slate-400 text-sm">Create reusable {isEmail ? "email" : "text"} templates to send and reference across the app.</p>
          <div className="pt-2"><Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> New template</Button></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map((t) => (
            <div key={t.id} className="group bg-white border border-slate-200 rounded-xl p-4 space-y-2 hover:border-slate-300 transition-colors flex flex-col">
              <div className="flex items-start gap-2">
                <span className={cn("shrink-0 w-8 h-8 rounded-lg flex items-center justify-center", isEmail ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600")}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate">{t.name}</p>
                  {isEmail && <p className="text-xs text-slate-400 truncate">{t.subject || "No subject"}</p>}
                </div>
                <button onClick={() => toggle(t)} disabled={pending} title={t.isActive ? "Active" : "Inactive"}
                  className="shrink-0 flex items-center gap-1 text-[11px] font-medium">
                  <span className={cn("w-2 h-2 rounded-full", t.isActive ? "bg-emerald-500" : "bg-slate-300")} />
                  <span className={t.isActive ? "text-emerald-700" : "text-slate-400"}>{t.isActive ? "On" : "Off"}</span>
                </button>
              </div>
              <p className="text-xs text-slate-500 line-clamp-3 flex-1">{stripHtml(t.body) || "—"}</p>
              <div className="flex items-center justify-end gap-0.5 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(t)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => remove(t.id)} className="p-1.5 rounded hover:bg-red-50 text-slate-300 hover:text-red-500" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <h2 className="text-base font-semibold text-slate-900">{editId ? "Edit template" : `New ${isEmail ? "email" : "SMS"} template`}</h2>
              <button onClick={close} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
              <div>
                <label className={labelCls}>Template Name *</label>
                <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="e.g. Post-op follow-up" />
              </div>
              {isEmail && (
                <div>
                  <label className={labelCls}>Subject</label>
                  <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className={inputCls} placeholder="Email subject line" />
                </div>
              )}
              <div>
                <label className={labelCls}>{isEmail ? "Body" : "Message"}</label>
                {isEmail ? (
                  <RichTextEditor value={form.body} onChange={(html) => setForm({ ...form, body: html })} tokens={TOKENS} minHeight={200} />
                ) : (
                  <>
                    <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={5}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-slate-400 resize-none"
                      placeholder="Type your text message…" />
                    <p className="text-xs text-slate-400 mt-1">{form.body.length} characters · {Math.max(1, Math.ceil(form.body.length / 160))} SMS segment{form.body.length > 160 ? "s" : ""}</p>
                  </>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
              <Button variant="outline" onClick={close} disabled={pending}>Cancel</Button>
              <Button onClick={save} disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}{editId ? "Save" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
