// Pure (isomorphic) renderer: email blocks → email-safe inner HTML. No server
// imports, so the builder previews live on the client and the save action renders
// the same HTML on the server. Tokens are left literal ({patient_name}) and
// resolve downstream at send time.

import type { EmailBlock, ColumnChild, Align } from "@/lib/email-blocks"

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const alignOf = (a?: Align) => a ?? "left"

function leaf(b: ColumnChild): string {
  switch (b.type) {
    case "text":
      return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1e293b;text-align:${alignOf(b.align)};margin:0 0 8px;">${b.html ?? ""}</div>`
    case "image": {
      if (!b.url) return ""
      const img = `<img src="${esc(b.url)}" width="${b.width ?? 560}" style="display:inline-block;max-width:100%;height:auto;border:0;" alt="" />`
      const inner = b.href ? `<a href="${esc(b.href)}" target="_blank" style="text-decoration:none;">${img}</a>` : img
      return `<div style="text-align:${alignOf(b.align)};margin:0 0 8px;">${inner}</div>`
    }
    case "button":
      return `<div style="text-align:${alignOf(b.align)};margin:8px 0;"><a href="${esc(b.url || "#")}" target="_blank" style="display:inline-block;padding:11px 24px;background:${esc(b.bg || "#2563eb")};color:${esc(b.color || "#ffffff")};border-radius:6px;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-weight:600;font-size:14px;">${esc(b.label || "Button")}</a></div>`
    case "divider":
      return `<div style="border-top:${b.thickness ?? 1}px solid ${esc(b.color || "#e2e8f0")};margin:12px 0;"></div>`
    case "spacer":
      return `<div style="height:${b.height ?? 20}px;line-height:${b.height ?? 20}px;font-size:1px;">&nbsp;</div>`
    case "html":
      return b.html ?? ""
  }
}

function block(b: EmailBlock): string {
  if (b.type === "columns") {
    const cols = b.columns.length || 1
    const cells = b.columns.map((col, i) =>
      `<td valign="top" width="${Math.floor(100 / cols)}%" style="padding:0 ${i < cols - 1 ? "10" : "0"}px 0 ${i > 0 ? "10" : "0"}px;vertical-align:top;">${col.map(leaf).join("")}</td>`
    ).join("")
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 8px;"><tr>${cells}</tr></table>`
  }
  return leaf(b as ColumnChild)
}

// The inner HTML for a template body (no outer container — send paths wrap it).
export function renderEmailHtml(blocks: EmailBlock[]): string {
  return (blocks ?? []).map(block).join("\n")
}

// A 600px centered shell — used for the builder preview only.
export function emailShell(inner: string): string {
  return `<div style="background:#f1f5f9;padding:16px;"><div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;padding:24px;color:#1e293b;">${inner}</div></div>`
}
