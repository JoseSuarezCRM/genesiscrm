import { prisma } from "@/lib/prisma"
import { AutomationTrigger, AutomationAction, ReferralStatus, TaskPriority } from "@prisma/client"
import { enrollInMatchingSequences } from "@/app/actions/sequences"

// ─── Template variable resolution ─────────────────────────────────────────────

interface TemplateVars {
  provider_name?: string
  practice_name?: string
  patient_name?: string
  patient_first_name?: string
  count?: number
  period?: string
  days?: number
  status?: string
  call_count?: number
}

function resolveTemplate(template: string, vars: TemplateVars): string {
  return template
    .replace(/\{provider_name\}/g, vars.provider_name ?? "the provider")
    .replace(/\{practice_name\}/g, vars.practice_name ?? "the practice")
    .replace(/\{patient_name\}/g, vars.patient_name ?? "the patient")
    .replace(/\{patient_first_name\}/g, vars.patient_first_name ?? "the patient")
    .replace(/\{count\}/g, String(vars.count ?? ""))
    .replace(/\{period\}/g, vars.period ?? "")
    .replace(/\{days\}/g, String(vars.days ?? ""))
    .replace(/\{status\}/g, vars.status ?? "")
    .replace(/\{call_count\}/g, String(vars.call_count ?? ""))
}

// ─── Period helpers ────────────────────────────────────────────────────────────

function periodStart(period: string): Date {
  const now = new Date()
  if (period === "week") return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1)
  if (period === "quarter") return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
  return new Date(0) // all_time
}

function periodLabel(period: string): string {
  if (period === "week") return "this week"
  if (period === "month") return "this month"
  if (period === "quarter") return "this quarter"
  return "overall"
}

// ─── Deduplication key ─────────────────────────────────────────────────────────

function dedupeKey(period: string): string {
  const now = new Date()
  if (period === "week") return `${now.getFullYear()}-W${Math.ceil(now.getDate() / 7)}`
  if (period === "month") return `${now.getFullYear()}-${now.getMonth() + 1}`
  if (period === "quarter") return `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`
  return "all"
}

// ─── Action executor ──────────────────────────────────────────────────────────

async function executeAction(
  automation: { id: string; actionType: AutomationAction; actionConfig: unknown },
  referralId: string | null,
  vars: TemplateVars,
  triggeredByUserId?: string
): Promise<void> {
  const cfg = automation.actionConfig as Record<string, unknown>

  if (automation.actionType === AutomationAction.CREATE_TASK) {
    const title = resolveTemplate((cfg.title as string) || "Automation task", vars)
    const description = cfg.description ? resolveTemplate(cfg.description as string, vars) : null
    const priority = (cfg.priority as TaskPriority) ?? TaskPriority.NORMAL
    let assignedToId = (cfg.assignedToId as string) || null
    if (assignedToId === "assigned_to" && referralId) {
      const r = await prisma.referral.findUnique({ where: { id: referralId }, select: { assignedToId: true } })
      assignedToId = r?.assignedToId ?? null
    }
    const dueDays = cfg.dueDaysFromNow ? Number(cfg.dueDaysFromNow) : null
    const dueDate = dueDays ? new Date(Date.now() + dueDays * 86400000) : null

    const task = await prisma.task.create({
      data: {
        title,
        description,
        priority,
        dueDate,
        referralId,
        createdById: triggeredByUserId ?? (await prisma.user.findFirst({ where: { role: "ADMIN" } }))!.id,
        assignedToId,
      },
    })

    if (assignedToId && assignedToId !== triggeredByUserId) {
      await prisma.notification.create({
        data: {
          userId: assignedToId,
          type: "TASK_ASSIGNED",
          message: `Automation assigned you a task: "${title}"`,
          link: `/tasks?highlight=${task.id}`,
          taskId: task.id,
        },
      })
    }
  }

  if (automation.actionType === AutomationAction.SEND_NOTIFICATION) {
    const message = resolveTemplate((cfg.message as string) || "Automation triggered", vars)
    const link = referralId ? `/referrals/${referralId}` : null
    let userIds: string[] = []
    const target = cfg.userId as string

    if (target === "all_admins") {
      const admins = await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } })
      userIds = admins.map(a => a.id)
    } else if (target === "assigned_to" && referralId) {
      const r = await prisma.referral.findUnique({ where: { id: referralId }, select: { assignedToId: true } })
      if (r?.assignedToId) userIds = [r.assignedToId]
    } else if (target) {
      userIds = [target]
    }

    for (const uid of userIds) {
      await prisma.notification.create({ data: { userId: uid, type: "AUTOMATION", message, link } })
    }
  }

  if (automation.actionType === AutomationAction.UPDATE_REFERRAL_STATUS && referralId) {
    const status = cfg.status as ReferralStatus
    if (status) await prisma.referral.update({ where: { id: referralId }, data: { status } })
  }

  if (automation.actionType === AutomationAction.ASSIGN_REFERRAL && referralId) {
    const userId = cfg.userId as string
    if (userId) {
      await prisma.referral.update({ where: { id: referralId }, data: { assignedToId: userId } })
      const r = await prisma.referral.findUnique({ where: { id: referralId }, select: { patientFirstName: true, patientLastName: true } })
      await prisma.notification.create({
        data: {
          userId,
          type: "REFERRAL_ASSIGNED",
          message: `You were assigned the referral for ${r?.patientFirstName} ${r?.patientLastName} (via automation)`,
          link: `/referrals/${referralId}`,
        },
      })
    }
  }

  if (automation.actionType === AutomationAction.ADD_TAG && referralId) {
    const tagId = cfg.tagId as string
    if (tagId) {
      await prisma.referralTag.upsert({
        where: { referralId_tagId: { referralId, tagId } },
        create: { referralId, tagId },
        update: {},
      })
    }
  }
}

