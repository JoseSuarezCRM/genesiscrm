/**
 * Turning a pasted, dropped or picked screenshot into something small enough
 * to send for reading. Browser-only.
 *
 * Re-encoding through a canvas does three jobs at once: it downsizes (a phone
 * screenshot is often 1290×2796 — far more pixels than the model needs), it
 * normalises every format the browser can decode into one JPEG, and it drops
 * the file's metadata (EXIF, GPS), which never leaves the device.
 *
 * The image is held in memory only: it is never uploaded to storage, never
 * saved on the record, and its preview URL is revoked when replaced.
 */

export interface PreparedImage {
  /** Identity of this image for the merge model (changes when the image does). */
  key: string
  mediaType: "image/jpeg"
  /** Base64, without the data: prefix. */
  data: string
  /** Object URL for the on-screen preview. Revoke with `releaseImage`. */
  previewUrl: string
  width: number
  height: number
}

const LONG_EDGE = 2048
const MAX_BYTES = 2.5 * 1024 * 1024

export class ImageReadError extends Error {}

async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions)
  } catch {
    throw new ImageReadError("That image couldn't be opened. Try a screenshot (PNG or JPEG).")
  }
}

function encode(bitmap: ImageBitmap, scale: number, quality: number): Promise<Blob> {
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) return Promise.reject(new ImageReadError("This browser can't process images."))
  // Transparent PNGs would otherwise turn black in a JPEG.
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bitmap, 0, 0, w, h)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new ImageReadError("The image couldn't be processed."))), "image/jpeg", quality),
  )
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const s = String(r.result ?? "")
      resolve(s.slice(s.indexOf(",") + 1))
    }
    r.onerror = () => reject(new ImageReadError("The image couldn't be read."))
    r.readAsDataURL(blob)
  })
}

let counter = 0

export async function prepareImage(file: Blob): Promise<PreparedImage> {
  if (file.type && !file.type.startsWith("image/")) throw new ImageReadError("That file isn't an image.")
  if (file.size > 40 * 1024 * 1024) throw new ImageReadError("That image is too large.")
  const bitmap = await decode(file)
  try {
    let scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height))
    let quality = 0.9
    let blob = await encode(bitmap, scale, quality)
    // Step quality down, then size, until it fits.
    for (let i = 0; blob.size > MAX_BYTES && i < 6; i++) {
      if (quality > 0.7) quality -= 0.1
      else scale *= 0.8
      blob = await encode(bitmap, scale, quality)
    }
    if (blob.size > MAX_BYTES) throw new ImageReadError("That image is too large. Try a smaller screenshot.")
    return {
      key: `img-${Date.now()}-${++counter}`,
      mediaType: "image/jpeg",
      data: await toBase64(blob),
      previewUrl: URL.createObjectURL(blob),
      width: Math.round(bitmap.width * scale),
      height: Math.round(bitmap.height * scale),
    }
  } finally {
    bitmap.close()
  }
}

export function releaseImage(img: PreparedImage | null | undefined) {
  if (img) URL.revokeObjectURL(img.previewUrl)
}

/** The first image in a paste or drop, if there is one. */
export function imageFromTransfer(dt: DataTransfer | null): File | null {
  if (!dt) return null
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) return item.getAsFile()
  }
  for (const f of Array.from(dt.files ?? [])) if (f.type.startsWith("image/")) return f
  return null
}
