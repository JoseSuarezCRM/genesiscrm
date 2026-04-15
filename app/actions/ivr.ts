"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { IvrAction } from "@prisma/client"

export interface IvrOptionInput {
  id?: string
  digit: string
  label: string
  action: IvrAction
  message?: string
  forwardTo?: string
  order: number
}

export interface IvrConfigInput {
  isActive: boolean
  greeting: string
  noInputMessage: string
  invalidMessage: string
  gatherTimeout: number
  options: IvrOptionInput[]
}

export async function getIvrConfig() {
  return prisma.ivrConfig.findFirst({
    include: { options: { orderBy: { order: "asc" } } },
  })
}

export async function saveIvrConfig(
  input: IvrConfigInput
): Promise<{ success: boolean; error?: string }> {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") return { success: false, error: "Unauthorized" }

  try {
    const existing = await prisma.ivrConfig.findFirst()

    if (existing) {
      // Replace options entirely
      await prisma.ivrOption.deleteMany({ where: { configId: existing.id } })
      await prisma.ivrConfig.update({
        where: { id: existing.id },
        data: {
          isActive:       input.isActive,
          greeting:       input.greeting,
          noInputMessage: input.noInputMessage,
          invalidMessage: input.invalidMessage,
          gatherTimeout:  input.gatherTimeout,
          options: {
            create: input.options.map((o) => ({
              digit:     o.digit,
              label:     o.label,
              action:    o.action,
              message:   o.message   || null,
              forwardTo: o.forwardTo || null,
              order:     o.order,
            })),
          },
        },
      })
    } else {
      await prisma.ivrConfig.create({
        data: {
          isActive:       input.isActive,
          greeting:       input.greeting,
          noInputMessage: input.noInputMessage,
          invalidMessage: input.invalidMessage,
          gatherTimeout:  input.gatherTimeout,
          options: {
            create: input.options.map((o) => ({
              digit:     o.digit,
              label:     o.label,
              action:    o.action,
              message:   o.message   || null,
              forwardTo: o.forwardTo || null,
              order:     o.order,
            })),
          },
        },
      })
    }

    revalidatePath("/broadcasts")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Save failed." }
  }
}
