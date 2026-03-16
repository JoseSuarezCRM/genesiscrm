import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getAnthropicClient } from "@/lib/anthropic"

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"]
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

const EXTRACTION_PROMPT = `You are a medical records assistant. Extract referral information from this fax document.

Return ONLY a valid JSON object with these exact keys. Use null for any field you cannot find or are uncertain about. Do not include any explanation, markdown, or text outside the JSON object.

{
  "patientFirstName": "string or null",
  "patientLastName": "string or null",
  "patientDob": "string or null - YYYY-MM-DD format only. Convert any date format to YYYY-MM-DD.",
  "patientPhone": "string or null - digits and common separators, preserve as found",
  "patientEmail": "string or null",
  "patientMrn": "string or null - patient medical record number (MRN), chart number, or patient ID if present",
  "referringDoctorName": "string or null - include title (Dr., MD, DO, etc.) if present",
  "referringOrg": "string or null - name of the referring practice or organization",
  "referringNpi": "string or null - 10-digit NPI number if present",
  "referringPhone": "string or null - phone number of the referring provider or practice",
  "referringAddress": "string or null - address of the referring provider or practice",
  "reason": "string or null - chief complaint or reason for referral",
  "insuranceProvider": "string or null",
  "insuranceMemberId": "string or null"
}

Rules:
- Do not invent or guess data. If a field is not clearly present, use null.
- patientDob must be YYYY-MM-DD. Convert MM/DD/YYYY, Month DD YYYY, etc.
- reason should be a concise summary of the referral reason or chief complaint.
- referringAddress should be the full address on one line if possible.`

export interface ExtractedReferralData {
  patientFirstName: string | null
  patientLastName: string | null
  patientDob: string | null
  patientPhone: string | null
  patientEmail: string | null
  patientMrn: string | null
  referringDoctorName: string | null
  referringPhone: string | null
  referringAddress: string | null
  insuranceProvider: string | null
  insuranceMemberId: string | null
  notes: string | null
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const file = formData.get("file") as File | null
  if (!file) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only PDF, JPG, PNG, or WEBP files are accepted." }, { status: 400 })
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File exceeds 10 MB limit." }, { status: 400 })
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString("base64")

    // Build the file content block based on type
    const fileBlock =
      file.type === "application/pdf"
        ? ({
            type: "document" as const,
            source: {
              type: "base64" as const,
              media_type: "application/pdf" as const,
              data: base64,
            },
          })
        : ({
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: file.type as "image/jpeg" | "image/png" | "image/webp",
              data: base64,
            },
          })

    const client = getAnthropicClient()
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            fileBlock,
            { type: "text", text: EXTRACTION_PROMPT },
          ],
        },
      ],
    })

    const rawText = response.content[0].type === "text" ? response.content[0].text : ""

    // Strip possible markdown code fences Claude may add despite instructions
    const cleaned = rawText.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "")

    let extracted: Record<string, string | null>
    try {
      extracted = JSON.parse(cleaned)
    } catch {
      console.error("[FAX EXTRACT] Failed to parse Claude response:", rawText)
      return NextResponse.json({ error: "AI extraction failed. Please fill the form manually." }, { status: 500 })
    }

    // Validate date format — if Claude returned an invalid format, discard it
    const dobRaw = extracted.patientDob
    const patientDob = dobRaw && /^\d{4}-\d{2}-\d{2}$/.test(dobRaw) ? dobRaw : null

    // Compose notes from org, NPI, and reason (phone/address now have dedicated fields)
    const notesParts: string[] = []
    if (extracted.referringOrg) notesParts.push(`Referring organization: ${extracted.referringOrg}`)
    if (extracted.referringNpi) notesParts.push(`NPI: ${extracted.referringNpi}`)
    if (extracted.reason) notesParts.push(`Reason: ${extracted.reason}`)

    const result: ExtractedReferralData = {
      patientFirstName: extracted.patientFirstName ?? null,
      patientLastName: extracted.patientLastName ?? null,
      patientDob,
      patientPhone: extracted.patientPhone ?? null,
      patientEmail: extracted.patientEmail ?? null,
      patientMrn: extracted.patientMrn ?? null,
      referringDoctorName: extracted.referringDoctorName ?? null,
      referringPhone: extracted.referringPhone ?? null,
      referringAddress: extracted.referringAddress ?? null,
      insuranceProvider: extracted.insuranceProvider ?? null,
      insuranceMemberId: extracted.insuranceMemberId ?? null,
      notes: notesParts.length > 0 ? notesParts.join("\n") : null,
    }

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[FAX EXTRACT]", message)
    return NextResponse.json({ error: "AI extraction failed. Please fill the form manually." }, { status: 500 })
  }
}
