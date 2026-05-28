import NextAuth from "next-auth"
import { authConfig } from "@/auth.config"

export default NextAuth(authConfig).auth

export const config = {
  matcher: ["/((?!api/auth|api/public|api/resources|api/webhooks|_next/static|_next/image|favicon.ico|refer|resources).*)"],
}
