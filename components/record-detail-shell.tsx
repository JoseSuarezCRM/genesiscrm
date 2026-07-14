import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import type { ReactNode } from "react"

/**
 * The standard record page — the same three-column layout Referrals uses, so every
 * object (Provider, Practice, Location, Surgery, custom objects) reads the same.
 *
 * HubSpot-style: the record header (back link, title, engagement bar, Actions) lives
 * at the TOP of the LEFT column, so all three columns start at the same top edge.
 *
 * LEFT   — header + record details / property cards
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
    <div className="p-6 lg:h-[calc(100vh-1rem)] lg:flex lg:flex-col">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:flex-1 lg:min-h-0 lg:grid-rows-[minmax(0,1fr)]">
        {/* LEFT: record header + property cards */}
        <div className="lg:col-span-1 space-y-4 lg:overflow-y-auto lg:pr-1">
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Link href={backHref} className="inline-flex items-center text-xs text-slate-500 hover:text-slate-800">
                <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> {backLabel}
              </Link>
              {actions}
            </div>

            <div>
              <h1 className="text-lg font-bold text-slate-900 break-words">{title}</h1>
              {(badges || subtitle) && (
                <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-slate-500">
                  {badges}
                  {subtitle}
                </div>
              )}
            </div>

            {engagementBar}
          </div>

          {left}
        </div>

        {/* MIDDLE */}
        <div className="lg:col-span-2 space-y-6 lg:overflow-y-auto lg:pr-1">{middle}</div>

        {/* RIGHT */}
        <div className="lg:col-span-1 space-y-4 lg:overflow-y-auto lg:pr-1">{right}</div>
      </div>
    </div>
  )
}
