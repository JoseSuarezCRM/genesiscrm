"use client"

import { Settings } from "lucide-react"
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
}

export default function TopToolbar({ initialNotifications, permissions }: TopToolbarProps) {
  return (
    <div className="border-b border-slate-200 bg-white px-6 py-1 flex items-center justify-between shrink-0">
      <SearchCommandPalette permissions={permissions} />
      <div className="flex items-center gap-2">
        <NotificationBell initialNotifications={initialNotifications} />
        <Link
          href="/settings/users"
          title="Settings"
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
        >
          <Settings className="h-5 w-5" />
        </Link>
      </div>
    </div>
  )
}
