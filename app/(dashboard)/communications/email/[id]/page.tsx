import { notFound, redirect } from "next/navigation"
import { requireView } from "@/lib/auth-guard"
import { userCanLevel } from "@/lib/permissions"
import { getMessageTemplate } from "@/app/actions/message-templates"
import { asEmailBlocks, newBlockId, type EmailBlock } from "@/lib/email-blocks"
import EmailTemplateBuilder from "@/components/email-template-builder"

export default async function EmailTemplateBuilderPage({ params }: { params: { id: string } }) {
  const session = await requireView("TEMPLATES")
  if (!session) redirect("/login")
  if (!userCanLevel(session.user as any, "TEMPLATES", "EDIT")) redirect("/communications/email")

  const tpl = await getMessageTemplate(params.id)
  if (!tpl || tpl.channel !== "EMAIL") notFound()

  // Seed blocks: existing block template → its blocks; a rich-text template being
  // converted → its current HTML as one block; brand-new → a starter text block.
  let blocks = asEmailBlocks(tpl.blocks)
  if (blocks.length === 0) {
    blocks = tpl.body?.trim()
      ? [{ id: newBlockId(), type: "html", html: tpl.body } as EmailBlock]
      : [{ id: newBlockId(), type: "text", html: "", align: "left" } as EmailBlock]
  }

  return (
    <div className="p-6">
      <EmailTemplateBuilder template={{ id: tpl.id, name: tpl.name, subject: tpl.subject, blocks }} />
    </div>
  )
}
