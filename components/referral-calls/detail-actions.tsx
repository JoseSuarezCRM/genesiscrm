"use client"

/**
 * A referral call's detail page: reopen it in the intake, or copy its texts
 * without opening anything.
 */

import Link from "next/link"
import { PhoneIncoming } from "lucide-react"
import { CopyButton, CopyFallback } from "./fields"

export default function ReferralCallDetailActions({
  recordId, surgeonText, epicNote, canEdit,
}: {
  recordId: string
  surgeonText: string
  epicNote: string
  canEdit: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {canEdit && (
        <Link href={`/on-call/${recordId}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800">
          <PhoneIncoming className="h-3.5 w-3.5" /> Open in intake
        </Link>
      )}
      <CopyButton text={surgeonText} label="Copy surgeon text" disabled={!surgeonText.trim()} />
      <CopyButton text={epicNote} label="Copy Epic note" disabled={!epicNote.trim()} />
      <div className="fixed bottom-4 right-4 z-50 w-[min(28rem,calc(100vw-2rem))] empty:hidden">
        <CopyFallback />
      </div>
    </div>
  )
}
