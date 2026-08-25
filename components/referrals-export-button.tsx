"use client"

import { useState } from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import ExportDialog from "@/components/ui/export-dialog"

// Opens the shared ExportDialog and downloads from the server export route,
// passing the currently-visible columns so the CSV matches the on-screen table.
export default function ReferralsExportButton({ exportParams }: { exportParams: string }) {
  const [open, setOpen] = useState(false)
  const [cols, setCols] = useState<string[]>([])
  const today = new Date().toISOString().slice(0, 10)

  function openExport() {
    try {
      const r = JSON.parse(localStorage.getItem("referralCols") || "null")
      setCols(Array.isArray(r?.columns) ? r.columns.filter((c: any) => typeof c === "string") : [])
    } catch { setCols([]) }
    setOpen(true)
  }

  const colParams = cols.map((c) => `col=${encodeURIComponent(c)}`).join("&")
  const qs = [exportParams, colParams].filter(Boolean).join("&")

  return (
    <>
      <Button variant="outline" onClick={openExport}>
        <Download className="h-4 w-4 mr-2" />
        Export
      </Button>
      <ExportDialog
        open={open}
        onClose={() => setOpen(false)}
        subject="referrals"
        defaultName={`referrals-${today}`}
        href={`/api/referrals/export${qs ? `?${qs}` : ""}`}
      />
    </>
  )
}
