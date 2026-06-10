import { prisma } from "@/lib/prisma"

type EntityType = "REFERRAL" | "PROVIDER" | "PRACTICE"

export async function loadCustomPropertiesForDetail(
  entityType: EntityType,
  entityId: string
) {
  // Get all custom properties for this entity type
  const customProps = await prisma.customProperty.findMany({
    where: { entityType },
    orderBy: { createdAt: "asc" },
  })

  // Get display configs
  const displays = await prisma.propertyDisplayConfig.findMany({
    where: { entityType },
  })

  // Get entity values
  let entity: any = null
  if (entityType === "REFERRAL") {
    entity = await prisma.referral.findUnique({
      where: { id: entityId },
      select: { customProperties: true },
    })
  } else if (entityType === "PROVIDER") {
    entity = await prisma.referringDoctor.findUnique({
      where: { id: entityId },
      select: { customProperties: true },
    })
  } else {
    entity = await prisma.referringPractice.findUnique({
      where: { id: entityId },
      select: { customProperties: true },
    })
  }

  const values = (entity?.customProperties as Record<string, any>) || {}

  // Combine into display format
  return customProps.map((prop) => {
    const display = displays.find((d) => d.customPropertyId === prop.id) || {
      visible: true,
      order: 0,
    }

    return {
      id: prop.id,
      name: prop.name,
      type: prop.type,
      required: prop.required,
      options: prop.options,
      display: {
        visible: display.visible,
        order: display.order,
      },
      value: values[prop.id],
    }
  })
}
