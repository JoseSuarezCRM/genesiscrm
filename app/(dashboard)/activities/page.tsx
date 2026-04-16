import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import ActivityManager from "@/components/activity-manager"

export default async function ActivitiesPage() {
  const session = await auth()

  const [activities, practices, allTags] = await Promise.all([
    prisma.activity.findMany({
      orderBy: { date: "desc" },
      include: {
        practice: { select: { id: true, name: true } },
        location: { select: { id: true, name: true, address: true } },
        providers: {
          include: {
            doctor: { select: { id: true, name: true, title: true } },
          },
        },
        tags: {
          include: { tag: true },
        },
        createdBy: { select: { name: true, email: true } },
      },
    }),
    prisma.referringPractice.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        locations: {
          orderBy: { name: "asc" },
          select: { id: true, name: true, address: true, practiceId: true },
        },
        doctors: {
          orderBy: { name: "asc" },
          select: { id: true, name: true, title: true, practiceId: true },
        },
      },
    }),
    prisma.tag.findMany({ orderBy: { name: "asc" } }),
  ])

  const allDoctors = practices.flatMap((p) =>
    p.doctors.map((d) => ({ ...d, practiceName: p.name }))
  )

  const serialized = activities.map((a) => ({
    ...a,
    date: a.date.toISOString(),
    createdAt: a.createdAt.toISOString(),
    tags: a.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
  }))

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Activities</h1>
        <p className="text-sm text-slate-500">
          {activities.length} activit{activities.length !== 1 ? "ies" : "y"} logged
        </p>
      </div>

      <ActivityManager
        activities={serialized as any}
        practices={practices as any}
        allDoctors={allDoctors}
        allTags={allTags}
        currentUserId={session!.user.id}
      />
    </div>
  )
}
