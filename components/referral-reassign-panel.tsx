"use client"

import { useState, useTransition } from "react"
import { updateReferral } from "@/app/actions/referrals"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Building2, User, Loader2 } from "lucide-react"

interface Practice {
  id: string
  name: string
  doctors: { id: string; name: string; title: string | null }[]
}

interface Props {
  referralId: string
  currentPracticeId: string | null
  currentProviderId: string | null
  practices: Practice[]
  onUpdate?: () => void
}

export default function ReferralReassignPanel({
  referralId,
  currentPracticeId,
  currentProviderId,
  practices,
  onUpdate,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [selectedPracticeId, setSelectedPracticeId] = useState(currentPracticeId || "")
  const [selectedProviderId, setSelectedProviderId] = useState(currentProviderId || "")

  const currentPractice = practices.find((p) => p.id === selectedPracticeId)
  const availableProviders = currentPractice?.doctors || []

  const handleSave = () => {
    startTransition(async () => {
      await updateReferral(referralId, {
        practiceId: selectedPracticeId || undefined,
        referringDoctorId: selectedProviderId || undefined,
      })
      onUpdate?.()
    })
  }

  const hasChanges =
    selectedPracticeId !== currentPracticeId ||
    selectedProviderId !== currentProviderId

  return (
    <Card className="bg-blue-50 border-blue-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Building2 className="h-4 w-4 text-blue-600" />
          Reassign Referral
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-600">Account</label>
          <Select value={selectedPracticeId} onValueChange={setSelectedPracticeId}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select account..." />
            </SelectTrigger>
            <SelectContent>
              {practices.map((practice) => (
                <SelectItem key={practice.id} value={practice.id}>
                  {practice.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-600">Provider</label>
          <Select
            value={selectedProviderId}
            onValueChange={setSelectedProviderId}
            disabled={!selectedPracticeId}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select provider..." />
            </SelectTrigger>
            <SelectContent>
              {availableProviders.map((doctor) => (
                <SelectItem key={doctor.id} value={doctor.id}>
                  {doctor.name}
                  {doctor.title ? `, ${doctor.title}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasChanges && (
          <Button
            onClick={handleSave}
            disabled={isPending}
            className="w-full h-9"
            size="sm"
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
            Save Changes
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