// ─── Public trigger functions ─────────────────────────────────────────────────

export async function runTrigger_ReferralCreated(referralId: string, triggeredByUserId?: string) {
  const automations = await prisma.automation.findMany({
    where: { triggerType: AutomationTrigger.REFERRAL_CREATED, isActive: true },
  })
  if (!automations.length) return

  const referral = await prisma.referral.findUnique({
    where: { id: referralId },
    include: { referringDoctor: true, referringPractice: true },
  })
  if (!referral) return

  const vars: TemplateVars = {
    provider_name: referral.referringDoctor?.name ?? referral.referringDoctorName ?? undefined,
    practice_name: referral.referringPractice?.name ?? undefined,
    patient_name: `${referral.patientFirstName} ${referral.patientLastName}`,
    patient_first_name: referral.patientFirstName,
  }

  for (const auto of automations) {
    const cfg = auto.triggerConfig as Record<string, unknown>
    // Optional filters
    if (cfg.practiceId && referral.referringPracticeId !== cfg.practiceId) continue

    await executeAction(auto, referralId, vars, triggeredByUserId)
    await prisma.automationRun.create({
      data: { automationId: auto.id, contextType: "referral", contextId: referralId, result: "success", detail: `Triggered on new referral for ${vars.patient_name}` },
    })
  }
}

export async function runTrigger_StatusChanged(referralId: string, fromStatus: ReferralStatus, toStatus: ReferralStatus, triggeredByUserId?: string) {
  const automations = await prisma.automation.findMany({
    where: { triggerType: AutomationTrigger.REFERRAL_STATUS_CHANGED, isActive: true },
  })
  if (!automations.length) return

  const referral = await prisma.referral.findUnique({
    where: { id: referralId },
    include: { referringDoctor: true, referringPractice: true },
  })
  if (!referral) return

  const vars: TemplateVars = {
    provider_name: referral.referringDoctor?.name ?? referral.referringDoctorName ?? undefined,
    practice_name: referral.referringPractice?.name ?? undefined,
    patient_name: `${referral.patientFirstName} ${referral.patientLastName}`,
    patient_first_name: referral.patientFirstName,
    status: toStatus,
  }

  for (const auto of automations) {
    const cfg = auto.triggerConfig as Record<string, unknown>
    if (cfg.toStatus && cfg.toStatus !== toStatus) continue
    if (cfg.fromStatus && cfg.fromStatus !== fromStatus) continue

    await executeAction(auto, referralId, vars, triggeredByUserId)
    await prisma.automationRun.create({
      data: { automationId: auto.id, contextType: "referral", contextId: referralId, result: "success", detail: `Status changed ${fromStatus} → ${toStatus}` },
    })
  }

  // Enroll in any matching sequences
  await enrollInMatchingSequences(referralId, "ON_STATUS_CHANGE", toStatus).catch(() => {})
}

