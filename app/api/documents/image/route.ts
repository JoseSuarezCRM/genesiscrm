import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { userCanLevel } from "@/lib/permissions"

// Streams a private Blob image (template logo/signature/photo) to signed-in users
// so the builder can display it. Restricted to document-asset blobs.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !userCanLevel(session.user as any, "TEMPLATES", "EDIT")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const u = new URL(req.url).searchParams.get("u") ?? ""
  if (!/^https:\/\/[^/]+\.blob\.vercel-storage\.com\/document-assets\//.test(u)) {
    return NextResponse.json({ error: "Invalid image URL." }, { status: 400 })
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN
  const res = await fetch(u, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
  if (!res.ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const buf = Buffer.from(await res.arrayBuffer())
  return new NextResponse(buf as any, {
    headers: { "Content-Type": res.headers.get("content-type") ?? "image/png", "Cache-Control": "private, max-age=300" },
  })
}
