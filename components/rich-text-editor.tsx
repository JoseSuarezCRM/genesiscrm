"use client"

import { useRef, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import {
  Bold, Italic, Underline, List, ListOrdered, Link2, Heading2,
  Strikethrough, RemoveFormatting, Braces, ChevronDown, ChevronLeft, ChevronRight, Search,
} from "lucide-react"
import { cn } from "@/lib/utils"

// Dependency-free WYSIWYG editor. Outputs HTML via onChange.
// Uses the browser's built-in editing (execCommand) — universally supported.

export interface PersonalizationToken { label: string; value: string }
export interface TokenGroup { group: string; tokens: PersonalizationToken[] }

// Turn raw token strings (e.g. "{patient_first_name}", "{{firstName}}") into
// friendly { label, value } pairs for the Fields dropdown.
export function tokensFromStrings(raw: string[]): PersonalizationToken[] {
  return raw.map(v => {
    const label = v
      .replace(/[{}]/g, "")
      .replace(/[_-]/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .trim()
    return { label: label.charAt(0).toUpperCase() + label.slice(1), value: v }
  })
}

interface Props {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  className?: string
  minHeight?: number
  tokens?: PersonalizationToken[]
  tokenGroups?: TokenGroup[]
}

export function RichTextEditor({ value, onChange, placeholder = "Write your message…", className, minHeight = 160, tokens, tokenGroups }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const lastEmitted = useRef<string>(value)
  const [, force] = useState(0)
  const [tokenMenuOpen, setTokenMenuOpen] = useState(false)
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const fieldsBtnRef = useRef<HTMLButtonElement>(null)
  const savedRange = useRef<Range | null>(null)
  const [menuPos, setMenuPos] = useState<{ left: number; top?: number; bottom?: number; maxHeight: number }>({ left: 0, top: 0, maxHeight: 320 })

  function closeTokenMenu() { setTokenMenuOpen(false); setActiveGroup(null); setQuery("") }

  // Remember the caret so a token still lands in the right place after the search
  // box (or a menu click) steals focus from the editor.
  function saveSelection() {
    const el = ref.current
    const sel = window.getSelection()
    if (el && sel && sel.rangeCount && el.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      savedRange.current = sel.getRangeAt(0).cloneRange()
    }
  }
  function restoreSelection() {
    const el = ref.current
    if (!el) return
    el.focus()
    const sel = window.getSelection()
    if (sel && savedRange.current && el.contains(savedRange.current.commonAncestorContainer)) {
      sel.removeAllRanges(); sel.addRange(savedRange.current)
    }
  }

  function toggleTokenMenu() {
    if (tokenMenuOpen) { closeTokenMenu(); return }
    saveSelection()
    const r = fieldsBtnRef.current?.getBoundingClientRect()
    if (r) {
      const below = window.innerHeight - r.bottom
      const above = r.top
      const openUp = below < 260 && above > below
      setMenuPos(openUp
        ? { left: r.left, bottom: window.innerHeight - r.top + 4, maxHeight: above - 16 }
        : { left: r.left, top: r.bottom + 4, maxHeight: below - 16 })
    }
    setActiveGroup(null)
    setTokenMenuOpen(true)
  }

  // Sync external value into the editor without clobbering the caret while typing.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (value !== lastEmitted.current && value !== el.innerHTML) {
      el.innerHTML = value || ""
      lastEmitted.current = value
    }
  }, [value])

  // Initial content
  useEffect(() => {
    const el = ref.current
    if (el && !el.innerHTML && value) {
      el.innerHTML = value
      lastEmitted.current = value
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function emit() {
    const el = ref.current
    if (!el) return
    const html = el.innerHTML
    lastEmitted.current = html
    onChange(html)
    force(n => n + 1) // refresh active-state highlighting
  }

  function exec(command: string, arg?: string) {
    ref.current?.focus()
    document.execCommand(command, false, arg)
    emit()
  }

  function addLink() {
    const url = window.prompt("Link URL:", "https://")
    if (url) exec("createLink", url)
  }

  function insertToken(token: string) {
    restoreSelection()
    document.execCommand("insertText", false, token)
    emit()
    closeTokenMenu()
  }

  const isActive = (cmd: string) => {
    try { return document.queryCommandState(cmd) } catch { return false }
  }

  const isEmpty = !value || value === "<br>" || value.replace(/<[^>]*>/g, "").trim() === ""

  const Btn = ({ onClick, active, title, children }: {
    onClick: () => void; active?: boolean; title: string; children: React.ReactNode
  }) => (
    <button
      type="button"
      title={title}
      onMouseDown={e => { e.preventDefault(); onClick() }}
      className={cn(
        "h-7 w-7 flex items-center justify-center rounded-md transition-colors",
        active ? "bg-zinc-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      )}
    >
      {children}
    </button>
  )

  return (
    <div className={cn("border border-slate-200 rounded-lg overflow-hidden bg-white", className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-slate-100 bg-slate-50/60 flex-wrap">
        <Btn title="Bold" active={isActive("bold")} onClick={() => exec("bold")}><Bold className="h-3.5 w-3.5" /></Btn>
        <Btn title="Italic" active={isActive("italic")} onClick={() => exec("italic")}><Italic className="h-3.5 w-3.5" /></Btn>
        <Btn title="Underline" active={isActive("underline")} onClick={() => exec("underline")}><Underline className="h-3.5 w-3.5" /></Btn>
        <Btn title="Strikethrough" active={isActive("strikeThrough")} onClick={() => exec("strikeThrough")}><Strikethrough className="h-3.5 w-3.5" /></Btn>
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <Btn title="Heading" onClick={() => exec("formatBlock", "<h2>")}><Heading2 className="h-3.5 w-3.5" /></Btn>
        <Btn title="Bullet list" onClick={() => exec("insertUnorderedList")}><List className="h-3.5 w-3.5" /></Btn>
        <Btn title="Numbered list" onClick={() => exec("insertOrderedList")}><ListOrdered className="h-3.5 w-3.5" /></Btn>
        <Btn title="Link" onClick={addLink}><Link2 className="h-3.5 w-3.5" /></Btn>
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <Btn title="Clear formatting" onClick={() => exec("removeFormat")}><RemoveFormatting className="h-3.5 w-3.5" /></Btn>

        {(() => {
          const groups: TokenGroup[] = tokenGroups && tokenGroups.length > 0
            ? tokenGroups
            : (tokens && tokens.length > 0 ? [{ group: "", tokens }] : [])
          if (groups.length === 0) return null
          return (
            <>
              <div className="w-px h-5 bg-slate-200 mx-1" />
              <button
                ref={fieldsBtnRef}
                type="button"
                title="Insert personalization field"
                onMouseDown={e => { e.preventDefault(); toggleTokenMenu() }}
                className={cn(
                  "h-7 px-1.5 flex items-center gap-1 rounded-md text-xs font-medium transition-colors",
                  tokenMenuOpen ? "bg-zinc-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                )}
              >
                <Braces className="h-3.5 w-3.5" />
                Fields
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
              {tokenMenuOpen && typeof document !== "undefined" && createPortal((() => {
                // Single unnamed group (flat tokens) → show tokens directly.
                const flat = groups.length === 1 && !groups[0].group
                const current = groups.find(g => g.group === activeGroup)
                const q = query.trim().toLowerCase()
                // Searching flattens everything into one filtered list across all groups.
                const searchHits = q
                  ? groups.flatMap(g => g.tokens
                      .filter(t => t.label.toLowerCase().includes(q) || t.value.toLowerCase().includes(q))
                      .map(t => ({ ...t, group: g.group })))
                  : []
                const TokenRow = (t: { label: string; value: string; group?: string }) => (
                  <button
                    key={t.value}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); e.stopPropagation(); insertToken(t.value) }}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center justify-between gap-2"
                  >
                    <span className="text-sm text-slate-700 truncate">
                      {t.label}{t.group ? <span className="text-slate-400"> · {t.group}</span> : null}
                    </span>
                    <span className="text-xs text-slate-400 font-mono truncate">{t.value}</span>
                  </button>
                )
                return (
                  <>
                    {/* Transparent backdrop closes the menu on any outside click */}
                    <div className="fixed inset-0 z-[998]" onMouseDown={e => { e.preventDefault(); closeTokenMenu() }} />
                    <div
                      className="fixed z-[999] w-64 flex flex-col bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
                      style={{ left: menuPos.left, top: menuPos.top, bottom: menuPos.bottom, maxHeight: menuPos.maxHeight }}
                    >
                      <div className="p-1.5 border-b border-slate-100">
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50">
                          <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <input
                            autoFocus
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onMouseDown={e => e.stopPropagation()}
                            placeholder="Search fields…"
                            className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none"
                          />
                        </div>
                      </div>
                      <div className="overflow-y-auto py-1">
                        {q ? (
                          searchHits.length > 0 ? searchHits.map(TokenRow)
                            : <p className="px-3 py-3 text-xs text-slate-400 text-center">No fields match “{query}”.</p>
                        ) : flat || current ? (
                          <>
                            {!flat && (
                              <button
                                type="button"
                                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setActiveGroup(null) }}
                                className="w-full text-left px-3 py-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 border-b border-slate-100 mb-1 sticky top-0 bg-white"
                              >
                                <ChevronLeft className="h-3.5 w-3.5" /> {current!.group}
                              </button>
                            )}
                            {(flat ? groups[0].tokens : current!.tokens).map(TokenRow)}
                          </>
                        ) : (
                          groups.map(g => (
                            <button
                              key={g.group}
                              type="button"
                              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setActiveGroup(g.group) }}
                              className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between gap-2"
                            >
                              <span className="text-sm font-medium text-slate-700">{g.group}</span>
                              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )
              })(), document.body)}
            </>
          )
        })()}
      </div>

      {/* Editable area */}
      <div className="relative">
        {isEmpty && (
          <div className="absolute top-3 left-3 text-sm text-slate-400 pointer-events-none select-none">
            {placeholder}
          </div>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onBlur={emit}
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
          style={{ minHeight }}
          className="rte-content px-3 py-3 text-sm text-slate-800 outline-none overflow-y-auto max-h-[400px] [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h2]:text-base [&_h2]:font-semibold [&_a]:text-blue-600 [&_a]:underline"
        />
      </div>
    </div>
  )
}
