import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { WorkflowEditor } from "@/components/automation-manager"

interface Props {
  params: { id: string }
}

export default async function WorkflowEditorPage({ params }: Props) {
  const [users, tags, practices, locations, pipelines, customProps, templates] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
    prisma.tag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, color: true } }),
    prisma.referringPractice.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.practiceLocation.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.pipeline.findMany({ where: { isActive: true }, orderBy: [{ order: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, color: true } }),
    prisma.customProperty.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, internalName: true, type: true, options: true, entityType: true } }),
    prisma.messageTemplate.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, channel: true } }),
  ])

  // Custom objects are workflow objects too — they offer the generic triggers.
  const customObjectDefs = await (prisma as any).customObjectDef.findMany({
    orderBy: { order: "asc" },
    select: { key: true, singular: true, plural: true, properties: true },
  })
  const customObjects = customObjectDefs.map((d: any) => ({
    key: d.key, singular: d.singular, plural: d.plural,
    properties: ((d.properties as any[]) ?? []).map((p) => ({ id: p.id, name: p.name, type: p.type, options: p.options ?? [] })),
  }))

  // Group custom properties by entity type so the editor can show the right
  // set based on which object the workflow runs on.
  const customPropsByEntity: Record<string, { id: string; name: string; internalName: string | null; type: string; options: string[] }[]> = {}
  for (const cp of customProps) {
    const key = cp.entityType as string
    ;(customPropsByEntity[key] ??= []).push({ id: cp.id, name: cp.name, internalName: cp.internalName, type: cp.type, options: cp.options })
  }

  let automation = null
  if (params.id !== "new") {
    automation = await prisma.automation.findUnique({
      where: { id: params.id },
      include: {
        createdBy: { select: { name: true, email: true } },
        _count: { select: { runs: true } },
      },
    })
    if (!automation) notFound()
  }

  return (
    <WorkflowEditor
      editing={automation as any}
      users={users}
      tags={tags}
      practices={practices}
      locations={locations}
      pipelines={pipelines}
      customPropsByEntity={customPropsByEntity}
      templates={templates as any}
      customObjects={customObjects}
    />
  )
}
