import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import type { ReactNode } from "react"

/**
 * The standard record page: the same three-column layout Referrals uses, so every
 * object (Provider, Practice, Location, Surgery, custom objects) reads the same.
 *
 * LEFT   — record details / property cards
 * MIDDLE — Overview + Activities
 * RIGHT  — related records
 */
export default function RecordDetailShell({
  backHref, backLabel, title, subtitle, badges, actions, engagementBar, left, middle, right,
}: {
  backHref: string
  backLabel: string
  title: ReactNode
  subtitle?: ReactNode
  badges?: ReactNode
  actions?: ReactNode
  engagementBar?: ReactNode
  left: ReactNode
  middle: ReactNode
  right?: ReactNode
}) {
  return (
    <div className="p-6 lg:h-[calc(100vh-1rem)] lg:flex lg:flex-col space-y-5">
      <div className="shrink-0">
        <Link href={backHref} className="inline-flex items-center text-sm text-slate-500 hover:text-slate-800 mb-3">
          <ChevronLeft className="h-4 w-4 mr-1" /> {backLabel}
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 truncate">{title}</h1>
            {(badges || subtitle) && (
              <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                {badges}
                {subtitle}
              </div>
            )}
            {engagementBar && <div className="mt-4">{engagementBar}</div>}
          </div>
          {actions && <div className="flex gap-2 shrink-0">{actions}</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:flex-1 lg:min-h-0 lg:grid-rows-[minmax(0,1fr)]">
        <div className="lg:col-span-1 space-y-4 lg:overflow-y-auto lg:pr-1">{left}</div>
        <div className="lg:col-span-2 space-y-6 lg:overflow-y-auto lg:pr-1">{middle}</div>
        <div className="lg:col-span-1 space-y-4 lg:overflow-y-auto lg:pr-1">{right}</div>
      </div>
    </div>
  )
}
