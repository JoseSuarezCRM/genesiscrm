"use client"

import { useTransition, useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ReferralStatus } from "@prisma/client"
import { createReferral, updateReferral } from "@/app/actions/referrals"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { STATUS_LABELS } from "@/lib/utils"
import { Loader2, Paperclip, X } from "lucide-react"

// ─── Types passed from server ─────────────────────────────────────────────────

interface Location {
  id: string
  name: string
  address: string | null
}

interface Doctor {
  id: string
  name: string
  specialty: string | null
  locations: { locationId: string }[]
}

interface Practice {
  id: string
  name: string
  locations: Location[]
  doctors: Doctor[]
}

// ─── Form schema ──────────────────────────────────────────────────────────────

const schema = z.object({
  patientFirstName: z.string().min(1, "Required"),
  patientLastName: z.string().min(1, "Required"),
  patientPhone: z.string().optional(),
  patientEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  patientDob: z.string().optional(),
  referringPracticeId: z.string().optional(),
  referringLocationId: z.string().optional(),
  referringDoctorId: z.string().optional(),
  referringDoctorName: z.string().optional(),
  status: z.nativeEnum(ReferralStatus),
  referralDate: z.string().min(1, "Required"),
  appointmentDate: z.string().optional(),
  insuranceProvider: z.string().optional(),
  insuranceMemberId: z.string().optional(),
  insuranceGroup: z.string().optional(),
  authStatus: z.string().optional(),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface ReferralFormProps {
  practices: Practice[]
  defaultValues?: Partial<FormValues>
  referralId?: string
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide border-b pb-2 mb-4">
      {children}
    </h3>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

const NONE = "__none__"

export default function ReferralForm({ practices, defaultValues, referralId }: ReferralFormProps) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)
  const [files, setFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { status: ReferralStatus.NEW, referralDate: today, ...defaultValues },
  })

  const practiceId = watch("referringPracticeId")
  const locationId = watch("referringLocationId")
  const doctorId = watch("referringDoctorId")
  const statusValue = watch("status")

  const selectedPractice = practices.find((p) => p.id === practiceId)
  const availableLocations = selectedPractice?.locations ?? []
  const availableDoctors = (selectedPractice?.doctors ?? []).filter((d) => {
    if (!locationId || locationId === NONE) return true
    return d.locations.some((dl) => dl.locationId === locationId)
  })

  // Reset downstream selections when parent changes
  useEffect(() => {
    setValue("referringLocationId", "")
    setValue("referringDoctorId", "")
  }, [practiceId, setValue])

  useEffect(() => {
    setValue("referringDoctorId", "")
  }, [locationId, setValue])

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  function onSubmit(data: FormValues) {
    const clean = {
      ...data,
      referringPracticeId: data.referringPracticeId === NONE ? "" : (data.referringPracticeId ?? ""),
      referringLocationId: data.referringLocationId === NONE ? "" : (data.referringLocationId ?? ""),
      referringDoctorId: data.referringDoctorId === NONE ? "" : (data.referringDoctorId ?? ""),
    }
    startTransition(async () => {
      if (referralId) {
        await updateReferral(referralId, clean)
      } else {
        const result = await createReferral(clean)
        if (result && "id" in result && result.id) {
          const newId = result.id
          // Upload any attached files before navigating
          for (const file of files) {
            const fd = new FormData()
            fd.append("file", file)
            fd.append("referralId", newId)
            await fetch("/api/documents/upload", { method: "POST", body: fd })
          }
          router.push(`/referrals/${newId}`)
        }
      }
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

      {/* Patient Info */}
      <section>
        <SectionTitle>Patient Information</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="First Name *" error={errors.patientFirstName?.message}>
            <Input {...register("patientFirstName")} placeholder="Jane" />
          </Field>
          <Field label="Last Name *" error={errors.patientLastName?.message}>
            <Input {...register("patientLastName")} placeholder="Smith" />
          </Field>
          <Field label="Phone" error={errors.patientPhone?.message}>
            <Input {...register("patientPhone")} type="tel" placeholder="555-123-4567" />
          </Field>
          <Field label="Email" error={errors.patientEmail?.message}>
            <Input {...register("patientEmail")} type="email" placeholder="jane@example.com" />
          </Field>
          <Field label="Date of Birth" error={errors.patientDob?.message}>
            <Input {...register("patientDob")} type="date" />
          </Field>
        </div>
      </section>

      {/* Referring Source — cascading Practice → Location → Provider */}
      <section>
        <SectionTitle>Referring Source</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          <Field label="Practice" error={errors.referringPracticeId?.message}>
            <Select
              value={practiceId ?? NONE}
              onValueChange={(v) => setValue("referringPracticeId", v === NONE ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select practice..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— None —</SelectItem>
                {practices.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Location" error={errors.referringLocationId?.message}>
            <Select
              value={locationId ?? NONE}
              onValueChange={(v) => setValue("referringLocationId", v === NONE ? "" : v)}
              disabled={!practiceId}
            >
              <SelectTrigger>
                <SelectValue placeholder={!practiceId ? "Select practice first" : availableLocations.length === 0 ? "No locations added" : "Select location..."} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— Any location —</SelectItem>
                {availableLocations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}{l.address ? ` · ${l.address}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Provider" error={errors.referringDoctorId?.message}>
            <Select
              value={doctorId ?? NONE}
              onValueChange={(v) => setValue("referringDoctorId", v === NONE ? "" : v)}
              disabled={!practiceId}
            >
              <SelectTrigger>
                <SelectValue placeholder={!practiceId ? "Select practice first" : availableDoctors.length === 0 ? "No providers added" : "Select provider..."} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— None —</SelectItem>
                {availableDoctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}{d.specialty ? ` · ${d.specialty}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Provider name (if not listed above)" error={errors.referringDoctorName?.message}>
            <Input {...register("referringDoctorName")} placeholder="Dr. Johnson" />
          </Field>
        </div>
      </section>

      {/* Status & Dates */}
      <section>
        <SectionTitle>Status & Dates</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Status *" error={errors.status?.message}>
            <Select value={statusValue} onValueChange={(v) => setValue("status", v as ReferralStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.values(ReferralStatus).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Referral Date *" error={errors.referralDate?.message}>
            <Input {...register("referralDate")} type="date" />
          </Field>
          <Field label="Appointment Date" error={errors.appointmentDate?.message}>
            <Input {...register("appointmentDate")} type="date" />
          </Field>
        </div>
      </section>

      {/* Insurance */}
      <section>
        <SectionTitle>Insurance</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Insurance Provider" error={errors.insuranceProvider?.message}>
            <Input {...register("insuranceProvider")} placeholder="Blue Cross Blue Shield" />
          </Field>
          <Field label="Member ID" error={errors.insuranceMemberId?.message}>
            <Input {...register("insuranceMemberId")} placeholder="XYZ123456" />
          </Field>
          <Field label="Group Number" error={errors.insuranceGroup?.message}>
            <Input {...register("insuranceGroup")} placeholder="GRP001" />
          </Field>
          <Field label="Auth Status" error={errors.authStatus?.message}>
            <Input {...register("authStatus")} placeholder="Approved / Pending / Not Required" />
          </Field>
        </div>
      </section>

      {/* Notes */}
      <section>
        <SectionTitle>Notes</SectionTitle>
        <Textarea {...register("notes")} placeholder="Additional notes about this referral..." rows={4} />
      </section>

      {/* Documents (new referral only) */}
      {!referralId && (
        <section>
          <SectionTitle>Documents</SectionTitle>
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
              className="hidden"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? [])
                setFiles((prev) => {
                  const existing = new Set(prev.map((f) => f.name + f.size))
                  return [...prev, ...picked.filter((f) => !existing.has(f.name + f.size))]
                })
                // Reset input so same file can be re-added after removal
                e.target.value = ""
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4 mr-2" />
              Attach files
            </Button>
            {files.length > 0 && (
              <ul className="space-y-1.5">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm bg-slate-50 border rounded px-3 py-1.5">
                    <Paperclip className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="flex-1 truncate text-slate-700">{f.name}</span>
                    <span className="text-xs text-slate-400 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                    <button type="button" onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-slate-400">PDF, images, or Word documents · max 10 MB each</p>
          </div>
        </section>
      )}

      <div className="flex justify-end gap-3 pt-2 border-t">
        <Button type="button" variant="outline" onClick={() => history.back()}>Cancel</Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {referralId ? "Save Changes" : "Create Referral"}
        </Button>
      </div>
    </form>
  )
}
