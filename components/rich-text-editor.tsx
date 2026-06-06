"use client"

import { useRef, useEffect, useState } from "react"
import {
  Bold, Italic, Underline, List, ListOrdered, Link2, Heading2,
  Strikethrough, RemoveFormatting,
} from "lucide-react"
import { cn } from "@/lib/utils"

// Dependency-free WYSIWYG editor. Outputs HTML via onChange.
// Uses the browser's built-in editing (execCommand) — universally supported.

interface Props {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  className?: string
  minHeight?: number
}

export function RichTextEditor({ value, onChange, placeholder = "Write your message…", className, minHeight = 160 }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const lastEmitted = useRef<string>(value)
  const [, force] = useState(0)

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
          style={{ minHeight }}
          className="rte-content px-3 py-3 text-sm text-slate-800 outline-none overflow-y-auto max-h-[400px] [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h2]:text-base [&_h2]:font-semibold [&_a]:text-blue-600 [&_a]:underline"
        />
      </div>
    </div>
  )
}
