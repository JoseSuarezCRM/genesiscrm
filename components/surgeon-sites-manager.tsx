"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Globe, Plus, Loader2, Trash2, X, ExternalLink, CircleAlert } from "lucide-react"
import { createSurgeonSite, deleteSurgeonSite } from "@/app/actions/surgeon-sites"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import { cn } from "@/lib/utils"

export interface SurgeonSiteRow {
  id: string
  slug: string
  name: string
  credential: string | null
  domain: string | null
  status: "DRAFT" | "PUBLISHED" | "REDIRECTED" | "RETIRED"
  publishedAt: string | Date | null
  updatedAt: string | Date
}

/**
 * What each status means, in the words a non-engineer would use.
 *
 * The distinctions matter when a surgeon leaves. Deleting throws away pages that
 * have search history and inbound links; redirecting keeps those visitors;
 * retiring tells Google to drop the pages rather than retry a 404 for months.
 */
const STATUS: Record<
  SurgeonSiteRow["status"],
  { label: string; hint: string; className: string }
> = {
  DRAFT: {
    label: "Draft",
    hint: "Not live. Nobody outside the practice can see it.",
    className: "bg-zinc-100 text-zinc-600 border-zinc-200",
  },
  PUBLISHED: {
    label: "Live",
    hint: "Serving on its domain.",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  REDIRECTED: {
    label: "Redirected",
    hint: "Visitors are sent to another page. Use when a surgeon has left.",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  RETIRED: {
    label: "Retired",
    hint: "Taken down, and search engines are told to drop the pages.",
    className: "bg-zinc-100 text-zinc-500 border-zinc-200",
  },
}

export function SurgeonSitesManager({ initial }: { initial: SurgeonSiteRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [credential, setCredential] = useState("MD")
  const [err, setErr] = useState<string | null>(null)

  function create() {
    setErr(null)
    startTransition(async () => {
      try {
        const id = await createSurgeonSite({ name, credential })
        setCreating(false)
        setName("")
        router.push(`/settings/surgeon-sites/${id}`)
      } catch (e: any) {
        setErr(e?.message ?? "Could not create the site")
      }
    })
  }

  async function remove(row: SurgeonSiteRow) {
    const ok = await confirmDialog(
      row.status === "PUBLISHED"
        ? `"${row.name}" is live. Deleting removes the content entirely — if this surgeon has left, Redirected or Retired is usually the better choice. Delete anyway?`
        : `Delete the site for "${row.name}"? This cannot be undone.`,
    )
    if (!ok) return
    startTransition(async () => {
      await deleteSurgeonSite(row.id)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          {initial.length} {initial.length === 1 ? "site" : "sites"}
        </p>
        <button
          onClick={() => setCreating((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
        >
          {creating ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {creating ? "Cancel" : "New site"}
        </button>
      </div>

      {creating && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-900">Add a surgeon website</p>
          <p className="mt-1 text-xs text-zinc-500">
            Starts empty. Their credentials, biography and clinics are filled in next — nothing is
            copied from another surgeon.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Surgeon's name, e.g. Nolan Horner"
              className="min-w-[18rem] flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            />
            <input
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
              placeholder="MD"
              className="w-24 rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            />
            <button
              onClick={create}
              disabled={pending || !name.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Create
            </button>
          </div>
          {err && (
            <p className="mt-3 flex items-center gap-2 text-sm text-red-600">
              <CircleAlert className="h-4 w-4" /> {err}
            </p>
          )}
        </div>
      )}

      {initial.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 p-10 text-center">
          <Globe className="mx-auto h-8 w-8 text-zinc-300" />
          <p className="mt-3 text-sm font-medium text-zinc-700">No surgeon websites yet</p>
          <p className="mt-1 text-sm text-zinc-500">
            Add one for each surgeon whose site we publish.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50/60">
              <tr className="text-left text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3 font-medium">Surgeon</th>
                <th className="px-4 py-3 font-medium">Domain</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last published</th>
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {initial.map((row) => {
                const s = STATUS[row.status]
                return (
                  <tr key={row.id} className="hover:bg-zinc-50/60">
                    <td className="px-4 py-3">
                      <Link
                        href={`/settings/surgeon-sites/${row.id}`}
                        className="font-medium text-zinc-900 hover:underline"
                      >
                        {row.name}
                        {row.credential ? `, ${row.credential}` : ""}
                      </Link>
                      <div className="text-xs text-zinc-400">{row.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      {row.domain ? (
                        <a
                          href={`https://${row.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-zinc-600 hover:text-zinc-900"
                        >
                          {row.domain}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-zinc-400">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        title={s.hint}
                        className={cn(
                          "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                          s.className,
                        )}
                      >
                        {s.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {row.publishedAt
                        ? new Date(row.publishedAt).toLocaleDateString()
                        : <span className="text-zinc-400">Never</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => remove(row)}
                        disabled={pending}
                        title="Delete this site"
                        className="text-zinc-300 transition-colors hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
