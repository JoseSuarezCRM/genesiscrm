"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { useState, useEffect } from "react"
import {
  Users,
  UserCheck,
  LayoutDashboard,
  LogOut,
  Settings,
  BarChart2,
  MessageSquare,
  Code2,
  Send,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CheckSquare,
  Zap,
  CopyX,
  CalendarDays,
  RefreshCw,
  ClipboardList,
  Building2,
  MessageCircle,
  CalendarRange,
  UsersRound,
} from "lucide-react"
import { cn } from "@/lib/utils"

const referralItems = [
  { href: "/",                  label: "Dashboard",           icon: LayoutDashboard },
  { href: "/referrals",         label: "Referrals",           icon: Users },
  { href: "/referring-doctors", label: "Referring Providers", icon: UserCheck },
  { href: "/activities",        label: "Activities",          icon: CalendarDays },
  { href: "/tasks",             label: "Tasks",               icon: CheckSquare },
  { href: "/messages",          label: "SMS Inbox",           icon: MessageCircle },
  { href: "/reports",           label: "Reports",             icon: BarChart2 },
  { href: "/broadcasts",        label: "Broadcasts",          icon: Send },
]

const appointmentItems = [
  { href: "/appointments",           label: "Completed Appts",     icon: ClipboardList },
  { href: "/appointments/providers", label: "Referring Providers", icon: Building2 },
]

const schedulingItems = [
  { href: "/scheduler",       label: "Weekly Schedule", icon: CalendarRange },
  { href: "/scheduler/staff", label: "Staff Roster",    icon: UsersRound },
]

const adminItems = [
  { href: "/settings/users",      label: "User Management",    icon: Settings },
  { href: "/settings/outreach",   label: "Outreach Templates", icon: MessageSquare },
  { href: "/settings/embed",      label: "Embed Referral Form",icon: Code2 },
  { href: "/automations",         label: "Automations",        icon: Zap },
  { href: "/settings/duplicates", label: "Duplicate Detection",icon: CopyX },
  { href: "/settings/reconcile",  label: "Appt Reconciliation",icon: RefreshCw },
  { href: "/settings/org-rules",  label: "Org Name Rules",     icon: Building2 },
]

interface SidebarProps {
  userName: string | null | undefined
  userEmail: string
  userRole: string
}

function NavLink({
  href,
  label,
  icon: Icon,
  isActive,
  collapsed,
}: {
  href: string
  label: string
  icon: React.ElementType
  isActive: boolean
  collapsed: boolean
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
        collapsed && "justify-center px-2",
        isActive
          ? "bg-blue-600 text-white"
          : "text-slate-300 hover:bg-slate-800 hover:text-white"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && label}
    </Link>
  )
}

interface SectionProps {
  title: string
  items: { href: string; label: string; icon: React.ElementType }[]
  pathname: string
  collapsed: boolean
  defaultOpen?: boolean
}

function NavSection({ title, items, pathname, collapsed, defaultOpen = true }: SectionProps) {
  const hasActive = items.some((item) =>
    item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/")
  )
  const [open, setOpen] = useState(defaultOpen || hasActive)

  // Auto-open if a child becomes active (e.g. on navigation)
  useEffect(() => {
    if (hasActive) setOpen(true)
  }, [hasActive])

  if (collapsed) {
    return (
      <>
        <div className="pt-2 border-t border-slate-700 mt-1 mb-1" />
        {items.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              isActive={isActive}
              collapsed
            />
          )
        })}
      </>
    )
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-1.5 mt-2 rounded-md group hover:bg-slate-800 transition-colors"
      >
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider group-hover:text-slate-400 transition-colors">
          {title}
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 text-slate-600 group-hover:text-slate-400 transition-all duration-200",
            open ? "rotate-0" : "-rotate-90"
          )}
        />
      </button>

      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          open ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="pt-0.5 space-y-0.5">
          {items.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(item.href + "/")
            return (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                isActive={isActive}
                collapsed={false}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function Sidebar({ userName, userEmail, userRole }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div
      className={cn(
        "relative flex flex-col h-full bg-slate-900 text-white transition-all duration-200 shrink-0",
        collapsed ? "w-16" : "w-64"
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
          collapsed ? "px-4 py-5 justify-center" : "px-6 py-5"
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

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto sidebar-scroll">
        <NavSection
          title="Referrals"
          items={referralItems}
          pathname={pathname}
          collapsed={collapsed}
          defaultOpen
        />

        <NavSection
          title="Appointments"
          items={appointmentItems}
          pathname={pathname}
          collapsed={collapsed}
          defaultOpen
        />

        <NavSection
          title="Scheduling"
          items={schedulingItems}
          pathname={pathname}
          collapsed={collapsed}
          defaultOpen={false}
        />

        {userRole === "ADMIN" && (
          <NavSection
            title="Admin"
            items={adminItems}
            pathname={pathname}
            collapsed={collapsed}
            defaultOpen={false}
          />
        )}
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
  )
}
