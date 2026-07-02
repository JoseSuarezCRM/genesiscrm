"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { useState, useEffect, useRef } from "react"
import {
  Users,
  LogOut,
  ChevronLeft,
  ChevronRight,
  CalendarRange,
  ClipboardList,
  Stethoscope,
  Settings,
  MessageCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { userCanLevel } from "@/lib/permissions"

type NavItem = { href: string; label: string; object?: string }

const referralItems: NavItem[] = [
  { href: "/",                  label: "Dashboard" },
  { href: "/referrals",         label: "Referrals",  object: "REFERRALS" },
  { href: "/practices",         label: "Practices",  object: "PRACTICES" },
  { href: "/locations",         label: "Locations",  object: "LOCATIONS" },
  { href: "/referring-doctors", label: "Providers",  object: "PROVIDERS" },
  { href: "/activities",        label: "Activities", object: "ACTIVITIES" },
  { href: "/tasks",             label: "Tasks",      object: "TASKS" },
  { href: "/messages",          label: "SMS Inbox",  object: "SMS" },
  { href: "/reports",           label: "Reports",    object: "REPORTS" },
  { href: "/broadcasts",        label: "Broadcasts", object: "BROADCASTS" },
]

const appointmentItems: NavItem[] = [
  { href: "/appointments",           label: "Completed Appts" },
  { href: "/appointments/providers", label: "Referring Providers" },
]

const schedulingItems: NavItem[] = [
  { href: "/scheduler",       label: "Weekly Schedule" },
  { href: "/scheduler/staff", label: "Staff Roster" },
]

const surgeryItems: NavItem[] = [
  { href: "/surgery",         label: "Surgery Cases",   object: "SURGERY" },
  { href: "/surgery/reports", label: "Surgery Reports", object: "SURGERY" },
]

const communicationsItems: NavItem[] = [
  { href: "/communications/sms",   label: "SMS",   object: "TEMPLATES" },
  { href: "/communications/email", label: "Email", object: "TEMPLATES" },
]

const adminItems: NavItem[] = [
  { href: "/settings/outreach",   label: "Outreach Templates" },
  { href: "/settings/embed",      label: "Embed Referral Form" },
  { href: "/automations",         label: "Automations", object: "AUTOMATIONS" },
  { href: "/settings/duplicates", label: "Duplicate Detection" },
  { href: "/settings/reconcile",  label: "Appt Reconciliation" },
  { href: "/settings/marketing",  label: "Marketing Materials" },
]

const sections = [
  { key: "NAV_REFERRALS",    title: "Referrals",    icon: Users,         items: referralItems },
  { key: "NAV_APPOINTMENTS", title: "Appointments", icon: ClipboardList, items: appointmentItems },
  { key: "NAV_SCHEDULING",   title: "Scheduling",   icon: CalendarRange, items: schedulingItems },
  { key: "NAV_SURGERY",      title: "Surgery",      icon: Stethoscope,   items: surgeryItems },
  { key: "NAV_COMMUNICATIONS", title: "Communications", icon: MessageCircle, items: communicationsItems },
  { key: "NAV_ADMIN",        title: "Admin",        icon: Settings,      items: adminItems },
]

interface SidebarProps {
  userName: string | null | undefined
  userEmail: string
  userRole: string
  userPermissions: string[]
}

function isItemActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/")
}

