import type { NextAuthConfig } from "next-auth"

// Edge-compatible config — no Node.js-only imports (no Prisma, no bcrypt)
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  // HIPAA: automatic logoff after 30 minutes of inactivity
  session: {
    strategy: "jwt",
    maxAge: 30 * 60,    // 30 minutes
    updateAge: 5 * 60,  // slide window every 5 minutes of activity
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isOnLogin = nextUrl.pathname === "/login"
      if (isOnLogin) {
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl))
        return true
      }
      if (!isLoggedIn) return false
      return true
    },
    jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
        token.id = user.id
        token.permissions = (user as any).permissions ?? []
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        ;(session.user as any).role = token.role as string
        ;(session.user as any).permissions = token.permissions ?? []
      }
      return session
    },
  },
  providers: [], // filled in lib/auth.ts
}
