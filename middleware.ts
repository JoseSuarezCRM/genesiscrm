import NextAuth from "next-auth"
import { authConfig } from "@/auth.config"

export default NextAuth(authConfig).auth

/**
 * Everything is behind a session except the paths listed here.
 *
 * `api/media` is on the list because that route only ever works unauthenticated:
 * it serves logos, banners and surgeon photographs to places that have no
 * session and never will — a recipient's email client, a generated PDF, the
 * public surgeon websites and their build. Without the exclusion it answers 307
 * to /login, which renders as a broken image with no error anyone would see.
 * It was missing, and that is exactly how it behaved.
 *
 * What keeps that safe is upstream, not here: uploads to it require
 * TEMPLATES:EDIT, accept images only, and are capped at 5 MB, and ids are
 * unguessable cuids. Patient documents are a different model behind a different
 * route. **Nothing containing PHI may ever be stored in MediaAsset** — that is
 * the condition this exclusion depends on.
 */
export const config = {
  matcher: [
    "/((?!api/auth|api/cron|api/public|api/media|api/resources|api/webhooks|_next/static|_next/image|favicon.ico|refer|resources|accept-invite).*)",
  ],
}
