"use client"

import { useTransition, useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ReferralStatus } from "@prisma/client"
import { createReferral, updateReferral } from "@/app/actions/referrals"
import { createPractice, createLocation, createDoctor } from "@/app/actions/referring-doctors"
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { STATUS_LABELS } from "@/lib/utils"
import { CheckCircle2, FileText, Info, Loader2, Paperclip, X } from "lucide-react"
import { PhoneInput } from "@/components/ui/phone-input"
import type { ExtractedReferralData, PendingFile } from "@/app/api/fax/extract/route"

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
  patientMrn: z.string().optional(),
  patientPhone: z.string().optional(),
  patientEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  patientDob: z.string().optional(),
  referringPracticeId: z.string().optional(),
  referringLocationId: z.string().optional(),
  referringDoctorId: z.string().optional(),
  referringDoctorName: z.string().optional(),
  referringNpi: z.string().optional(),
  referringPhone: z.string().optional(),
  referringAddress: z.string().optional(),
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
  prefillData?: ExtractedReferralData
  pendingFile?: PendingFile | null
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
const CREATE_PRACTICE = "__create_practice__"
const CREATE_LOCATION = "__create_location__"
const CREATE_DOCTOR = "__create_doctor__"
const PENDING_PRACTICE_ID = "__pending_practice__"
const PENDING_LOCATION_ID = "__pending_location__"
const PENDING_DOCTOR_ID = "__pending_doctor__"

// Extract title prefix/suffix from a doctor name string
function parseDoctorTitle(fullName: string): { name: string; title?: string } {
  let name = fullName.trim()
  let title: string | undefined
  if (name.startsWith("Dr.")) { title = "Dr."; name = name.slice(3).trim() }
  else if (name.toLowerCase().startsWith("dr ")) { title = "Dr."; name = name.slice(3).trim() }
  else {
    for (const sfx of [", MD", ", DO", ", NP", ", PA-C", ", DPM", ", APRN", " MD", " DO", " NP", " DPM", " APRN"]) {
      if (name.endsWith(sfx)) { title = sfx.replace(", ", "").trim(); name = name.slice(0, -sfx.length).trim(); break }
    }
  }
  return { name, title }
}

