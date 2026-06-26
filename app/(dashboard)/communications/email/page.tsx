import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getMessageTemplates } from "@/app/actions/message-templates"
import { userCanLevel, userCanDelete } from "@/lib/permissions"
import MessageTemplateManager from "@/components/message-template-manager"

export default async function EmailTemplatesPage() {
  const session = await auth()
  if (!session) redirect("/login")
  const templates = await getMessageTemplates("EMAIL")
  return (
    <MessageTemplateManager
      channel="EMAIL"
      templates={templates as any}
      canManage={userCanLevel(session.user as any, "TEMPLATES", "EDIT")}
      canDelete={userCanDelete(session.user as any, "TEMPLATES")}
    />
  )
}
