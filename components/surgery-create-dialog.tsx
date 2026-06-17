"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import StyledSelect from "@/components/ui/styled-select"
import { createSurgeryCase } from "@/app/actions/surgery"
import { SURGERY_STATUS_OPTIONS } from "@/lib/automation-properties"
import { FACILITY_OPTIONS } from "@/lib/surgery-procedures"
import { clinicDatetimeLocalToISO } from "@/lib/tz"

const labelCls = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1"
const inputCls = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-slate-400"

export default function SurgeryCreateDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [form, setForm] = useState({
    patientName: "", mrn: "", status: "NEW", orderingProvider: "",
    diagnosis: "", facility: "", surgeryDate: "", email: "", notes: "",
  })

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }))

  function reset() {
    setForm({ patientName: "", mrn: "", status: "NEW", orderingProvider: "", diagnosis: "", facility: "", surgeryDate: "", email: "", notes: "" })
    setError("")
  }

  function handleClose() {
    setOpen(false)
    reset()
  }

  function handleSave(openAfter: boolean) {
    if (!form.patientName.trim()) { setError("Patient name is required"); return }
    setError("")
    startTransition(async () => {
      const res = await createSurgeryCase({
        patientName: form.patientName,
        mrn: form.mrn || null,
        status: form.status,
        orderingProvider: form.orderingProvider || null,
        diagnosis: form.diagnosis || null,
        facility: form.facility || null,
        surgeryDate: clinicDatetimeLocalToISO(form.surgeryDate),
        email: form.email || null,
        notes: form.notes || null,
      })
      if (res?.error) { setError(res.error); return }
      if (openAfter && res?.id) {
        router.push(`/surgery/${res.id}`)
      } else {
        handleClose()
        router.refresh()
      }
    })
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-2" />
        New Case
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <h2 className="text-base font-semibold text-slate-900">New Surgery Case</h2>
              <button onClick={handleClose} className="text-slate-400 hover:text-slate-700 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={labelCls}>Patient Name *</label>
                  <input autoFocus value={form.patientName} onChange={e => set("patientName", e.target.value)} className={inputCls} placeholder="Last, First" />
                </div>
                <div>
                  <label className={labelCls}>MRN</label>
                  <input value={form.mrn} onChange={e => set("mrn", e.target.value)} className={inputCls} placeholder="111017184069" />
                </div>
                <div>
                  <label className={labelCls}>Status</label>
                  <StyledSelect className="w-full" value={form.status} onChange={e => set("status", e.target.value)}>
                    {SURGERY_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </StyledSelect>
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Ordering Provider</label>
                  <input value={form.orderingProvider} onChange={e => set("orderingProvider", e.target.value)} className={inputCls} placeholder="LASTNAME, FIRSTNAME" />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Diagnosis</label>
                  <input value={form.diagnosis} onChange={e => set("diagnosis", e.target.value)} className={inputCls} placeholder="e.g. Arthritis of left knee" />
                </div>
                <div>
                  <label className={labelCls}>Facility</label>
                  <StyledSelect className="w-full" value={form.facility} onChange={e => set("facility", e.target.value)}>
                    <option value="">— Not set —</option>
                    {FACILITY_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                  </StyledSelect>
                </div>
                <div>
                  <label className={labelCls}>Surgery Date &amp; Time</label>
                  <input type="datetime-local" value={form.surgeryDate} onChange={e => set("surgeryDate", e.target.value)} className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Patient Email</label>
                  <input type="email" value={form.email} onChange={e => set("email", e.target.value)} className={inputCls} placeholder="patient@example.com" />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Notes</label>
                  <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-slate-400 resize-none" />
                </div>
              </div>
              <p className="text-xs text-slate-400">Clinical details (clearances, procedure, CT/GLP-1/DME) can be added after creating the case.</p>
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
              <Button variant="outline" onClick={handleClose} disabled={pending}>Cancel</Button>
              <Button variant="outline" onClick={() => handleSave(false)} disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Save
              </Button>
              <Button onClick={() => handleSave(true)} disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Save & Open
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
