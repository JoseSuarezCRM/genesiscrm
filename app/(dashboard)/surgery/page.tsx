import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getSurgeryCases, SURGERY_STATUS_LABELS } from "@/app/actions/surgery"
import SurgeryImportDialog from "@/components/surgery-import-dialog"
import { Upload, Phone, FileText, Stethoscope } from "lucide-react"

const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-zinc-100 text-zinc-700",
  SCHEDULED: "bg-blue-100 text-blue-700",
  PENDING_CONFIRMATION: "bg-amber-100 text-amber-700",
  PENDING_CLEARANCE: "bg-orange-100 text-orange-700",
  CANCELED: "bg-red-100 text-red-700",
  COMPLETED: "bg-green-100 text-green-700",
}

export default async function SurgeryPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const cases = await getSurgeryCases()

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Surgery</h1>
          <p className="text-sm text-slate-500">{cases.length} case{cases.length !== 1 ? "s" : ""}</p>
        </div>
        <SurgeryImportDialog />
      </div>

      {/* Table */}
      <div className="bg-white border rounded-xl overflow-hidden">
        {cases.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <Stethoscope className="h-10 w-10 text-slate-300 mx-auto" />
            <p className="text-slate-500 font-medium">No surgery cases yet</p>
            <p className="text-slate-400 text-sm">Import a CSV or XLSX file to get started.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-semibold">Patient</th>
                <th className="text-left px-4 py-3 font-semibold">MRN</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-left px-4 py-3 font-semibold">Surgery Date</th>
                <th className="text-left px-4 py-3 font-semibold">Diagnosis</th>
                <th className="text-left px-4 py-3 font-semibold">Expires</th>
                <th className="text-left px-4 py-3 font-semibold">Calls</th>
                <th className="text-left px-4 py-3 font-semibold">Docs</th>
              </tr>
            </thead>
            <tbody>
              {(cases as any[]).map((c) => (
                <tr key={c.id} className="border-b hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/surgery/${c.id}`}
                      className="font-medium text-slate-900 hover:text-blue-600 transition-colors"
                    >
                      {c.patientName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{c.mrn ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_COLORS[c.status] ?? "bg-zinc-100 text-zinc-700"}`}>
                      {SURGERY_STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.surgeryDate ? new Date(c.surgeryDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">{c.diagnosis ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.expires ? new Date(c.expires).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {c._count.callAttempts > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                        <Phone className="h-3 w-3" />
                        {c._count.callAttempts}/4
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {c._count.documents > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                        <FileText className="h-3 w-3" />
                        {c._count.documents}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
