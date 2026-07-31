import { NextResponse } from "next/server"
import { authenticateApiRequest, apiError } from "@/lib/api-tokens"
import { resolveApiObject } from "@/lib/api-objects"
import { listRecords, createRecord } from "@/lib/api-records"

// GET /api/v1/<object>?limit=&cursor=  → list any object (built-in or custom)
export async function GET(req: Request, { params }: { params: { object: string } }) {
  const obj = await resolveApiObject(params.object)
  if (!obj) return apiError(404, `Unknown object "${params.object}".`, "unknown_object")
  const a = await authenticateApiRequest(req, `${obj.slug}:read`)
  if ("error" in a) return a.error

  const url = new URL(req.url)
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)))
  const cursor = url.searchParams.get("cursor") ?? undefined
  const { data, nextCursor } = await listRecords(obj, { limit, cursor })
  return NextResponse.json({ data, nextCursor })
}

// POST /api/v1/<object>  → create
export async function POST(req: Request, { params }: { params: { object: string } }) {
  const obj = await resolveApiObject(params.object)
  if (!obj) return apiError(404, `Unknown object "${params.object}".`, "unknown_object")
  const a = await authenticateApiRequest(req, `${obj.slug}:write`)
  if ("error" in a) return a.error

  let body: any
  try { body = await req.json() } catch { return apiError(400, "Invalid JSON body.") }
  if (!body || typeof body !== "object") return apiError(422, "Body must be a JSON object.")
  try {
    const created = await createRecord(obj, body)
    return NextResponse.json({ data: created }, { status: 201 })
  } catch (e: any) {
    return apiError(422, e?.message ?? "Could not create the record.", "create_failed")
  }
}
