"use client"

import { useState } from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import ExportDialog from "@/components/ui/export-dialog"

// Opens the shared ExportDialog and downloads from the server export route.
export default function ReferralsExportButton({ exportParams }: { exportParams: string }) {
  const [open, setOpen] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Download className="h-4 w-4 mr-2" />
        Export
      </Button>
      <ExportDialog
        open={open}
        onClose={() => setOpen(false)}
        subject="referrals"
        defaultName={`referrals-${today}`}
        href={`/api/referrals/export${exportParams ? `?${exportParams}` : ""}`}
      />
    </>
  )
}
