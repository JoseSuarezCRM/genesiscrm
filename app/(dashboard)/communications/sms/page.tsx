import { auth } from "@/lib/auth"
import { requireView } from "@/lib/auth-guard"
import { redirect } from "next/navigation"
import { getMessageTemplates } from "@/app/actions/message-templates"
import { userCanLevel, userCanDelete } from "@/lib/permissions"
import MessageTemplateManager from "@/components/message-template-manager"

export default async function SmsTemplatesPage() {
  const session = await requireView("TEMPLATES")
  if (!session) redirect("/login")
  const templates = await getMessageTemplates("SMS")
  return (
    <MessageTemplateManager
      channel="SMS"
      templates={templates as any}
      canManage={userCanLevel(session.user as any, "TEMPLATES", "EDIT")}
      canDelete={userCanDelete(session.user as any, "TEMPLATES")}
    />
  )
}
