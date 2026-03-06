"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Check, Copy, ExternalLink, Bell } from "lucide-react"
import { updateEmbedNotifications } from "@/app/actions/embed-notifications"

type User = {
  id: string
  name: string | null
  email: string
  notifyOnEmbedReferral: boolean
}

interface EmbedFormSettingsProps {
  baseUrl: string
  users: User[]
}

export default function EmbedFormSettings({ baseUrl, users }: EmbedFormSettingsProps) {
  const formUrl = `${baseUrl}/refer`
  const [height, setHeight] = useState("750")
  const [copied, setCopied] = useState(false)

  // Notification state
  const [selected, setSelected] = useState<Set<string>>(
    new Set(users.filter((u) => u.notifyOnEmbedReferral).map((u) => u.id))
  )
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  const iframeCode = `<div style="text-align:center;">
  <iframe
    src="${formUrl}"
    width="100%"
    height="${height}"
    frameborder="0"
    style="border:none; max-width:680px; width:100%; display:block; margin:0 auto;"
    title="Referral Form"
  ></iframe>
</div>`

  async function copyCode() {
    await navigator.clipboard.writeText(iframeCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function toggleUser(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setSaved(false)
  }

  function saveNotifications() {
    startTransition(async () => {
      await updateEmbedNotifications(Array.from(selected))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Form URL */}
      <div className="rounded-lg border border-slate-200 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Form URL</h2>
        <div className="flex items-center gap-2">
          <Input value={formUrl} readOnly className="font-mono text-sm bg-slate-50" />
          <a href={formUrl} target="_blank" rel="noopener noreferrer">
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

      {/* Notification recipients */}
      <div className="rounded-lg border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">Email Notifications</h2>
        </div>
        <p className="text-xs text-slate-500">
          Selected users will receive an email when a referral is submitted through the embedded form.
        </p>
        <div className="space-y-2">
          {users.map((user) => (
            <div key={user.id} className="flex items-center gap-3 py-1">
              <Checkbox
                id={user.id}
                checked={selected.has(user.id)}
                onCheckedChange={() => toggleUser(user.id)}
              />
              <label htmlFor={user.id} className="flex-1 cursor-pointer">
                <span className="text-sm font-medium text-slate-800">
                  {user.name ?? user.email}
                </span>
                {user.name && (
                  <span className="text-xs text-slate-400 ml-2">{user.email}</span>
                )}
              </label>
            </div>
          ))}
          {users.length === 0 && (
            <p className="text-sm text-slate-400">No active users found.</p>
          )}
        </div>
        <Button
          onClick={saveNotifications}
          disabled={isPending}
          size="sm"
          className="gap-1.5"
        >
          {saved ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Saved
            </>
          ) : isPending ? (
            "Saving..."
          ) : (
            "Save Notification Settings"
          )}
        </Button>
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
