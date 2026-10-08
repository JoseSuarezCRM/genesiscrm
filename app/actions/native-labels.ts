"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireSettingsPage } from "@/lib/auth-guard"
import { clearNativeLabelsMemo, nativeLabelChange } from "@/lib/native-labels"

/**
 * Rename a built-in field everywhere it appears (Settings → Properties). An empty
 * label puts it back to each screen's own wording. Only fields in the catalog can
 * be renamed; record data is never touched — the name lives beside the field.
 */
export async function setNativeFieldLabel(objectType: string, fieldKey: string, label: string | null): Promise<{ success: true } | { error: string }> {
  const session = await requireSettingsPage("properties")
  const change = nativeLabelChange(objectType, fieldKey, label)
  if ("error" in change) return change

  if ("reset" in change) {
    await (prisma as any).nativeFieldLabel.deleteMany({ where: { objectType, fieldKey } })
  } else {
    await (prisma as any).nativeFieldLabel.upsert({
      where: { objectType_fieldKey: { objectType, fieldKey } },
      create: { objectType, fieldKey, label: change.label, updatedById: (session.user as any).id ?? null },
      update: { label: change.label, updatedById: (session.user as any).id ?? null },
    })
  }
  clearNativeLabelsMemo()
  // The name shows on every page — lists, records, filters, forms.
  revalidatePath("/", "layout")
  return { success: true }
}
