"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import {
  Users,
  UserCheck,
  LayoutDashboard,
  LogOut,
  Settings,
  BarChart2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const navItems = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/referrals",
    label: "Referrals",
    icon: Users,
  },
  {
    href: "/referring-doctors",
    label: "Referring Providers",
    icon: UserCheck,
  },
  {
    href: "/reports",
    label: "Reports",
    icon: BarChart2,
  },
]

interface SidebarProps {
  userName: string | null | undefined
  userEmail: string
  userRole: string
}

export default function Sidebar({ userName, userEmail, userRole }: SidebarProps) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col h-full w-64 bg-slate-900 text-white">
      {/* Brand */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-700">
        <Image src="/logo.png" alt="Genesis Ortho" width={40} height={40} className="rounded-lg shrink-0" />
        <div>
          <p className="font-semibold text-sm leading-tight">Genesis Ortho</p>
          <p className="text-xs text-slate-400 leading-tight">Referral CRM</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          )
        })}

        {userRole === "ADMIN" && (
          <>
            <div className="pt-3 pb-1 px-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Admin
              </p>
            </div>
            <Link
              href="/settings/users"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                pathname.startsWith("/settings")
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              )}
            >
              <Settings className="h-4 w-4 shrink-0" />
              User Management
            </Link>
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-slate-700">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="flex items-center justify-center w-8 h-8 bg-blue-500 rounded-full text-xs font-bold">
            {(userName || userEmail).charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{userName || "User"}</p>
            <p className="text-xs text-slate-400 truncate">{userEmail}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-slate-300 hover:text-white hover:bg-slate-800"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  )
}
