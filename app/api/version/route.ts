import { NextResponse } from "next/server"

// Always reflects the CURRENTLY-deployed build. The client compares this against
// the build id baked into its bundle (NEXT_PUBLIC_BUILD_ID) to detect updates.
export const dynamic = "force-dynamic"
export const revalidate = 0

export function GET() {
  const version = process.env.VERCEL_GIT_COMMIT_SHA || process.env.BUILD_ID || "dev"
  return NextResponse.json(
    { version },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  )
}
