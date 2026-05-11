"use client"

import { useState } from "react"
import { Referral, ReferringPractice, PracticeLocation, ReferringDoctor, DoctorLocation } from "@prisma/client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Pencil } from "lucide-react"
import ReferralForm from "@/components/referral-form"

type PracticeWithRelations = ReferringPractice & {
  locations: PracticeLocation[]
  doctors: (ReferringDoctor & { locations: Pick<DoctorLocation, "locationId">[] })[]
}

interface Pipeline {
  id: string
  name: string
  color: string
}

interface Props {
  referral: Referral
  practices: PracticeWithRelations[]
  pipelines?: Pipeline[]
}

export default function EditReferralDialog({ referral, practices, pipelines = [] }: Props) {
  const [open, setOpen] = useState(false)

  const defaultValues = {
    patientFirstName: referral.patientFirstName,
    patientLastName: referral.patientLastName,
    patientMrn: referral.patientMrn ?? "",
    genesisMrn: (referral as any).genesisMrn ?? "",
    patientPhone: referral.patientPhone ?? "",
    patientEmail: referral.patientEmail ?? "",
    patientDob: referral.patientDob
      ? new Date(referral.patientDob).toISOString().slice(0, 10)
      : "",
    referringPracticeId: referral.referringPracticeId ?? "",
    referringLocationId: referral.referringLocationId ?? "",
    referringDoctorId: referral.referringDoctorId ?? "",
    referringDoctorName: referral.referringDoctorName ?? "",
    status: referral.status,
    referralDate: new Date(referral.referralDate).toISOString().slice(0, 10),
    appointmentDate: referral.appointmentDate
      ? new Date(referral.appointmentDate).toISOString().slice(0, 10)
      : "",
    insuranceProvider: referral.insuranceProvider ?? "",
    insuranceMemberId: referral.insuranceMemberId ?? "",
    insuranceGroup: referral.insuranceGroup ?? "",
    authStatus: referral.authStatus ?? "",
    notes: referral.notes ?? "",
    pipelineId: (referral as any).pipelineId ?? "",
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-4 w-4 mr-1.5" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Referral</DialogTitle>
        </DialogHeader>
        <ReferralForm
          practices={practices}
          pipelines={pipelines}
          defaultValues={defaultValues}
          referralId={referral.id}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
