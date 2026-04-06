"use client"

import { useState, useTransition, useEffect, useRef } from "react"
import { Bell } from "lucide-react"
import { markNotificationRead, markAllNotificationsRead } from "@/app/actions/notifications"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { useRouter } from "next/navigation"

type Notification = {
  id: string
  message: string
  link: string | null
  read: boolean
  createdAt: Date
}

interface Props {
  initialNotifications: Notification[]
  collapsed: boolean
}

export default function NotificationBell({ initialNotifications, collapsed }: Props) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState(initialNotifications)
  const [isPending, startTransition] = useTransition()
  const panelRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const unreadCount = notifications.filter(n => !n.read).length

  // Sync with fresh server data on navigation
  useEffect(() => { setNotifications(initialNotifications) }, [initialNotifications])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [open])

  function handleRead(id: string, link: string | null) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    startTransition(async () => { await markNotificationRead(id) })
    if (link) { setOpen(false); router.push(link) }
  }

  function handleMarkAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    startTransition(async () => { await markAllNotificationsRead() })
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="Notifications"
        className={cn(
          "relative flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-slate-300 hover:bg-slate-800 hover:text-white",
          collapsed && "justify-center px-2",
          open && "bg-slate-800 text-white"
        )}
      >
        <Bell className="h-4 w-4 shrink-0" />
        {!collapsed && "Notifications"}
        {unreadCount > 0 && (
          <span className={cn(
            "flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold leading-none",
            collapsed ? "absolute top-1 right-1 w-4 h-4" : "ml-auto w-5 h-5"
          )}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={cn(
          "absolute z-50 bg-white border rounded-xl shadow-xl w-80 max-h-96 flex flex-col",
          collapsed ? "left-14 bottom-0" : "left-full ml-2 bottom-0"
        )}>
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <p className="text-sm font-semibold text-slate-800">Notifications</p>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} disabled={isPending} className="text-xs text-blue-600 hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No notifications yet.</p>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleRead(n.id, n.link)}
                  className={cn(
                    "w-full text-left px-4 py-3 border-b last:border-0 hover:bg-slate-50 transition-colors",
                    !n.read && "bg-blue-50"
                  )}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                    <div className={cn(!n.read ? "" : "pl-4")}>
                      <p className="text-sm text-slate-700 leading-snug">{n.message}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{new Date(n.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="px-4 py-2 border-t">
            <Link href="/tasks" onClick={() => setOpen(false)} className="text-xs text-blue-600 hover:underline">
              View all tasks →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
