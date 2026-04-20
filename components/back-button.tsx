"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"

export default function BackButton({ label = "Back", href }: { label?: string; fallback?: string; href?: string }) {
  const router = useRouter()
  const cls = "inline-flex items-center text-sm text-slate-500 hover:text-slate-800 mb-3"
  if (href) {
    return (
      <Link href={href} className={cls}>
        <ChevronLeft className="h-4 w-4 mr-1" />
        {label}
      </Link>
    )
  }
  return (
    <button onClick={() => router.back()} className={cls}>
      <ChevronLeft className="h-4 w-4 mr-1" />
      {label}
    </button>
  )
}
