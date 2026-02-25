import { ReferralStatus } from "@prisma/client"
import { cn, STATUS_COLORS, STATUS_LABELS } from "@/lib/utils"

export function StatusBadge({ status }: { status: ReferralStatus }) {
  const colors = STATUS_COLORS[status]
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
        colors.bg,
        colors.text,
        colors.border
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
