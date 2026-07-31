import crypto from "crypto"

// AES-256-GCM encryption for secrets stored at rest (e.g. third-party API keys).
// The root key comes from ENCRYPTION_KEY — a 32-byte key, base64 or hex encoded,
// or any string (hashed to 32 bytes as a fallback). This is the ONE secret that
// must live in the environment; everything it protects can live in the database.

function rootKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) throw new Error("ENCRYPTION_KEY is not set")
  // Accept base64 or hex 32-byte keys; otherwise derive 32 bytes via SHA-256.
  for (const enc of ["base64", "hex"] as const) {
    try {
      const b = Buffer.from(raw, enc)
      if (b.length === 32) return b
    } catch { /* try next */ }
  }
  return crypto.createHash("sha256").update(raw).digest()
}

export function hasEncryptionKey(): boolean {
  return !!process.env.ENCRYPTION_KEY
}

// Returns "v1:<iv b64>:<tag b64>:<ciphertext b64>".
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", rootKey(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":")
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Bad ciphertext format")
  const [, ivB64, tagB64, dataB64] = parts
  const decipher = crypto.createDecipheriv("aes-256-gcm", rootKey(), Buffer.from(ivB64, "base64"))
  decipher.setAuthTag(Buffer.from(tagB64, "base64"))
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8")
}

// A random URL-safe secret (hex), for webhook tokens etc.
export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("hex")
}

// Last few chars for a masked display (e.g. "••••d61a").
export function maskTail(value: string, tail = 4): string {
  const t = value.slice(-tail)
  return `••••${t}`
}
