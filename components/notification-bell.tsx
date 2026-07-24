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
}

export default function NotificationBell({ initialNotifications }: Props) {
  const [open, setOpen] = useState(false)
  // Keep the panel mounted through its close animation before removing it.
  const [render, setRender] = useState(false)
  const [notifications, setNotifications] = useState(initialNotifications)
  const [isPending, startTransition] = useTransition()
  const panelRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const unreadCount = notifications.filter(n => !n.read).length

  useEffect(() => { setNotifications(initialNotifications) }, [initialNotifications])
  useEffect(() => { if (open) setRender(true) }, [open])

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
          "relative flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors",
          open && "bg-slate-100 text-slate-700"
        )}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {render && (
        <div
          data-state={open ? "open" : "closed"}
          onAnimationEnd={() => { if (!open) setRender(false) }}
          className={cn(
            "absolute top-12 right-0 origin-top-right bg-white border border-slate-200 rounded-xl shadow-lg w-80 max-h-[420px] flex flex-col z-50",
            open ? "animate-dropdown-in" : "animate-dropdown-out"
          )}
        >
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
