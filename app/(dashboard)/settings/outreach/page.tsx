import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getOutreachTemplates } from "@/app/actions/outreach-templates"
import OutreachTemplateManager from "@/components/outreach-template-manager"

export default async function OutreachTemplatesPage() {
  const session = await auth()
  if ((session?.user as { role?: string })?.role !== "ADMIN") {
    redirect("/")
  }

  const templates = await getOutreachTemplates()

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Outreach Templates</h1>
        <p className="text-sm text-slate-500">
          Customize automated messages sent to patients. Use{" "}
          <code className="bg-slate-100 px-1 rounded text-xs">
            {"{{firstName}}"}
          </code>
          ,{" "}
          <code className="bg-slate-100 px-1 rounded text-xs">
            {"{{appointmentDate}}"}
          </code>
          ,{" "}
          <code className="bg-slate-100 px-1 rounded text-xs">
            {"{{practiceName}}"}
          </code>
          , and{" "}
          <code className="bg-slate-100 px-1 rounded text-xs">
            {"{{practicePhone}}"}
          </code>{" "}
          as placeholders.
        </p>
      </div>

      <OutreachTemplateManager templates={templates} />
    </div>
  )
}
