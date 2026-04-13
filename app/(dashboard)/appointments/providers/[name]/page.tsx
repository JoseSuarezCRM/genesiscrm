import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Building2 } from "lucide-react"

interface Props {
  params: { name: string }
}

export default async function ProviderAppointmentsPage({ params }: Props) {
  const providerName = decodeURIComponent(params.name)

  const appointments = await prisma.completedAppointment.findMany({
    where: { referringProvider: providerName },
    orderBy: { appointmentDate: "desc" },
  })

  if (!appointments.length) notFound()

  const detail = appointments[0]

  return (
    <div className="p-6 space-y-6">
      <div>
        <Link
          href="/appointments/providers"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Providers
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50">
            <Building2 className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{providerName}</h1>
            <div className="flex items-center gap-3 text-sm text-slate-500 mt-0.5">
              {detail.referringProviderAddress && <span>{detail.referringProviderAddress}</span>}
              {detail.referringProviderPhone && <span>{detail.referringProviderPhone}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
          <p className="text-2xl font-bold text-slate-800">{appointments.length}</p>
          <p className="text-sm text-slate-500 mt-0.5">Total Appointments</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
          <p className="text-2xl font-bold text-slate-800">
            {appointments[0].appointmentDate
              ? new Date(appointments[0].appointmentDate).toLocaleDateString()
              : "—"}
          </p>
          <p className="text-sm text-slate-500 mt-0.5">Most Recent</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
          <p className="text-2xl font-bold text-slate-800">
            {appointments[appointments.length - 1].appointmentDate
              ? new Date(appointments[appointments.length - 1].appointmentDate!).toLocaleDateString()
              : "—"}
          </p>
          <p className="text-sm text-slate-500 mt-0.5">Earliest</p>
        </div>
      </div>

      {/* Appointments table */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-5 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Appointments ({appointments.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                {["Patient Name","MRN","Phone","Email","Appointment Date"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {appointments.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{a.patientName}</td>
                  <td className="px-4 py-3 font-mono text-slate-600">{a.mrn || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{a.phone || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{a.email || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {a.appointmentDate ? new Date(a.appointmentDate).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
