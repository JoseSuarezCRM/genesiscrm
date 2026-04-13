import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import CompletedAppointmentsManager from "@/components/completed-appointments-manager"

export default async function AppointmentsPage() {
  const session = await auth()
  const isAdmin = (session?.user as any)?.role === "ADMIN"

  const appointments = await prisma.completedAppointment.findMany({
    orderBy: { importedAt: "desc" },
    select: {
      id: true,
      patientName: true,
      mrn: true,
      phone: true,
      email: true,
      appointmentDate: true,
      referringProvider: true,
      referringProviderAddress: true,
      referringProviderPhone: true,
      importBatchId: true,
      importedAt: true,
    },
  })

  const serialized = appointments.map((a) => ({
    ...a,
    appointmentDate: a.appointmentDate?.toISOString() ?? null,
    importedAt: a.importedAt.toISOString(),
  }))

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Completed Appointments</h1>
        <p className="text-sm text-slate-500">
          Import completed appointment reports. Rows without a referring provider are automatically skipped.
        </p>
      </div>

      <CompletedAppointmentsManager appointments={serialized} isAdmin={isAdmin} />
    </div>
  )
}
