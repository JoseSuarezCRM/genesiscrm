"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { ReferralStatus } from "@prisma/client"

const ReferralSchema = z.object({
  patientFirstName: z.string().min(1, "First name is required"),
  patientLastName: z.string().min(1, "Last name is required"),
  patientMrn: z.string().optional(),
  patientPhone: z.string().optional(),
  patientEmail: z.string().email().optional().or(z.literal("")),
  patientDob: z.string().optional(),
  referringPracticeId: z.string().optional(),
  referringLocationId: z.string().optional(),
  referringDoctorId: z.string().optional(),
  referringDoctorName: z.string().optional(), // free-text fallback
  status: z.nativeEnum(ReferralStatus),
  referralDate: z.string().min(1, "Referral date is required"),
  appointmentDate: z.string().optional(),
  insuranceProvider: z.string().optional(),
  insuranceMemberId: z.string().optional(),
  insuranceGroup: z.string().optional(),
  authStatus: z.string().optional(),
  notes: z.string().optional(),
})

function parseDate(val: string | undefined): Date | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d
}

export async function createReferral(data: unknown) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const parsed = ReferralSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }

  const d = parsed.data

  const referral = await prisma.referral.create({
    data: {
      patientFirstName: d.patientFirstName,
      patientLastName: d.patientLastName,
      patientMrn: d.patientMrn || null,
      patientPhone: d.patientPhone || null,
      patientEmail: d.patientEmail || null,
      patientDob: parseDate(d.patientDob),
      referringPracticeId: d.referringPracticeId || null,
      referringLocationId: d.referringLocationId || null,
      referringDoctorId: d.referringDoctorId || null,
      referringDoctorName: d.referringDoctorName || null,
      status: d.status,
      referralDate: parseDate(d.referralDate) ?? new Date(),
      appointmentDate: parseDate(d.appointmentDate),
      insuranceProvider: d.insuranceProvider || null,
      insuranceMemberId: d.insuranceMemberId || null,
      insuranceGroup: d.insuranceGroup || null,
      authStatus: d.authStatus || null,
      notes: d.notes || null,
      createdById: session.user.id,
    },
  })

  revalidatePath("/referrals")
  revalidatePath("/")
  return { id: referral.id }
}

export async function updateReferral(id: string, data: unknown) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const parsed = ReferralSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }

  const d = parsed.data

  await prisma.referral.update({
    where: { id },
    data: {
      patientFirstName: d.patientFirstName,
      patientLastName: d.patientLastName,
      patientMrn: d.patientMrn || null,
      patientPhone: d.patientPhone || null,
      patientEmail: d.patientEmail || null,
      patientDob: parseDate(d.patientDob),
      referringPracticeId: d.referringPracticeId || null,
      referringLocationId: d.referringLocationId || null,
      referringDoctorId: d.referringDoctorId || null,
      referringDoctorName: d.referringDoctorName || null,
      status: d.status,
      referralDate: parseDate(d.referralDate) ?? new Date(),
      appointmentDate: parseDate(d.appointmentDate),
      insuranceProvider: d.insuranceProvider || null,
      insuranceMemberId: d.insuranceMemberId || null,
      insuranceGroup: d.insuranceGroup || null,
      authStatus: d.authStatus || null,
      notes: d.notes || null,
    },
  })

  revalidatePath(`/referrals/${id}`)
  revalidatePath("/referrals")
  revalidatePath("/")
  redirect(`/referrals/${id}`)
}

export async function updateReferralNotes(id: string, notes: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  await prisma.referral.update({
    where: { id },
    data: { notes: notes || null },
  })

  revalidatePath(`/referrals/${id}`)
  return { success: true }
}

export async function updateReferralStatus(id: string, status: ReferralStatus) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  await prisma.referral.update({
    where: { id },
    data: { status },
  })

  revalidatePath(`/referrals/${id}`)
  revalidatePath("/referrals")
  revalidatePath("/")
}

export async function deleteReferral(id: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  await prisma.referral.delete({ where: { id } })

  revalidatePath("/referrals")
  revalidatePath("/")
  redirect("/referrals")
}
