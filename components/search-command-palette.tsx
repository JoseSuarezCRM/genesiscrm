"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Search, Lock } from "lucide-react"
import { cn } from "@/lib/utils"

interface SearchItem {
  id: string
  title: string
  category: string
  href: string
  requiredPermission?: string
}

const allItems: SearchItem[] = [
  // Referrals
  { id: "dashboard", title: "Dashboard", category: "Referrals", href: "/" },
  { id: "referrals", title: "Referrals", category: "Referrals", href: "/referrals" },
  { id: "practices", title: "Practices", category: "Referrals", href: "/practices" },
  { id: "providers", title: "Providers", category: "Referrals", href: "/referring-doctors" },
  { id: "activities", title: "Activities", category: "Referrals", href: "/activities" },
  { id: "tasks", title: "Tasks", category: "Referrals", href: "/tasks" },
  { id: "sms", title: "SMS Inbox", category: "Referrals", href: "/messages" },
  { id: "reports", title: "Reports", category: "Referrals", href: "/reports" },
  { id: "broadcasts", title: "Broadcasts", category: "Referrals", href: "/broadcasts" },

  // Appointments
  { id: "appts", title: "Completed Appts", category: "Appointments", href: "/appointments" },
  { id: "referring-providers", title: "Referring Providers", category: "Appointments", href: "/appointments/providers" },

  // Scheduling
  { id: "schedule", title: "Weekly Schedule", category: "Scheduling", href: "/scheduler" },
  { id: "staff", title: "Staff Roster", category: "Scheduling", href: "/scheduler/staff" },

  // Surgery
  { id: "surgery", title: "Surgery Cases", category: "Surgery", href: "/surgery" },
  { id: "surgery-reports", title: "Surgery Reports", category: "Surgery", href: "/surgery/reports" },

  // Admin/Settings
  { id: "settings", title: "Settings", category: "Admin", href: "/settings/users", requiredPermission: "NAV_ADMIN" },
  { id: "user-mgmt", title: "User Management", category: "Admin", href: "/settings/users", requiredPermission: "NAV_ADMIN" },
  { id: "custom-props", title: "Custom Properties", category: "Admin", href: "/settings/custom-properties", requiredPermission: "NAV_ADMIN" },
  { id: "pipelines", title: "Pipelines", category: "Admin", href: "/settings/pipelines", requiredPermission: "NAV_ADMIN" },
  { id: "org-rules", title: "Org Name Rules", category: "Admin", href: "/settings/org-rules", requiredPermission: "NAV_ADMIN" },
  { id: "automations", title: "Automations", category: "Admin", href: "/automations", requiredPermission: "NAV_ADMIN" },
  { id: "outreach", title: "Outreach Templates", category: "Admin", href: "/settings/outreach", requiredPermission: "NAV_ADMIN" },
  { id: "embed", title: "Embed Referral Form", category: "Admin", href: "/settings/embed", requiredPermission: "NAV_ADMIN" },
  { id: "duplicates", title: "Duplicate Detection", category: "Admin", href: "/settings/duplicates", requiredPermission: "NAV_ADMIN" },
  { id: "reconcile", title: "Appt Reconciliation", category: "Admin", href: "/settings/reconcile", requiredPermission: "NAV_ADMIN" },
]

interface Props {
  permissions: string[]
}

export default function SearchCommandPalette({ permissions }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const hasPermission = (item: SearchItem) => {
    if (!item.requiredPermission) return true
    return permissions.includes(item.requiredPermission)
  }

  const filteredItems = allItems.filter((item) => {
    // Include all items (both accessible and not)
    // Filter by search
    return (
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.category.toLowerCase().includes(search.toLowerCase())
    )
  })

  const groupedItems = filteredItems.reduce(
    (acc, item) => {
      const group = acc.find((g) => g.category === item.category)
      if (group) {
        group.items.push(item)
      } else {
        acc.push({ category: item.category, items: [item] })
      }
      return acc
    },
    [] as { category: string; items: SearchItem[] }[]
  )

  const flatItems = groupedItems.flatMap((g) => g.items)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen(!open)
        setSearch("")
        setSelected(0)
      }
      if (!open) return

      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelected((s) => (s < flatItems.length - 1 ? s + 1 : s))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelected((s) => (s > 0 ? s - 1 : 0))
      } else if (e.key === "Enter") {
        e.preventDefault()
        if (flatItems[selected]) {
          router.push(flatItems[selected].href)
          setOpen(false)
        }
      } else if (e.key === "Escape") {
        setOpen(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, flatItems, selected, router])

  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
    }
  }, [open])

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="relative flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search... (Cmd+K)"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setSelected(0)
            }}
            onFocus={() => setOpen(true)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 focus:bg-white transition-colors"
          />
        </div>

        {open && flatItems.length > 0 && (
          <div className="absolute top-12 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-96 overflow-y-auto">
            {groupedItems.map((group) => (
              <div key={group.category}>
                <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-50 sticky top-0">
                  {group.category}
                </div>
                {group.items.map((item) => {
                  const itemIndex = flatItems.indexOf(item)
                  const isSelected = itemIndex === selected
                  const canAccess = hasPermission(item)

                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (canAccess) {
                          router.push(item.href)
                        }
                        setOpen(false)
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors",
                        isSelected
                          ? "bg-blue-50 text-slate-900"
                          : "text-slate-700 hover:bg-slate-50",
                        !canAccess && "opacity-60 cursor-not-allowed"
                      )}
                    >
                      {!canAccess && <Lock className="h-4 w-4 text-slate-400" />}
                      <span>{item.title}</span>
                      {!canAccess && (
                        <span className="ml-auto text-xs text-slate-400">
                          No access
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        {open && search && flatItems.length === 0 && (
          <div className="absolute top-12 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg z-50 p-4">
            <p className="text-sm text-slate-500 text-center">No results found</p>
          </div>
        )}
      </div>
    </>
  )
}
