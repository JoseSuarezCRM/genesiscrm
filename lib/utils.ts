import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { ReferralStatus } from "@prisma/client"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const STATUS_LABELS: Record<ReferralStatus, string> = {
  NEW: "New",
  READY_FOR_CALL: "Ready for Call",
  CONTACTED: "Contacted",
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  NO_SHOW: "No Show",
  LOST: "Lost",
}

export const STATUS_COLORS: Record<
  ReferralStatus,
  { bg: string; text: string; border: string }
> = {
  NEW: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
  },
  READY_FOR_CALL: {
    bg: "bg-orange-50",
    text: "text-orange-700",
    border: "border-orange-200",
  },
  CONTACTED: {
    bg: "bg-yellow-50",
    text: "text-yellow-700",
    border: "border-yellow-200",
  },
  SCHEDULED: {
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-purple-200",
  },
  COMPLETED: {
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-green-200",
  },
  NO_SHOW: {
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
  },
  LOST: {
    bg: "bg-slate-100",
    text: "text-slate-600",
    border: "border-slate-300",
  },
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—"
  const d = new Date(date)
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—"
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  if (digits.length === 11 && digits[0] === "1") {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return phone // return as-is if not a standard US number
}