export default function ReferralForm({ practices, defaultValues, referralId, prefillData, pendingFile }: ReferralFormProps) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)
  const [files, setFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Local practice list so newly created items appear immediately
  const [localPractices, setLocalPractices] = useState<Practice[]>(practices)

  // Inline dialog visibility
  const [showNewPractice, setShowNewPractice] = useState(false)
  const [showNewLocation, setShowNewLocation] = useState(false)
  const [showNewDoctor, setShowNewDoctor] = useState(false)

  // New practice dialog state
  const [newPracticeName, setNewPracticeName] = useState("")
  const [newPracticePhone, setNewPracticePhone] = useState("")
  const [newPracticeAddress, setNewPracticeAddress] = useState("")
  const [newPracticeError, setNewPracticeError] = useState<string | null>(null)
  const [newPracticePending, startNewPracticeTransition] = useTransition()

  // New location dialog state
  const [newLocationName, setNewLocationName] = useState("")
  const [newLocationAddress, setNewLocationAddress] = useState("")
  const [newLocationError, setNewLocationError] = useState<string | null>(null)
  const [newLocationPending, startNewLocationTransition] = useTransition()

  // Pending records to create on submit (from fax extraction — not created until user saves)
  const [pendingPracticeData, setPendingPracticeData] = useState<{ name: string; phone?: string; address?: string } | null>(null)
  const [pendingLocationData, setPendingLocationData] = useState<{ name: string; address?: string; phone?: string } | null>(null)
  const [pendingDoctorData, setPendingDoctorData] = useState<{ name: string; title?: string; npi?: string } | null>(null)

  // Notice banner: names of records that will be created on save
  const [autoCreatedPractice, setAutoCreatedPractice] = useState<string | null>(null)
  const [autoCreatedProvider, setAutoCreatedProvider] = useState<string | null>(null)


  // New doctor dialog state
  const [newDoctorName, setNewDoctorName] = useState("")
  const [newDoctorTitle, setNewDoctorTitle] = useState("")
  const [newDoctorNpi, setNewDoctorNpi] = useState("")
  const [newDoctorError, setNewDoctorError] = useState<string | null>(null)
  const [newDoctorPending, startNewDoctorTransition] = useTransition()

  const { register, handleSubmit, setValue, watch, control, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { status: ReferralStatus.NEW, referralDate: today, ...defaultValues },
  })

  // When fax extraction data arrives, atomically pre-fill all extracted fields
  useEffect(() => {
    if (!prefillData) return

    async function applyPrefill() {
      if (!prefillData) return

      // Try to match the extracted org name to an existing practice.
      // Scoring: exact > one starts with the other > one contains the other.
      // Picks the highest-scoring match; on a tie, prefers the closest length (most specific).
      let matchedPracticeId: string | undefined
      if (prefillData.referringOrg) {
        const a = prefillData.referringOrg.toLowerCase().trim()
        const scored = localPractices.map((p) => {
          const b = p.name.toLowerCase().trim()
          let score = 0
          if (a === b) score = 100
          else if (b.startsWith(a) || a.startsWith(b)) score = 80
          else if (b.includes(a) || a.includes(b)) score = 60
          return { p, score }
        }).filter((x) => x.score > 0)

        if (scored.length > 0) {
          scored.sort((x, y) => y.score - x.score || Math.abs(x.p.name.length - prefillData.referringOrg!.length) - Math.abs(y.p.name.length - prefillData.referringOrg!.length))
          matchedPracticeId = scored[0].p.id
        } else {
          // No match — stage for creation on submit (ghost entry in local state only)
          setPendingPracticeData({
            name: prefillData.referringOrg,
            phone: prefillData.referringPhone ?? undefined,
            address: prefillData.referringAddress ?? undefined,
          })
          setLocalPractices((prev) => [...prev, {
            id: PENDING_PRACTICE_ID,
            name: prefillData.referringOrg!,
            locations: [],
            doctors: [],
          }])
          matchedPracticeId = PENDING_PRACTICE_ID
          setAutoCreatedPractice(prefillData.referringOrg)
        }
      }

      // Auto-create location if address was extracted and practice was matched/created
      let matchedLocationId: string | undefined
      if (prefillData.referringAddress && matchedPracticeId) {
        const locName = prefillData.referringAddress
        // Stage location for creation on submit (ghost entry only)
        setPendingLocationData({
          name: locName,
          address: prefillData.referringAddress,
          phone: prefillData.referringPhone ?? undefined,
        })
        matchedLocationId = PENDING_LOCATION_ID
        setLocalPractices((prev) =>
          prev.map((p) =>
            p.id !== matchedPracticeId ? p : {
              ...p,
              locations: [...p.locations, {
                id: PENDING_LOCATION_ID,
                name: locName,
                address: prefillData.referringAddress,
              }],
            }
          )
        )
      }

      // Auto-create provider if a name was extracted and practice was matched/created
      let matchedDoctorId: string | undefined
      if (prefillData.referringDoctorName && matchedPracticeId) {
        const practiceInList = localPractices.find((p) => p.id === matchedPracticeId)
          ?? { id: matchedPracticeId, name: "", locations: [], doctors: [] }

        const { name: parsedName, title: parsedTitle } = parseDoctorTitle(prefillData.referringDoctorName)

        const existingDoctor = practiceInList.doctors.find(
          (d) => d.name.toLowerCase().trim() === parsedName.toLowerCase().trim()
        )

        if (existingDoctor) {
          matchedDoctorId = existingDoctor.id
        } else {
          // Stage doctor for creation on submit (ghost entry only)
          setPendingDoctorData({ name: parsedName, title: parsedTitle, npi: prefillData.referringNpi ?? undefined })
          matchedDoctorId = PENDING_DOCTOR_ID
          setLocalPractices((prev) =>
            prev.map((p) =>
              p.id !== matchedPracticeId ? p : {
                ...p,
                doctors: [...p.doctors, {
                  id: PENDING_DOCTOR_ID,
                  name: parsedName,
                  specialty: null,
                  locations: matchedLocationId ? [{ locationId: matchedLocationId }] : [],
                }],
              }
            )
          )
          setAutoCreatedProvider(prefillData.referringDoctorName)
        }
      }

      reset({
        status: ReferralStatus.NEW,
        referralDate: today,
        ...(prefillData.patientFirstName && { patientFirstName: prefillData.patientFirstName }),
        ...(prefillData.patientLastName && { patientLastName: prefillData.patientLastName }),
        ...(prefillData.patientDob && { patientDob: prefillData.patientDob }),
        ...(prefillData.patientPhone && { patientPhone: prefillData.patientPhone }),
        ...(prefillData.patientEmail && { patientEmail: prefillData.patientEmail }),
        ...(prefillData.patientMrn && { patientMrn: prefillData.patientMrn }),
        ...(matchedPracticeId && { referringPracticeId: matchedPracticeId }),
        // Don't include location/doctor here — cascade effects will clear them.
        // We set them after effects settle via setTimeout below.
        ...(prefillData.referringDoctorName && !matchedDoctorId && { referringDoctorName: prefillData.referringDoctorName }),
        ...(prefillData.referringNpi && { referringNpi: prefillData.referringNpi }),
        ...(prefillData.referringPhone && { referringPhone: prefillData.referringPhone }),
        // Skip referringAddress if a location record was created — address is stored there
        ...(!matchedLocationId && prefillData.referringAddress && { referringAddress: prefillData.referringAddress }),
        ...(prefillData.insuranceProvider && { insuranceProvider: prefillData.insuranceProvider }),
        ...(prefillData.insuranceMemberId && { insuranceMemberId: prefillData.insuranceMemberId }),
        ...(prefillData.notes && { notes: prefillData.notes }),
      })

      // Set location and doctor AFTER cascade effects have cleared them
      if (matchedLocationId || matchedDoctorId) {
        setTimeout(() => {
          if (matchedLocationId) setValue("referringLocationId", matchedLocationId)
          if (matchedDoctorId) setValue("referringDoctorId", matchedDoctorId)
        }, 0)
      }
    }

    applyPrefill()
  }, [prefillData, reset, today]) // eslint-disable-line react-hooks/exhaustive-deps

  const practiceId = watch("referringPracticeId")
  const locationId = watch("referringLocationId")
  const doctorId = watch("referringDoctorId")
  const statusValue = watch("status")

  const selectedPractice = localPractices.find((p) => p.id === practiceId)
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

  // ─── Inline create handlers ────────────────────────────────────────────────

  function handleCreatePractice() {
    if (!newPracticeName.trim()) { setNewPracticeError("Name is required"); return }
    setNewPracticeError(null)
    startNewPracticeTransition(async () => {
      const result = await createPractice({ name: newPracticeName.trim(), phone: newPracticePhone, address: newPracticeAddress })
      if (!("id" in result)) { setNewPracticeError("Failed to create practice"); return }
      const createdId = result.id as string
      if ("duplicate" in result && result.duplicate) {
        // Already exists — just select it
        setValue("referringPracticeId", createdId)
        setNewPracticeName(""); setNewPracticePhone(""); setNewPracticeAddress("")
        setShowNewPractice(false)
        return
      }
      setLocalPractices((prev) => [...prev, { id: createdId, name: newPracticeName.trim(), locations: [], doctors: [] }].sort((a, b) => a.name.localeCompare(b.name)))
      setValue("referringPracticeId", createdId)
      setNewPracticeName(""); setNewPracticePhone(""); setNewPracticeAddress("")
      setShowNewPractice(false)
    })
  }

  function handleCreateLocation() {
    if (!newLocationName.trim()) { setNewLocationError("Name is required"); return }
    if (!practiceId) return
    setNewLocationError(null)
    startNewLocationTransition(async () => {
      const result = await createLocation({ name: newLocationName.trim(), address: newLocationAddress, practiceId })
      if (!("id" in result)) { setNewLocationError("Failed to create location"); return }
      const createdId = result.id as string
      if ("duplicate" in result && result.duplicate) {
        setValue("referringLocationId", createdId)
        setNewLocationName(""); setNewLocationAddress("")
        setShowNewLocation(false)
        return
      }
      const newLoc: Location = { id: createdId, name: newLocationName.trim(), address: newLocationAddress || null }
      setLocalPractices((prev) => prev.map((p) =>
        p.id === practiceId ? { ...p, locations: [...p.locations, newLoc] } : p
      ))
      setValue("referringLocationId", createdId)
      setNewLocationName(""); setNewLocationAddress("")
      setShowNewLocation(false)
    })
  }

  function handleCreateDoctor() {
    if (!newDoctorName.trim()) { setNewDoctorError("Name is required"); return }
    if (!practiceId) return
    setNewDoctorError(null)
    startNewDoctorTransition(async () => {
      const result = await createDoctor({ name: newDoctorName.trim(), title: newDoctorTitle, npi: newDoctorNpi, practiceId, locationIds: [] })
      if (!("id" in result)) { setNewDoctorError("Failed to create provider"); return }
      const createdId = result.id as string
      if ("duplicate" in result && result.duplicate) {
        setValue("referringDoctorId", createdId)
        setNewDoctorName(""); setNewDoctorTitle(""); setNewDoctorNpi("")
        setShowNewDoctor(false)
        return
      }
      const newDoc: Doctor = { id: createdId, name: newDoctorName.trim(), specialty: null, locations: [] }
      setLocalPractices((prev) => prev.map((p) =>
        p.id === practiceId ? { ...p, doctors: [...p.doctors, newDoc] } : p
      ))
      setValue("referringDoctorId", createdId)
      setNewDoctorName(""); setNewDoctorTitle(""); setNewDoctorNpi("")
      setShowNewDoctor(false)
    })
  }

  // ─── Submit ────────────────────────────────────────────────────────────────

  function onSubmit(data: FormValues) {
    startTransition(async () => {
      // Resolve any pending (fax-extracted) records before saving
      let resolvedPracticeId = data.referringPracticeId === NONE ? "" : (data.referringPracticeId ?? "")
      let resolvedLocationId = data.referringLocationId === NONE ? "" : (data.referringLocationId ?? "")
      let resolvedDoctorId = data.referringDoctorId === NONE ? "" : (data.referringDoctorId ?? "")

      if (resolvedPracticeId === PENDING_PRACTICE_ID && pendingPracticeData) {
        const r = await createPractice(pendingPracticeData)
        resolvedPracticeId = (r as { id?: string }).id ?? ""
      }
      if (resolvedLocationId === PENDING_LOCATION_ID && pendingLocationData && resolvedPracticeId) {
        const r = await createLocation({ ...pendingLocationData, practiceId: resolvedPracticeId })
        resolvedLocationId = (r as { id?: string }).id ?? ""
      }
      if (resolvedDoctorId === PENDING_DOCTOR_ID && pendingDoctorData && resolvedPracticeId) {
        const r = await createDoctor({
          ...pendingDoctorData,
          practiceId: resolvedPracticeId,
          locationIds: resolvedLocationId ? [resolvedLocationId] : [],
        })
        resolvedDoctorId = (r as { id?: string }).id ?? ""
      }

      const clean = {
        ...data,
        referringPracticeId: resolvedPracticeId,
        referringLocationId: resolvedLocationId,
        referringDoctorId: resolvedDoctorId,
      }

      if (referralId) {
        await updateReferral(referralId, clean)
      } else {
        const result = await createReferral(clean, pendingFile)
        if (result && "id" in result && result.id) {
          const newId = result.id
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
    <>
      {(autoCreatedPractice || autoCreatedProvider) && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 mb-4">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
          <span>
            Extracted from fax — the following will be created when you save:{" "}
            {autoCreatedPractice && <><strong>&quot;{autoCreatedPractice}&quot;</strong> (practice){autoCreatedProvider ? " and " : ""}</>}
            {autoCreatedProvider && <><strong>&quot;{autoCreatedProvider}&quot;</strong> (provider)</>}.
            {" "}You can edit these anytime in <strong>Practice Manager</strong> after saving.
          </span>
        </div>
      )}
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
            <Field label="MRN" error={errors.patientMrn?.message}>
              <Input {...register("patientMrn")} placeholder="Medical Record Number" />
            </Field>
            <Field label="Date of Birth" error={errors.patientDob?.message}>
              <Input {...register("patientDob")} type="date" />
            </Field>
            <Field label="Phone" error={errors.patientPhone?.message}>
              <Controller
                name="patientPhone"
                control={control}
                render={({ field }) => (
                  <PhoneInput value={field.value} onChange={field.onChange} />
                )}
              />
            </Field>
            <Field label="Email" error={errors.patientEmail?.message}>
              <Input {...register("patientEmail")} type="email" placeholder="jane@example.com" />
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
                onValueChange={(v) => {
                  if (v === CREATE_PRACTICE) { setShowNewPractice(true); return }
                  setValue("referringPracticeId", v === NONE ? "" : v)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select practice..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— None —</SelectItem>
                  {localPractices.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                  <SelectItem value={CREATE_PRACTICE} className="text-blue-600 font-medium">
                    + Add new practice
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Location" error={errors.referringLocationId?.message}>
              <Select
                value={locationId ?? NONE}
                onValueChange={(v) => {
                  if (v === CREATE_LOCATION) { setShowNewLocation(true); return }
                  setValue("referringLocationId", v === NONE ? "" : v)
                }}
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
                  {practiceId && (
                    <SelectItem value={CREATE_LOCATION} className="text-blue-600 font-medium">
                      + Add new location
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Provider" error={errors.referringDoctorId?.message}>
              <Select
                value={doctorId ?? NONE}
                onValueChange={(v) => {
                  if (v === CREATE_DOCTOR) { setShowNewDoctor(true); return }
                  setValue("referringDoctorId", v === NONE ? "" : v)
                }}
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
                  {practiceId && (
                    <SelectItem value={CREATE_DOCTOR} className="text-blue-600 font-medium">
                      + Add new provider
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Provider name (if not listed above)" error={errors.referringDoctorName?.message}>
              <Input {...register("referringDoctorName")} placeholder="Dr. Johnson" />
            </Field>
            <Field label="NPI" error={errors.referringNpi?.message}>
              <Input {...register("referringNpi")} placeholder="10-digit NPI number" />
            </Field>
            <Field label="Referring Phone" error={errors.referringPhone?.message}>
              <Controller
                name="referringPhone"
                control={control}
                render={({ field }) => (
                  <PhoneInput value={field.value} onChange={field.onChange} />
                )}
              />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Referring Address" error={errors.referringAddress?.message}>
              <Input {...register("referringAddress")} placeholder="123 Main St, City, State 12345" />
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
                  e.target.value = ""
                }}
              />
              {pendingFile && (
                <div className="flex items-center gap-2 text-sm bg-green-50 border border-green-200 rounded px-3 py-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="flex-1 truncate text-slate-700">{pendingFile.name}</span>
                  <span className="text-xs text-green-600 shrink-0">Fax · will attach on save</span>
                </div>
              )}
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

      {/* ── New Practice Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showNewPractice} onOpenChange={setShowNewPractice}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Practice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Field label="Practice Name *">
              <Input
                value={newPracticeName}
                onChange={(e) => setNewPracticeName(e.target.value)}
                placeholder="City Orthopedics"
                autoFocus
              />
            </Field>
            <Field label="Phone">
              <PhoneInput value={newPracticePhone} onChange={setNewPracticePhone} />
            </Field>
            <Field label="Address">
              <Input
                value={newPracticeAddress}
                onChange={(e) => setNewPracticeAddress(e.target.value)}
                placeholder="123 Main St, City, State 12345"
              />
            </Field>
            {newPracticeError && <p className="text-xs text-red-600">{newPracticeError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowNewPractice(false)}>Cancel</Button>
              <Button type="button" disabled={newPracticePending} onClick={handleCreatePractice}>
                {newPracticePending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Practice
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── New Location Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showNewLocation} onOpenChange={setShowNewLocation}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Location</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Field label="Location Name *">
              <Input
                value={newLocationName}
                onChange={(e) => setNewLocationName(e.target.value)}
                placeholder="Main Office"
                autoFocus
              />
            </Field>
            <Field label="Address">
              <Input
                value={newLocationAddress}
                onChange={(e) => setNewLocationAddress(e.target.value)}
                placeholder="123 Main St, City, State 12345"
              />
            </Field>
            {newLocationError && <p className="text-xs text-red-600">{newLocationError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowNewLocation(false)}>Cancel</Button>
              <Button type="button" disabled={newLocationPending} onClick={handleCreateLocation}>
                {newLocationPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Location
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── New Provider Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showNewDoctor} onOpenChange={setShowNewDoctor}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Provider</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Field label="Provider Name *">
              <Input
                value={newDoctorName}
                onChange={(e) => setNewDoctorName(e.target.value)}
                placeholder="Dr. Jane Smith"
                autoFocus
              />
            </Field>
            <Field label="Title">
              <Select value={newDoctorTitle || NONE} onValueChange={(v) => setNewDoctorTitle(v === NONE ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select title..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— None —</SelectItem>
                  {["MD", "DO", "NP", "PA-C", "DPM", "Other"].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="NPI">
              <Input
                value={newDoctorNpi}
                onChange={(e) => setNewDoctorNpi(e.target.value)}
                placeholder="10-digit NPI number"
              />
            </Field>
            {newDoctorError && <p className="text-xs text-red-600">{newDoctorError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowNewDoctor(false)}>Cancel</Button>
              <Button type="button" disabled={newDoctorPending} onClick={handleCreateDoctor}>
                {newDoctorPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Provider
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
