/** @type {import('next').NextConfig} */

/**
 * The surgeon-site preview origin, for `frame-src`.
 *
 * Settings -> Surgeon Websites renders the draft site in an iframe. That was
 * broken from the day it shipped: the CSP below sets `default-src 'self'` and
 * never sets `frame-src` or `child-src`, and CSP falls back
 * `frame-src -> child-src -> default-src`. So the policy was effectively
 * `frame-src 'self'` and the browser refused the frame outright.
 *
 * Checking that the SITE allowed framing was only half the check — that governs
 * `frame-ancestors` on the child. This governs what the CRM may embed.
 *
 * Only the origin is used: a value carrying a path would make the directive
 * invalid and silently drop the whole policy line.
 */
function previewOrigin() {
  const raw = process.env.SURGEON_SITE_PREVIEW_URL
  if (!raw) return ""
  try {
    return new URL(raw).origin
  } catch {
    return ""
  }
}

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "off",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data: https://*.vercel-storage.com",
      "connect-src 'self' https://*.vercel-storage.com",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      // What this app may EMBED. `frame-ancestors` below is the opposite
      // direction and stays 'none' — the CRM holds a session for a PHI app and
      // must never be framable itself.
      ("frame-src 'self' " + previewOrigin()).trim(),
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
]

const nextConfig = {
  // Bake the current deploy's id into the client bundle so a running app can tell
  // when a newer version has been deployed (see components/update-banner.tsx).
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA || process.env.BUILD_ID || "dev",
  },
  experimental: {
    // ssh2 (under ssh2-sftp-client) uses native/dynamic requires — don't bundle it,
    // require it at runtime on the server instead.
    serverComponentsExternalPackages: ["ssh2", "ssh2-sftp-client", "@react-pdf/renderer"],
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        process.env.VERCEL_URL ?? "",
      ].filter(Boolean),
      // Workflow graphs can get large (many email actions with HTML bodies).
      // Default Server Action body limit is 1MB; raise it so saving big
      // automations doesn't throw a server-side exception.
      bodySizeLimit: "8mb",
    },
  },
  async headers() {
    // Embed page: strip X-Frame-Options and open frame-ancestors so any site can iframe it
    const embedHeaders = securityHeaders
      .filter((h) => h.key !== "X-Frame-Options")
      .map((h) =>
        h.key === "Content-Security-Policy"
          ? { ...h, value: h.value.replace("frame-ancestors 'none'", "frame-ancestors *") }
          : h
      )

    return [
      // /refer must be embeddable — no X-Frame-Options, open frame-ancestors
      { source: "/refer", headers: embedHeaders },
      // All other routes get full security headers (excludes /refer)
      { source: "/((?!refer$).*)", headers: securityHeaders },
    ]
  },
}

export default nextConfig
