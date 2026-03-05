import { PrismaClient, Role, OutreachTrigger, OutreachChannel } from "@prisma/client"
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

  // Seed default outreach templates (upsert — safe to re-run)
  const templates = [
    {
      trigger: OutreachTrigger.STATUS_SCHEDULED,
      channel: OutreachChannel.SMS,
      subject: null,
      body: "Hi {{firstName}}, your appointment at {{practiceName}} has been confirmed for {{appointmentDate}}. Questions? Call us at {{practicePhone}}. Reply STOP to opt out.",
    },
    {
      trigger: OutreachTrigger.STATUS_SCHEDULED,
      channel: OutreachChannel.EMAIL,
      subject: "Your Appointment at {{practiceName}} is Confirmed",
      body: "<p>Hi {{firstName}},</p><p>Your appointment at <strong>{{practiceName}}</strong> has been confirmed for <strong>{{appointmentDate}}</strong>.</p><p>If you have any questions or need to reschedule, please call us at <strong>{{practicePhone}}</strong>.</p><p>We look forward to seeing you.</p><p>{{practiceName}}</p>",
    },
    {
      trigger: OutreachTrigger.REMINDER_24HR,
      channel: OutreachChannel.SMS,
      subject: null,
      body: "Hi {{firstName}}, reminder: your appointment at {{practiceName}} is tomorrow, {{appointmentDate}}. Need to reschedule? Call {{practicePhone}}. Reply STOP to opt out.",
    },
    {
      trigger: OutreachTrigger.REMINDER_24HR,
      channel: OutreachChannel.EMAIL,
      subject: "Appointment Reminder — {{practiceName}}",
      body: "<p>Hi {{firstName}},</p><p>This is a friendly reminder that your appointment at <strong>{{practiceName}}</strong> is scheduled for <strong>{{appointmentDate}}</strong>.</p><p>Need to reschedule? Please call us at <strong>{{practicePhone}}</strong> as soon as possible.</p><p>We look forward to seeing you.</p><p>{{practiceName}}</p>",
    },
    {
      trigger: OutreachTrigger.STATUS_COMPLETED,
      channel: OutreachChannel.SMS,
      subject: null,
      body: "Hi {{firstName}}, thank you for your recent visit at {{practiceName}}. We hope you are doing well. Questions? Call {{practicePhone}}. Reply STOP to opt out.",
    },
    {
      trigger: OutreachTrigger.STATUS_COMPLETED,
      channel: OutreachChannel.EMAIL,
      subject: "Thank You for Visiting {{practiceName}}",
      body: "<p>Hi {{firstName}},</p><p>Thank you for your recent visit at <strong>{{practiceName}}</strong>. We hope you are recovering well.</p><p>If you have any questions or concerns, please don't hesitate to call us at <strong>{{practicePhone}}</strong>.</p><p>Thank you for choosing {{practiceName}}.</p><p>{{practiceName}}</p>",
    },
  ]

  for (const t of templates) {
    await prisma.outreachTemplate.upsert({
      where: { trigger_channel: { trigger: t.trigger, channel: t.channel } },
      update: {},
      create: t,
    })
  }

  console.log(`Seeded ${templates.length} outreach templates.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
