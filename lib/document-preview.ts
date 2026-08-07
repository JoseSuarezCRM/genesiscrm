// Pure HTML preview of document blocks — for the builder canvas only (the actual
// PDF is rendered by lib/document-pdf.tsx). Mirrors the letter look (serif font).

import type { DocBlock, ColumnChild, Align } from "@/lib/document-blocks"

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const alignOf = (a?: Align) => a ?? "left"

// Per-block spacing CSS mirroring the PDF renderer's spacingStyle().
function pad(b: ColumnChild): string {
  const p = [b.padTop, b.padRight, b.padBottom, b.padLeft].map((v) => `${v ?? 0}px`).join(" ")
  return `padding:${p};`
}

function leaf(b: ColumnChild): string {
  const after = (d: number) => `margin:0 0 ${b.spaceAfter ?? d}px;`
  switch (b.type) {
    case "text":
      return `<div style="font-family:'Times New Roman',Georgia,serif;font-size:12pt;line-height:${b.lineHeight ?? 1.4};color:#1a1a1a;text-align:${alignOf(b.align)};${after(8)}${pad(b)}">${b.html || '<span style="color:#cbd5e1;">Text…</span>'}</div>`
    case "image":
      if (!b.url) return `<div style="text-align:${alignOf(b.align)};${after(8)}${pad(b)}color:#cbd5e1;font-family:sans-serif;font-size:12px;">Image</div>`
      return `<div style="text-align:${alignOf(b.align)};${after(6)}${pad(b)}"><img src="${esc(b.url)}" width="${b.width ?? 160}" style="display:inline-block;max-width:100%;height:auto;" /></div>`
    case "divider":
      return `<div style="border-top:${b.thickness ?? 1}px solid #cbd5e1;margin:10px 0;"></div>`
    case "spacer":
      return `<div style="height:${b.height ?? 16}px;"></div>`
  }
}

export function renderDocBlockPreview(b: DocBlock): string {
  if (b.type === "columns") {
    const cols = b.columns.length || 1
    const cells = b.columns.map((col, i) =>
      `<td valign="top" width="${Math.floor(100 / cols)}%" style="padding:0 ${i < cols - 1 ? "8" : "0"}px 0 ${i > 0 ? "8" : "0"}px;vertical-align:top;">${col.map(leaf).join("") || '<div style="color:#cbd5e1;font-family:sans-serif;font-size:11px;">Empty</div>'}</td>`
    ).join("")
    return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 8px;"><tr>${cells}</tr></table>`
  }
  return leaf(b as ColumnChild)
}