export default function Sidebar({ userName, userEmail, userRole, userPermissions }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(true)
  const [openSection, setOpenSection] = useState<string | null>(null)
  const [flyoutTop, setFlyoutTop] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const isSuperAdmin = userRole === "ADMIN"
  const hasNavPerms = userPermissions.some(p => p.startsWith("NAV_"))
  // If no NAV_* perms set (no team assigned), show all non-admin sections
  const can = (key: string) => isSuperAdmin || (hasNavPerms ? userPermissions.includes(key) : key !== "NAV_ADMIN")
  // An item tied to an object is hidden when the user has no View access to it.
  const canViewItem = (item: { object?: string }) =>
    isSuperAdmin || !item.object || userCanLevel({ role: userRole, permissions: userPermissions }, item.object, "VIEW")

  const visibleSections = sections
    .filter((s) => can(s.key))
    .map((s) => ({ ...s, items: s.items.filter(canViewItem) }))
    .filter((s) => s.items.length > 0)
  const activeFlyout = visibleSections.find((s) => s.title === openSection)

  // Close the flyout after navigating
  useEffect(() => {
    setOpenSection(null)
  }, [pathname])

  // Close on outside click or Escape
  useEffect(() => {
    if (!openSection) return
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenSection(null)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenSection(null)
    }
    document.addEventListener("mousedown", onMouseDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onMouseDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [openSection])

  const handleSectionClick = (title: string, e: React.MouseEvent<HTMLButtonElement>) => {
    if (openSection === title) {
      setOpenSection(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    // Keep the panel on screen for sections near the bottom
    setFlyoutTop(Math.min(rect.top, Math.max(80, window.innerHeight - 420)))
    setOpenSection(title)
  }

  return (
    <div ref={containerRef} className="relative h-full shrink-0">
      <div
        className={cn(
          "relative flex flex-col h-full bg-slate-900 text-white transition-all duration-200",
          collapsed ? "w-16" : "w-56"
        )}
      >
        {/* Toggle button */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute -right-3 top-6 z-10 flex items-center justify-center w-6 h-6 bg-slate-700 hover:bg-slate-600 text-white rounded-full shadow transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>

        {/* Brand */}
        <div
          className={cn(
            "flex items-center gap-3 border-b border-slate-700 overflow-hidden shrink-0",
            collapsed ? "px-4 py-5 justify-center" : "px-5 py-5"
          )}
        >
          <Image src="/logo.png" alt="Genesis Ortho" width={40} height={40} className="rounded-lg shrink-0" />
          {!collapsed && (
            <div>
              <p className="font-semibold text-sm leading-tight">Genesis Ortho</p>
              <p className="text-xs text-slate-400 leading-tight">Referral CRM</p>
            </div>
          )}
        </div>

        {/* Navigation: top-level categories */}
        <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto sidebar-scroll">
          {visibleSections.map((section) => {
            const Icon = section.icon
            const hasActive = section.items.some((item) => isItemActive(item.href, pathname))
            const isOpen = openSection === section.title
            return (
              <button
                key={section.title}
                onClick={(e) => handleSectionClick(section.title, e)}
                title={collapsed ? section.title : undefined}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  collapsed && "justify-center px-2",
                  hasActive
                    ? "bg-blue-600 text-white"
                    : isOpen
                      ? "bg-slate-700 text-white"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">{section.title}</span>
                    <ChevronRight
                      className={cn(
                        "h-3.5 w-3.5 transition-transform",
                        isOpen ? "translate-x-0.5" : "",
                        hasActive ? "text-white/70" : "text-slate-500"
                      )}
                    />
                  </>
                )}
              </button>
            )
          })}
        </nav>

        {/* User footer */}
        <div className={cn("py-4 border-t border-slate-700 shrink-0", collapsed ? "px-2" : "px-3")}>
          {!collapsed && (
            <div className="flex items-center gap-3 px-3 py-2 mb-2">
              <div className="flex items-center justify-center w-8 h-8 bg-blue-500 rounded-full text-xs font-bold shrink-0">
                {(userName || userEmail).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{userName || "User"}</p>
                <p className="text-xs text-slate-400 truncate">{userEmail}</p>
              </div>
            </div>
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            title={collapsed ? "Sign Out" : undefined}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition-colors",
              collapsed && "justify-center px-2"
            )}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && "Sign Out"}
          </button>
        </div>
      </div>

      {/* Flyout panel */}
      {activeFlyout && (
        <div
          className="fixed z-50 w-56 max-h-[80vh] overflow-y-auto bg-slate-800 rounded-xl shadow-2xl shadow-black/40 border border-slate-700 py-2 px-2 animate-in fade-in slide-in-from-left-2 duration-150"
          style={{ top: flyoutTop, left: (collapsed ? 64 : 224) + 8 }}
        >
          <p className="px-3 pt-1.5 pb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {activeFlyout.title}
          </p>
          <div className="space-y-0.5">
            {activeFlyout.items.map((item) => {
              const isActive = isItemActive(item.href, pathname)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpenSection(null)}
                  className={cn(
                    "block px-3 py-2 rounded-lg text-sm transition-colors",
                    isActive
                      ? "bg-blue-600 text-white font-medium"
                      : "text-slate-200 hover:bg-slate-700 hover:text-white"
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
