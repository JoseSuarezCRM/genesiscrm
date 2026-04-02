"use client"

import { useState, useTransition } from "react"
import { Plus, X, Tag as TagIcon, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createTag, deleteTag, setReferralTags } from "@/app/actions/tags"

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6",
  "#64748b", "#1e293b",
]

interface Tag {
  id: string
  name: string
  color: string
}

interface Props {
  referralId: string
  allTags: Tag[]
  selectedTagIds: string[]
}

export default function TagSelector({ referralId, allTags: initialTags, selectedTagIds: initialSelected }: Props) {
  const [allTags, setAllTags] = useState(initialTags)
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelected)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState("")
  const [newColor, setNewColor] = useState(PRESET_COLORS[4])
  const [createError, setCreateError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function toggleTag(tagId: string) {
    const next = selectedIds.includes(tagId)
      ? selectedIds.filter((id) => id !== tagId)
      : [...selectedIds, tagId]
    setSelectedIds(next)
    startTransition(async () => {
      await setReferralTags(referralId, next)
    })
  }

  function handleCreate() {
    if (!newName.trim()) { setCreateError("Name is required"); return }
    setCreateError(null)
    startTransition(async () => {
      const result = await createTag({ name: newName.trim(), color: newColor })
      if ("error" in result && result.error) { setCreateError(result.error); return }
      if ("tag" in result && result.tag) {
        setAllTags((prev) => [...prev, result.tag!].sort((a, b) => a.name.localeCompare(b.name)))
      }
      setNewName("")
      setShowCreate(false)
    })
  }

  function handleDelete(tagId: string) {
    startTransition(async () => {
      await deleteTag(tagId)
      setAllTags((prev) => prev.filter((t) => t.id !== tagId))
      setSelectedIds((prev) => prev.filter((id) => id !== tagId))
    })
  }

  return (
    <div className="space-y-3">
      {/* Tag chips */}
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {allTags.length === 0 && !showCreate && (
          <span className="text-xs text-slate-400">No tags yet — create one below.</span>
        )}
        {allTags.map((tag) => {
          const selected = selectedIds.includes(tag.id)
          return (
            <div key={tag.id} className="flex items-center group">
              <button
                type="button"
                onClick={() => toggleTag(tag.id)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-l text-xs font-medium transition-opacity"
                style={{
                  backgroundColor: selected ? tag.color : `${tag.color}22`,
                  color: selected ? "#fff" : tag.color,
                  border: `1px solid ${tag.color}`,
                  borderRight: "none",
                }}
              >
                {selected && <X className="h-2.5 w-2.5" />}
                {tag.name}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(tag.id)}
                className="px-1 py-0.5 rounded-r border border-l-0 text-slate-400 hover:text-red-500 hover:border-red-300 transition-colors opacity-0 group-hover:opacity-100"
                style={{ borderColor: tag.color }}
                title="Delete tag"
              >
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            </div>
          )
        })}
      </div>

      {/* Create new tag */}
      {showCreate ? (
        <div className="flex items-start gap-2 flex-wrap">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Tag name"
            className="h-7 text-xs w-36"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreate() } }}
            autoFocus
          />
          <div className="flex gap-1 flex-wrap">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNewColor(c)}
                className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: c,
                  borderColor: newColor === c ? "#1e293b" : "transparent",
                }}
              />
            ))}
          </div>
          <div className="flex gap-1">
            <Button type="button" size="sm" className="h-7 text-xs px-2" onClick={handleCreate} disabled={isPending}>
              Add
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => { setShowCreate(false); setNewName(""); setCreateError(null) }}>
              Cancel
            </Button>
          </div>
          {createError && <p className="text-xs text-red-600 w-full">{createError}</p>}
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 text-xs text-slate-500 px-1"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="h-3 w-3 mr-1" />
          <TagIcon className="h-3 w-3 mr-1" />
          New tag
        </Button>
      )}
    </div>
  )
}
