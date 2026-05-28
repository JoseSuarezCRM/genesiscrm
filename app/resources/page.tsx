import { prisma } from "@/lib/prisma"
import ResourcesCatalog from "@/components/resources-catalog"

export const dynamic = "force-dynamic"

export default async function ResourcesPage() {
  const categories = await (prisma as any).marketingCategory.findMany({
    orderBy: { order: "asc" },
    include: {
      items: { orderBy: { createdAt: "asc" } },
    },
    where: { items: { some: {} } },
  })

  return <ResourcesCatalog categories={categories} />
}
