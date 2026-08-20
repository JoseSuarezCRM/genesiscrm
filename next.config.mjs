/** @type {import('next').NextConfig} */

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

    // Operations Planner dashboard: framed same-origin inside the app (see
    // components/scheduling-planner.tsx), so it must allow SAMEORIGIN/'self' framing —
    // but NOT external embedding. DENY/'none' would block even our own iframe.
    const plannerHeaders = securityHeaders.map((h) =>
      h.key === "X-Frame-Options"
        ? { ...h, value: "SAMEORIGIN" }
        : h.key === "Content-Security-Policy"
          ? { ...h, value: h.value.replace("frame-ancestors 'none'", "frame-ancestors 'self'") }
          : h
    )

    return [
      // /refer must be embeddable — no X-Frame-Options, open frame-ancestors
      { source: "/refer", headers: embedHeaders },
      // The planner dashboard must be framable same-origin
      { source: "/scheduling-planner.html", headers: plannerHeaders },
      // All other routes get full security headers (excludes /refer and the planner file)
      { source: "/((?!refer$|scheduling-planner\\.html$).*)", headers: securityHeaders },
    ]
  },
}

export default nextConfig