export async function runTrigger_CallAttemptsReached(referralId: string, callCount: number, triggeredByUserId?: string) {
  const automations = await prisma.automation.findMany({
    where: { triggerType: AutomationTrigger.CALL_ATTEMPTS_REACHED, isActive: true },
  })
  if (!automations.length) return

  const referral = await prisma.referral.findUnique({
    where: { id: referralId },
    include: { referringDoctor: true, referringPractice: true },
  })
  if (!referral) return

  const vars: TemplateVars = {
    provider_name: referral.referringDoctor?.name ?? referral.referringDoctorName ?? undefined,
    practice_name: referral.referringPractice?.name ?? undefined,
    patient_name: `${referral.patientFirstName} ${referral.patientLastName}`,
    patient_first_name: referral.patientFirstName,
    call_count: callCount,
  }

  for (const auto of automations) {
    const cfg = auto.triggerConfig as Record<string, unknown>
    if (cfg.count && Number(cfg.count) !== callCount) continue

    // Dedup: only fire once per referral at this call count
    const already = await prisma.automationRun.findFirst({
      where: { automationId: auto.id, contextType: "referral", contextId: referralId, detail: { contains: `calls:${callCount}` } },
    })
    if (already) continue

    await executeAction(auto, referralId, vars, triggeredByUserId)
    await prisma.automationRun.create({
      data: { automationId: auto.id, contextType: "referral", contextId: referralId, result: "success", detail: `calls:${callCount} - ${callCount} call attempts reached` },
    })
  }
}

export async function runTrigger_ReferralAssigned(referralId: string, assignedToId: string, triggeredByUserId?: string) {
  const automations = await prisma.automation.findMany({
    where: { triggerType: AutomationTrigger.REFERRAL_ASSIGNED, isActive: true },
  })
  if (!automations.length) return

  const referral = await prisma.referral.findUnique({
    where: { id: referralId },
    include: { referringDoctor: true, referringPractice: true },
  })
  if (!referral) return

  const vars: TemplateVars = {
    provider_name: referral.referringDoctor?.name ?? referral.referringDoctorName ?? undefined,
    practice_name: referral.referringPractice?.name ?? undefined,
    patient_name: `${referral.patientFirstName} ${referral.patientLastName}`,
    patient_first_name: referral.patientFirstName,
  }

  for (const auto of automations) {
    const cfg = auto.triggerConfig as Record<string, unknown>
    if (cfg.assignedToId && cfg.assignedToId !== assignedToId) continue

    await executeAction(auto, referralId, vars, triggeredByUserId)
    await prisma.automationRun.create({
      data: { automationId: auto.id, contextType: "referral", contextId: referralId, result: "success", detail: `Referral assigned to user ${assignedToId}` },
    })
  }
}

export async function runTrigger_ProviderReferralCount(providerId: string, triggeredByUserId?: string) {
  const automations = await prisma.automation.findMany({
    where: { triggerType: AutomationTrigger.PROVIDER_REFERRAL_COUNT, isActive: true },
  })
  if (!automations.length) return

  const provider = await prisma.referringDoctor.findUnique({
    where: { id: providerId },
    include: { practice: true },
  })
  if (!provider) return

  for (const auto of automations) {
    const cfg = auto.triggerConfig as Record<string, unknown>
    const threshold = Number(cfg.count ?? 0)
    const period = (cfg.period as string) ?? "month"
    if (!threshold) continue

    const start = periodStart(period)
    const count = await prisma.referral.count({
      where: { referringDoctorId: providerId, referralDate: { gte: start } },
    })

    if (count !== threshold) continue

    // Dedup: only fire once per provider per period
    const key = `${providerId}:${dedupeKey(period)}`
    const already = await prisma.automationRun.findFirst({
      where: { automationId: auto.id, contextType: "provider", contextId: key },
    })
    if (already) continue

    const vars: TemplateVars = {
      provider_name: provider.name,
      practice_name: provider.practice.name,
      count,
      period: periodLabel(period),
    }

    await executeAction(auto, null, vars, triggeredByUserId)
    await prisma.automationRun.create({
      data: { automationId: auto.id, contextType: "provider", contextId: key, result: "success", detail: `${provider.name} reached ${count} referrals ${periodLabel(period)}` },
    })
  }
}

