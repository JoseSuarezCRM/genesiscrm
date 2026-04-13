"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"

export interface AppointmentRow {
  patientName: string
  mrn: string
  phone: string
  email: string
  appointmentDate: string
  referringProvider: string
  referringProviderAddress: string
  referringProviderPhone: string
}

export interface ImportResult {
  imported: number
  skipped: number
  batchId: string
}

export async function importCompletedAppointments(
  rows: AppointmentRow[]
): Promise<{ success: true; result: ImportResult } | { success: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { success: false, error: "Unauthorized" }

  const validRows = rows.filter((r) => r.referringProvider?.trim())
  const skipped = rows.length - validRows.length

  if (!validRows.length) {
    return { success: false, error: "No valid rows found (all rows were missing a referring provider)." }
  }

  const batchId = `batch_${Date.now()}`
  const userId = (session.user as any).id as string

  try {
    await prisma.completedAppointment.createMany({
      data: validRows.map((r) => ({
        patientName: r.patientName.trim(),
        mrn: r.mrn?.trim() || null,
        phone: r.phone?.trim() || null,
        email: r.email?.trim() || null,
        appointmentDate: r.appointmentDate ? new Date(r.appointmentDate) : null,
        referringProvider: r.referringProvider.trim(),
        referringProviderAddress: r.referringProviderAddress?.trim() || null,
        referringProviderPhone: r.referringProviderPhone?.trim() || null,
        importBatchId: batchId,
        createdById: userId,
      })),
    })

    revalidatePath("/appointments")
    revalidatePath("/appointments/providers")
    return { success: true, result: { imported: validRows.length, skipped, batchId } }
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Import failed." }
  }
}

export async function deleteAppointmentBatch(
  batchId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") return { success: false, error: "Unauthorized" }

  try {
    await prisma.completedAppointment.deleteMany({ where: { importBatchId: batchId } })
    revalidatePath("/appointments")
    revalidatePath("/appointments/providers")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Delete failed." }
  }
}

export async function deleteAppointment(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") return { success: false, error: "Unauthorized" }

  try {
    await prisma.completedAppointment.delete({ where: { id } })
    revalidatePath("/appointments")
    revalidatePath("/appointments/providers")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Delete failed." }
  }
}
