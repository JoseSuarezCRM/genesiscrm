"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { useState } from "react"
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
} from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/",                  label: "Dashboard",          icon: LayoutDashboard },
  { href: "/referrals",         label: "Referrals",          icon: Users },
  { href: "/referring-doctors", label: "Referring Providers", icon: UserCheck },
  { href: "/reports",           label: "Reports",            icon: BarChart2 },
  { href: "/broadcasts",        label: "Broadcasts",         icon: Send },
]

const adminItems = [
  { href: "/settings/users",    label: "User Management",    icon: Settings },
  { href: "/settings/outreach", label: "Outreach Templates", icon: MessageSquare },
  { href: "/settings/embed",    label: "Embed Referral Form", icon: Code2 },
]

interface SidebarProps {
  userName: string | null | undefined
  userEmail: string
  userRole: string
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
      <div className={cn("flex items-center gap-3 border-b border-slate-700 overflow-hidden", collapsed ? "px-4 py-5 justify-center" : "px-6 py-5")}>
        <Image src="/logo.png" alt="Genesis Ortho" width={40} height={40} className="rounded-lg shrink-0" />
        {!collapsed && (
          <div>
            <p className="font-semibold text-sm leading-tight">Genesis Ortho</p>
            <p className="text-xs text-slate-400 leading-tight">Referral CRM</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                collapsed && "justify-center px-2",
                isActive ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && label}
            </Link>
          )
        })}

        {userRole === "ADMIN" && (
          <>
            {!collapsed && (
              <div className="pt-3 pb-1 px-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Admin</p>
              </div>
            )}
            {collapsed && <div className="pt-2 border-t border-slate-700 mt-2" />}
            {adminItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  collapsed && "justify-center px-2",
                  pathname === href ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && label}
              </Link>
            ))}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className={cn("py-4 border-t border-slate-700", collapsed ? "px-2" : "px-3")}>
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