export async function runTrigger_PracticeReferralCount(practiceId: string, triggeredByUserId?: string) {
  const automations = await prisma.automation.findMany({
    where: { triggerType: AutomationTrigger.PRACTICE_REFERRAL_COUNT, isActive: true },
  })
  if (!automations.length) return

  const practice = await prisma.referringPractice.findUnique({ where: { id: practiceId } })
  if (!practice) return

  for (const auto of automations) {
    const cfg = auto.triggerConfig as Record<string, unknown>
    const threshold = Number(cfg.count ?? 0)
    const period = (cfg.period as string) ?? "month"
    if (!threshold) continue

    const start = periodStart(period)
    const count = await prisma.referral.count({
      where: { referringPracticeId: practiceId, referralDate: { gte: start } },
    })

    if (count !== threshold) continue

    const key = `${practiceId}:${dedupeKey(period)}`
    const already = await prisma.automationRun.findFirst({
      where: { automationId: auto.id, contextType: "practice", contextId: key },
    })
    if (already) continue

    const vars: TemplateVars = { practice_name: practice.name, count, period: periodLabel(period) }
    await executeAction(auto, null, vars, triggeredByUserId)
    await prisma.automationRun.create({
      data: { automationId: auto.id, contextType: "practice", contextId: key, result: "success", detail: `${practice.name} reached ${count} referrals ${periodLabel(period)}` },
    })
  }
}

// ─── Scheduled triggers (called from cron API route) ─────────────────────────

export async function runScheduledTriggers() {
  await runTrigger_NoActivity()
  await runTrigger_AppointmentUpcoming()
}

async function runTrigger_NoActivity() {
  const automations = await prisma.automation.findMany({
    where: { triggerType: AutomationTrigger.REFERRAL_NO_ACTIVITY, isActive: true },
  })
  if (!automations.length) return

  for (const auto of automations) {
    const cfg = auto.triggerConfig as Record<string, unknown>
    const days = Number(cfg.days ?? 7)
    const cutoff = new Date(Date.now() - days * 86400000)

    const staleReferrals = await prisma.referral.findMany({
      where: {
        status: { notIn: [ReferralStatus.COMPLETED, ReferralStatus.NO_SHOW] },
        updatedAt: { lte: cutoff },
      },
      include: { referringDoctor: true, referringPractice: true },
      take: 50,
    })

    for (const referral of staleReferrals) {
      const key = `${referral.id}:noactivity:${days}`
      const already = await prisma.automationRun.findFirst({
        where: { automationId: auto.id, contextType: "referral", contextId: key },
      })
      if (already) continue

      const vars: TemplateVars = {
        provider_name: referral.referringDoctor?.name ?? referral.referringDoctorName ?? undefined,
        practice_name: referral.referringPractice?.name ?? undefined,
        patient_name: `${referral.patientFirstName} ${referral.patientLastName}`,
        patient_first_name: referral.patientFirstName,
        days,
      }

      await executeAction(auto, referral.id, vars)
      await prisma.automationRun.create({
        data: { automationId: auto.id, contextType: "referral", contextId: key, result: "success", detail: `No activity for ${days} days` },
      })
    }
  }
}

async function runTrigger_AppointmentUpcoming() {
  const automations = await prisma.automation.findMany({
    where: { triggerType: AutomationTrigger.APPOINTMENT_UPCOMING, isActive: true },
  })
  if (!automations.length) return

  for (const auto of automations) {
    const cfg = auto.triggerConfig as Record<string, unknown>
    const daysAhead = Number(cfg.daysAhead ?? 1)
    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() + daysAhead)
    const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate())
    const dayEnd = new Date(dayStart.getTime() + 86400000)

    const upcoming = await prisma.referral.findMany({
      where: { appointmentDate: { gte: dayStart, lt: dayEnd } },
      include: { referringDoctor: true, referringPractice: true },
      take: 50,
    })

    for (const referral of upcoming) {
      const key = `${referral.id}:appt:${daysAhead}`
      const already = await prisma.automationRun.findFirst({
        where: { automationId: auto.id, contextType: "referral", contextId: key },
      })
      if (already) continue

      const vars: TemplateVars = {
        patient_name: `${referral.patientFirstName} ${referral.patientLastName}`,
        patient_first_name: referral.patientFirstName,
        days: daysAhead,
      }

      await executeAction(auto, referral.id, vars)
      await prisma.automationRun.create({
        data: { automationId: auto.id, contextType: "referral", contextId: key, result: "success", detail: `Appointment in ${daysAhead} day(s)` },
      })
    }
  }
}
