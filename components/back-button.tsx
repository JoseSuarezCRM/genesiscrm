"use client"

import { useRouter } from "next/navigation"
import { ChevronLeft } from "lucide-react"

export default function BackButton({ label = "Back", fallback = "/" }: { label?: string; fallback?: string }) {
  const router = useRouter()
  return (
    <button
      onClick={() => router.back()}
      className="inline-flex items-center text-sm text-slate-500 hover:text-slate-800 mb-3"
    >
      <ChevronLeft className="h-4 w-4 mr-1" />
      {label}
    </button>
  )
}
