import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { userCanLevel } from "@/lib/permissions"
import { listDocumentTemplates } from "@/app/actions/document-templates"
import { listObjectTypes } from "@/lib/object-registry"
import DocumentTemplatesList from "@/components/document-templates-list"

export default async function DocumentTemplatesPage() {
  const session = await auth()
  if (!userCanLevel(session?.user as any, "TEMPLATES", "EDIT")) redirect("/communications/email")
  const [templates, objectTypes] = await Promise.all([listDocumentTemplates(), listObjectTypes()])

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Document Templates</h1>
        <p className="text-sm text-slate-500 mt-1">
          Build PDF letters with personalization tokens. Generate a filled PDF from any record, or attach one automatically in workflow emails.
        </p>
      </div>
      <DocumentTemplatesList
        templates={templates.map((t) => ({ id: t.id, name: t.name, objectType: t.objectType, isActive: t.isActive, updatedAt: String(t.updatedAt) }))}
        objectTypes={objectTypes}
      />
    </div>
  )
}
