import { PrismaClient, Role } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  const hashedPassword = await bcrypt.hash("admin123", 10)

  const admin = await prisma.user.upsert({
    where: { email: "admin@genesisortho.com" },
    update: {},
    create: {
      email: "admin@genesisortho.com",
      name: "Admin User",
      password: hashedPassword,
      role: Role.ADMIN,
    },
  })

  console.log("Seeded admin user:")
  console.log("  Email:    admin@genesisortho.com")
  console.log("  Password: admin123")
  console.log("  ID:      ", admin.id)

  // Seed some sample referring practices
  const practices = await Promise.all([
    prisma.referringPractice.upsert({
      where: { id: "practice-1" },
      update: {},
      create: {
        id: "practice-1",
        name: "Downtown Family Medicine",
        phone: "555-100-2000",
        fax: "555-100-2001",
        address: "123 Main St, Suite 100",
      },
    }),
    prisma.referringPractice.upsert({
      where: { id: "practice-2" },
      update: {},
      create: {
        id: "practice-2",
        name: "Northside Sports Medicine",
        phone: "555-200-3000",
        fax: "555-200-3001",
        address: "456 Oak Ave",
      },
    }),
  ])

  console.log(`Seeded ${practices.length} referring practices.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
