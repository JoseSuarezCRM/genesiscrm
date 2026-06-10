"use client"

import { Search, Settings } from "lucide-react"
import Link from "next/link"
import NotificationBell from "@/components/notification-bell"

type Notification = {
  id: string
  message: string
  link: string | null
  read: boolean
  createdAt: Date
}

interface TopToolbarProps {
  initialNotifications: Notification[]
}

export default function TopToolbar({ initialNotifications }: TopToolbarProps) {
  return (
    <div className="border-b border-slate-200 bg-white px-6 py-2 flex items-center justify-between shrink-0">
      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 focus:bg-white transition-colors"
          />
        </div>
      </div>
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
