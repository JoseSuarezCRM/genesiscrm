import { NextResponse } from "next/server"
import { authenticateApiRequest, apiError } from "@/lib/api-tokens"
import { resolveApiObject } from "@/lib/api-objects"
import { getRecord, updateRecord } from "@/lib/api-records"

// GET /api/v1/<object>/<id>
export async function GET(req: Request, { params }: { params: { object: string; id: string } }) {
  const obj = await resolveApiObject(params.object)
  if (!obj) return apiError(404, `Unknown object "${params.object}".`, "unknown_object")
  const a = await authenticateApiRequest(req, `${obj.slug}:read`)
  if ("error" in a) return a.error
  const rec = await getRecord(obj, params.id)
  if (!rec) return apiError(404, "Record not found.", "not_found")
  return NextResponse.json({ data: rec })
}

// PATCH /api/v1/<object>/<id>  → partial update
export async function PATCH(req: Request, { params }: { params: { object: string; id: string } }) {
  const obj = await resolveApiObject(params.object)
  if (!obj) return apiError(404, `Unknown object "${params.object}".`, "unknown_object")
  const a = await authenticateApiRequest(req, `${obj.slug}:write`)
  if ("error" in a) return a.error

  let body: any
  try { body = await req.json() } catch { return apiError(400, "Invalid JSON body.") }
  if (!body || typeof body !== "object") return apiError(422, "Body must be a JSON object.")
  try {
    const updated = await updateRecord(obj, params.id, body)
    if (!updated) return apiError(404, "Record not found.", "not_found")
    return NextResponse.json({ data: updated })
  } catch (e: any) {
    return apiError(422, e?.message ?? "Could not update the record.", "update_failed")
  }
}
