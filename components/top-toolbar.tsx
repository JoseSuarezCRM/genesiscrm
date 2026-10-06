"use client"

import { Settings } from "lucide-react"
import { openableSettingsPages } from "@/lib/settings-pages"
import Link from "next/link"
import NotificationBell from "@/components/notification-bell"
import SearchCommandPalette from "@/components/search-command-palette"

type Notification = {
  id: string
  message: string
  link: string | null
  read: boolean
  createdAt: Date
}

interface TopToolbarProps {
  initialNotifications: Notification[]
  permissions: string[]
  isAdmin: boolean
}

export default function TopToolbar({ initialNotifications, permissions, isAdmin }: TopToolbarProps) {
  return (
    <div className="border-b border-slate-200 bg-white px-6 py-1 flex items-center justify-between shrink-0">
      <SearchCommandPalette permissions={permissions} isAdmin={isAdmin} />
      <div className="flex items-center gap-2">
        <NotificationBell initialNotifications={initialNotifications} />
        {/* Lands on the first settings page they can open (app/(dashboard)/settings/page.tsx). */}
        {openableSettingsPages({ role: isAdmin ? "ADMIN" : null, permissions }).length > 0 && (
          <Link
            href="/settings"
            title="Settings"
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <Settings className="h-5 w-5" />
          </Link>
        )}
      </div>
    </div>
  )
}
