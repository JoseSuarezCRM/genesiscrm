"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Check, Copy, ExternalLink } from "lucide-react"

interface EmbedFormSettingsProps {
  baseUrl: string
}

export default function EmbedFormSettings({ baseUrl }: EmbedFormSettingsProps) {
  const formUrl = `${baseUrl}/refer`
  const [height, setHeight] = useState("750")
  const [copied, setCopied] = useState(false)

  const iframeCode = `<iframe
  src="${formUrl}"
  width="100%"
  height="${height}"
  frameborder="0"
  style="border:none; max-width:680px; width:100%;"
  title="Referral Form"
></iframe>`

  async function copyCode() {
    await navigator.clipboard.writeText(iframeCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Form URL */}
      <div className="rounded-lg border border-slate-200 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Form URL</h2>
        <div className="flex items-center gap-2">
          <Input value={formUrl} readOnly className="font-mono text-sm bg-slate-50" />
          <a
            href={formUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="icon" title="Open form in new tab">
              <ExternalLink className="h-4 w-4" />
            </Button>
          </a>
        </div>
      </div>

      {/* Height customization */}
      <div className="rounded-lg border border-slate-200 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Customize</h2>
        <div className="flex items-center gap-3">
          <Label className="whitespace-nowrap text-sm">Height (px)</Label>
          <Input
            type="number"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            min={400}
            max={1200}
            className="w-28"
          />
          <span className="text-xs text-slate-400">Recommended: 700–800px</span>
        </div>
      </div>

      {/* Embed code */}
      <div className="rounded-lg border border-slate-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Embed Code</h2>
          <Button variant="outline" size="sm" onClick={copyCode} className="gap-1.5">
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-green-500" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy Code
              </>
            )}
          </Button>
        </div>
        <pre className="bg-slate-950 text-slate-100 rounded-md p-4 text-xs font-mono whitespace-pre overflow-x-auto leading-relaxed">
          {iframeCode}
        </pre>
      </div>

      {/* WordPress instructions */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-blue-800">How to add to WordPress</h2>
        <ol className="space-y-2 text-sm text-blue-900">
          <li className="flex gap-2">
            <span className="font-bold shrink-0">1.</span>
            In WordPress, open the page or post where you want the form.
          </li>
          <li className="flex gap-2">
            <span className="font-bold shrink-0">2.</span>
            Click the <strong>+</strong> button to add a new block, then search for and select <strong>Custom HTML</strong>.
          </li>
          <li className="flex gap-2">
            <span className="font-bold shrink-0">3.</span>
            Paste the embed code above into the Custom HTML block.
          </li>
          <li className="flex gap-2">
            <span className="font-bold shrink-0">4.</span>
            Click <strong>Preview</strong> to verify the form appears, then <strong>Publish</strong> or <strong>Update</strong> the page.
          </li>
        </ol>
        <p className="text-xs text-blue-700 pt-1">
          Using the Classic Editor? Switch to <strong>Text</strong> tab and paste the code directly.
        </p>
      </div>
    </div>
  )
}
