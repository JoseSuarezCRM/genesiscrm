import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/graph-mailer"

export async function POST(req: NextRequest) {
  try {
    const { itemId, name, email, quantity, address } = await req.json()

    if (!itemId || !name?.trim() || !email?.trim() || !quantity || !address?.trim()) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 })
    }

    if (quantity < 1 || quantity > 10000) {
      return NextResponse.json({ error: "Invalid quantity." }, { status: 400 })
    }

    const item = await (prisma as any).marketingItem.findUnique({
      where: { id: itemId },
      include: { category: true },
    })
    if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 })

    const order = await (prisma as any).marketingOrder.create({
      data: { itemId, name: name.trim(), email: email.trim(), quantity, address: address.trim() },
    })

    // In-app notifications for all admin users
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    })
    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          type: "MARKETING_ORDER",
          message: `New order: ${quantity}x "${item.title}" from ${name}`,
          link: "/settings/marketing?tab=orders",
        })),
      })
    }

    // Email notification
    const cfg = await (prisma as any).marketingConfig.findUnique({ where: { id: "singleton" } })
    if (cfg?.notifyEmail) {
      const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(item.fileUrl)
      await sendEmail(
        cfg.notifyEmail,
        `New Print Order: ${item.title}`,
        `
          <h2 style="margin:0 0 16px">New Marketing Order</h2>
          <table style="border-collapse:collapse;font-size:14px">
            <tr><td style="padding:4px 12px 4px 0;color:#64748b;font-weight:600">Item</td><td>${item.title} (${item.category.name})</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#64748b;font-weight:600">Quantity</td><td>${quantity}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#64748b;font-weight:600">Name</td><td>${name}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#64748b;font-weight:600">Email</td><td>${email}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#64748b;font-weight:600">Ship to</td><td style="white-space:pre-wrap">${address}</td></tr>
          </table>
          <p style="margin:20px 0 8px"><strong>File:</strong> <a href="${item.fileUrl}">${item.fileName}</a></p>
          ${isImage ? `<img src="${item.fileUrl}" alt="${item.title}" style="max-width:400px;border-radius:8px;margin-top:8px"/>` : ""}
        `
      ).catch(() => {}) // don't fail the order if email fails
    }

    return NextResponse.json({ success: true, orderId: order.id })
  } catch (err) {
    console.error("Order error:", err)
    return NextResponse.json({ error: "Failed to submit order." }, { status: 500 })
  }
}
