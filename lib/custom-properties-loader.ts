import { prisma } from "@/lib/prisma"

type EntityType = "REFERRAL" | "PROVIDER" | "PRACTICE" | "LOCATION"

export async function loadCustomPropertiesForDetail(
  entityType: EntityType,
  entityId: string
) {
  try {
    // Get all custom properties for this entity type
    const customProps = await prisma.customProperty.findMany({
      where: { entityType },
      orderBy: { createdAt: "asc" },
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
    } else if (entityType === "LOCATION") {
      entity = await prisma.practiceLocation.findUnique({
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

    // Combine into display format with defaults
    // PropertyDisplayConfig will be queried separately by the customization page
    return customProps.map((prop) => {
      return {
        id: prop.id,
        name: prop.name,
        type: prop.type,
        required: prop.required,
        options: prop.options,
        display: {
          visible: true,
          order: 0,
        },
        value: values[prop.id],
      }
    })
  } catch (error) {
    console.error("Error loading custom properties:", error)
    // Return empty array if something goes wrong
    return []
  }
}
