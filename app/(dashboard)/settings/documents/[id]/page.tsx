import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { auth } from "@/lib/auth"
import { userCan } from "@/lib/permissions"
import { getDocumentTemplate } from "@/app/actions/document-templates"
import { listObjectTypes } from "@/lib/object-registry"
import { asBlocks } from "@/lib/document-blocks"
import DocumentTemplateBuilder from "@/components/document-template-builder"

export default async function DocumentTemplateEditPage({ params }: { params: { id: string } }) {
  const session = await auth()
  if (!userCan(session?.user as any, "MANAGE_USERS")) redirect("/settings")
  const [tpl, objectTypes] = await Promise.all([getDocumentTemplate(params.id), listObjectTypes()])
  if (!tpl) notFound()

  return (
    <div className="p-6">
      <Link href="/settings/documents" className="inline-flex items-center text-xs text-slate-500 hover:text-slate-800 mb-3">
        <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Document Templates
      </Link>
      <DocumentTemplateBuilder
        template={{ id: tpl.id, name: tpl.name, objectType: tpl.objectType, blocks: asBlocks(tpl.blocks), pageSize: tpl.pageSize, isActive: tpl.isActive }}
        objectTypes={objectTypes}
      />
    </div>
  )
}
