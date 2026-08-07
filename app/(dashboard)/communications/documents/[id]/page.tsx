import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { userCanLevel } from "@/lib/permissions"
import { getDocumentTemplate } from "@/app/actions/document-templates"
import { listObjectTypes } from "@/lib/object-registry"
import { asBlocks } from "@/lib/document-blocks"
import DocumentTemplateBuilder from "@/components/document-template-builder"

export default async function DocumentTemplateEditPage({ params }: { params: { id: string } }) {
  const session = await auth()
  if (!userCanLevel(session?.user as any, "TEMPLATES", "EDIT")) redirect("/communications/documents")
  const [tpl, objectTypes] = await Promise.all([getDocumentTemplate(params.id), listObjectTypes()])
  if (!tpl) notFound()

  return (
    <DocumentTemplateBuilder
      template={{ id: tpl.id, name: tpl.name, objectType: tpl.objectType, blocks: asBlocks(tpl.blocks), pageSize: tpl.pageSize, isActive: tpl.isActive }}
      objectTypes={objectTypes}
    />
  )
}
