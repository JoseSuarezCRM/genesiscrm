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
  experimental: {
    // ssh2 (under ssh2-sftp-client) uses native/dynamic requires — don't bundle it,
    // require it at runtime on the server instead.
    serverComponentsExternalPackages: ["ssh2", "ssh2-sftp-client"],
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
