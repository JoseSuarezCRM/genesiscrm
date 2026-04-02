"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import { Plus, X, ChevronDown, Tag as TagIcon, Trash2 } from "lucide-react"
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
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState("")
  const [newColor, setNewColor] = useState(PRESET_COLORS[4])
  const [createError, setCreateError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedTags = allTags.filter((t) => selectedIds.includes(t.id))
  const availableTags = allTags.filter((t) => !selectedIds.includes(t.id))

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
        setShowCreate(false)
        setNewName("")
        setCreateError(null)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  function addTag(tagId: string) {
    const next = [...selectedIds, tagId]
    setSelectedIds(next)
    setDropdownOpen(false)
    startTransition(async () => { await setReferralTags(referralId, next) })
  }

  function removeTag(tagId: string) {
    const next = selectedIds.filter((id) => id !== tagId)
    setSelectedIds(next)
    startTransition(async () => { await setReferralTags(referralId, next) })
  }

  function handleCreate() {
    if (!newName.trim()) { setCreateError("Name is required"); return }
    setCreateError(null)
    startTransition(async () => {
      const result = await createTag({ name: newName.trim(), color: newColor })
      if ("error" in result && result.error) { setCreateError(result.error); return }
      if ("tag" in result && result.tag) {
        const tag = result.tag!
        setAllTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)))
        // Auto-select the newly created tag
        const next = [...selectedIds, tag.id]
        setSelectedIds(next)
        await setReferralTags(referralId, next)
      }
      setNewName("")
      setShowCreate(false)
      setDropdownOpen(false)
    })
  }

  function handleDeleteGlobalTag(tagId: string, e: React.MouseEvent) {
    e.stopPropagation()
    startTransition(async () => {
      await deleteTag(tagId)
      setAllTags((prev) => prev.filter((t) => t.id !== tagId))
      setSelectedIds((prev) => prev.filter((id) => id !== tagId))
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 min-w-0 w-full">
      {/* Selected tag chips */}
      {selectedTags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs font-medium text-white"
          style={{ backgroundColor: tag.color }}
        >
          {tag.name}
          <button
            type="button"
            onClick={() => removeTag(tag.id)}
            className="rounded-full p-0.5 hover:bg-black/20 transition-colors"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}

      {/* Add tag dropdown */}
      <div className="relative" ref={dropdownRef}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-6 text-xs px-2 gap-1"
          onClick={() => { setDropdownOpen((o) => !o); setShowCreate(false) }}
        >
          <Plus className="h-3 w-3" />
          Add tag
          <ChevronDown className="h-3 w-3" />
        </Button>

        {dropdownOpen && (
          <div className="absolute left-0 top-8 z-50 w-56 rounded-lg border bg-white shadow-lg py-1">
            {!showCreate ? (
              <>
                {/* Existing tags */}
                {availableTags.length > 0 && (
                  <div className="px-2 py-1">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Select tag</p>
                    {availableTags.map((tag) => (
                      <div
                        key={tag.id}
                        className="flex items-center justify-between group px-1 py-1 rounded hover:bg-slate-50 cursor-pointer"
                        onClick={() => addTag(tag.id)}
                      >
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                          style={{ backgroundColor: tag.color }}
                        >
                          {tag.name}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteGlobalTag(tag.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-500 transition-all"
                          title="Delete tag"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <div className="border-t my-1" />
                  </div>
                )}

                {availableTags.length === 0 && allTags.length > 0 && (
                  <p className="text-xs text-slate-400 px-3 py-2">All tags assigned.</p>
                )}

                {/* Create new */}
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
                  onClick={() => setShowCreate(true)}
                >
                  <TagIcon className="h-3.5 w-3.5" />
                  Create new tag
                </button>
              </>
            ) : (
              <div className="px-3 py-2 space-y-2">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">New tag</p>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Tag name"
                  className="h-7 text-xs"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreate() } }}
                  autoFocus
                />
                <div className="flex flex-wrap gap-1">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 flex-shrink-0"
                      style={{ backgroundColor: c, borderColor: newColor === c ? "#1e293b" : "transparent" }}
                    />
                  ))}
                </div>
                {createError && <p className="text-xs text-red-600">{createError}</p>}
                <div className="flex gap-1">
                  <Button type="button" size="sm" className="h-6 text-xs flex-1" onClick={handleCreate} disabled={isPending}>
                    Create
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setShowCreate(false); setNewName(""); setCreateError(null) }}>
                    Back
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
