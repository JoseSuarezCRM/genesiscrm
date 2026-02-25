import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { ReferralStatus } from "@prisma/client"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const STATUS_LABELS: Record<ReferralStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  NO_SHOW: "No Show",
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
  return phone
}
