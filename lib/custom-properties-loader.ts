import { prisma } from "@/lib/prisma"
import type { CPEntity } from "@/lib/custom-property-entities"

function delegateFor(type: CPEntity): any {
  return ({
    REFERRAL: prisma.referral,
    PROVIDER: prisma.referringDoctor,
    PRACTICE: prisma.referringPractice,
    LOCATION: prisma.practiceLocation,
    SURGERY: prisma.surgeryCase,
    ACTIVITY: prisma.activity,
    TASK: prisma.task,
  } as any)[type]
}

export async function loadCustomPropertiesForDetail(
  entityType: CPEntity,
  entityId: string
) {
  try {
    // Get all custom properties for this entity type
    const customProps = await prisma.customProperty.findMany({
      where: { entityType },
      orderBy: { createdAt: "asc" },
    })

    const entity = await delegateFor(entityType).findUnique({
      where: { id: entityId },
      select: { customProperties: true },
    })

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
        optionLabels: (prop as any).optionLabels ?? undefined,
        conditional: (prop as any).conditional ?? undefined,
        visibilityRule: (prop as any).visibilityRule ?? undefined,
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
