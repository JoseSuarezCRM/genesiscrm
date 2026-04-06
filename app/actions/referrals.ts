"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { createAuditLog } from "@/lib/audit"
import { triggerAutoOutreach } from "@/app/actions/outreach"
import { ReferralStatus, AuditAction, OutreachTrigger } from "@prisma/client"

const ReferralSchema = z.object({
  patientFirstName: z.string().min(1, "First name is required"),
  patientLastName: z.string().min(1, "Last name is required"),
  patientMrn: z.string().optional(),
  genesisMrn: z.string().optional(),
  patientPhone: z.string().optional(),
  patientEmail: z.string().email().optional().or(z.literal("")),
  patientDob: z.string().optional(),
  referringPracticeId: z.string().optional(),
  referringLocationId: z.string().optional(),
  referringDoctorId: z.string().optional(),
  referringDoctorName: z.string().optional(), // free-text fallback
  referringNpi: z.string().optional(),
  referringPhone: z.string().optional(),
  referringAddress: z.string().optional(),
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

// Verifies authentication — any authenticated staff member can edit any referral
async function assertReferralAccess(referralId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const referral = await prisma.referral.findUnique({
    where: { id: referralId },
    select: { id: true, createdById: true },
  })

  if (!referral) throw new Error("Referral not found")

  return { session, referral }
}

interface PendingFile {
  url: string
  name: string
  size: number
  contentType: string
}

export async function createReferral(data: unknown, pendingFile?: PendingFile | null) {
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
      genesisMrn: d.genesisMrn || null,
      patientPhone: d.patientPhone || null,
      patientEmail: d.patientEmail || null,
      patientDob: parseDate(d.patientDob),
      referringPracticeId: d.referringPracticeId || null,
      referringLocationId: d.referringLocationId || null,
      referringDoctorId: d.referringDoctorId || null,
      referringDoctorName: d.referringDoctorName || null,
      referringNpi: d.referringNpi || null,
      referringPhone: d.referringPhone || null,
      referringAddress: d.referringAddress || null,
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

  // Attach the scanned fax as a document if one was uploaded during extraction
  if (pendingFile?.url) {
    await prisma.document.create({
      data: {
        referralId: referral.id,
        fileName: pendingFile.name,
        fileUrl: pendingFile.url,
        fileSize: pendingFile.size,
        contentType: pendingFile.contentType,
        uploadedById: session.user.id,
      },
    })
  }

  await createAuditLog({
    userId: session.user.id,
    action: AuditAction.REFERRAL_CREATE,
    resourceType: "Referral",
    resourceId: referral.id,
  })

  revalidatePath("/referrals")
  revalidatePath("/")
  return { id: referral.id }
}

export async function updateReferral(id: string, data: unknown) {
  const { session } = await assertReferralAccess(id)

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
      genesisMrn: d.genesisMrn || null,
      patientPhone: d.patientPhone || null,
      patientEmail: d.patientEmail || null,
      patientDob: parseDate(d.patientDob),
      referringPracticeId: d.referringPracticeId || null,
      referringLocationId: d.referringLocationId || null,
      referringDoctorId: d.referringDoctorId || null,
      referringDoctorName: d.referringDoctorName || null,
      referringNpi: d.referringNpi || null,
      referringPhone: d.referringPhone || null,
      referringAddress: d.referringAddress || null,
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

  await createAuditLog({
    userId: session.user.id,
    action: AuditAction.REFERRAL_UPDATE,
    resourceType: "Referral",
    resourceId: id,
  })

  revalidatePath(`/referrals/${id}`)
  revalidatePath("/referrals")
  revalidatePath("/")
  redirect(`/referrals/${id}`)
}

export async function updateReferralNotes(id: string, notes: string) {
  const { session } = await assertReferralAccess(id)

  await prisma.referral.update({
    where: { id },
    data: { notes: notes || null },
  })

  await createAuditLog({
    userId: session.user.id,
    action: AuditAction.REFERRAL_UPDATE,
    resourceType: "Referral",
    resourceId: id,
    metadata: { field: "notes" },
  })

  revalidatePath(`/referrals/${id}`)
  return { success: true }
}

export async function updateReferralStatus(id: string, status: ReferralStatus) {
  const { session } = await assertReferralAccess(id)

  await prisma.referral.update({
    where: { id },
    data: { status },
  })

  await createAuditLog({
    userId: session.user.id,
    action: AuditAction.REFERRAL_UPDATE,
    resourceType: "Referral",
    resourceId: id,
    metadata: { field: "status", newValue: status },
  })

  if (status === "SCHEDULED") {
    await triggerAutoOutreach(id, OutreachTrigger.STATUS_SCHEDULED)
  } else if (status === "COMPLETED") {
    await triggerAutoOutreach(id, OutreachTrigger.STATUS_COMPLETED)
  }

  revalidatePath(`/referrals/${id}`)
  revalidatePath("/referrals")
  revalidatePath("/")
}

export async function deleteReferral(id: string) {
  const { session } = await assertReferralAccess(id)

  await prisma.referral.delete({ where: { id } })

  await createAuditLog({
    userId: session.user.id,
    action: AuditAction.REFERRAL_DELETE,
    resourceType: "Referral",
    resourceId: id,
  })

  revalidatePath("/referrals")
  revalidatePath("/")
  redirect("/referrals")
}

export async function assignReferral(referralId: string, assignedToId: string | null) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const referral = await prisma.referral.findUnique({
    where: { id: referralId },
    select: { patientFirstName: true, patientLastName: true, assignedToId: true },
  })
  if (!referral) return { error: "Referral not found" }

  await prisma.referral.update({
    where: { id: referralId },
    data: { assignedToId: assignedToId || null },
  })

  // Notify the new assignee if different from the person assigning
  if (assignedToId && assignedToId !== session.user.id && assignedToId !== referral.assignedToId) {
    await prisma.notification.create({
      data: {
        userId: assignedToId,
        type: "REFERRAL_ASSIGNED",
        message: `You were assigned the referral for ${referral.patientFirstName} ${referral.patientLastName}`,
        link: `/referrals/${referralId}`,
      },
    })
  }

  revalidatePath(`/referrals/${referralId}`)
  return { success: true }
}
