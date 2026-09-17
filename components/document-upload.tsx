"use client"

import { useRef, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Upload, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"

export default function DocumentUpload({ referralId }: { referralId: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState("")
  const router = useRouter()

  // Every selected file, one request each (the route takes one), refreshed once
  // at the end. A file that fails is named rather than aborting the batch.
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return

    setError(null)

    startTransition(async () => {
      const failed: string[] = []
      for (let i = 0; i < files.length; i++) {
        setProgress(files.length > 1 ? `${i + 1} of ${files.length}` : "")
        const formData = new FormData()
        formData.append("file", files[i])
        formData.append("referralId", referralId)
        try {
          const res = await fetch("/api/documents/upload", { method: "POST", body: formData })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            failed.push(`${files[i].name} (${data.error ?? `HTTP ${res.status}`})`)
          }
        } catch {
          failed.push(`${files[i].name} (network error)`)
        }
      }
      setProgress("")
      if (failed.length) setError(`Couldn't upload: ${failed.join(", ")}`)
      router.refresh()

      // Reset input so the same file can be re-selected
      if (inputRef.current) inputRef.current.value = ""
    })
  }

  return (
    <div className="flex items-center gap-2">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
        className="hidden"
        onChange={handleFileChange}
        disabled={isPending}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => inputRef.current?.click()}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
        ) : (
          <Upload className="h-4 w-4 mr-1.5" />
        )}
        {isPending ? (progress ? `Uploading ${progress}` : "Uploading…") : "Upload"}
      </Button>
    </div>
  )
}
