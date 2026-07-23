"use client"

import { useRouter } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import SmartBackLink from "@/components/smart-back-link"

export default function BackButton({ label = "Back", href }: { label?: string; fallback?: string; href?: string }) {
  const router = useRouter()
  const cls = "inline-flex items-center text-sm text-slate-500 hover:text-slate-800 mb-3"
  // With an href, go back to the exact page + section the user came from when
  // possible, otherwise navigate to the href.
  if (href) {
    return (
      <SmartBackLink href={href} className={cls}>
        <ChevronLeft className="h-4 w-4 mr-1" />
        {label}
      </SmartBackLink>
    )
  }
  return (
    <button onClick={() => router.back()} className={cls}>
      <ChevronLeft className="h-4 w-4 mr-1" />
      {label}
    </button>
  )
}
