// Block model for the email-template builder. Blocks render to email-safe HTML
// (see lib/email-html.ts). Tokens inside text/button blocks resolve downstream.

export type Align = "left" | "center" | "right"

export interface TextBlock { id: string; type: "text"; html: string; align?: Align }
export interface ImageBlock { id: string; type: "image"; url?: string; width?: number; align?: Align; href?: string }
export interface ButtonBlock { id: string; type: "button"; label: string; url: string; bg?: string; color?: string; align?: Align }
export interface DividerBlock { id: string; type: "divider"; thickness?: number; color?: string }
export interface SpacerBlock { id: string; type: "spacer"; height?: number }
export interface HtmlBlock { id: string; type: "html"; html: string }
export type ColumnChild = TextBlock | ImageBlock | ButtonBlock | DividerBlock | SpacerBlock | HtmlBlock
export interface ColumnsBlock { id: string; type: "columns"; columns: ColumnChild[][] }

export type EmailBlock = TextBlock | ImageBlock | ButtonBlock | DividerBlock | SpacerBlock | HtmlBlock | ColumnsBlock
export type EmailBlockType = EmailBlock["type"]

export const EMAIL_BLOCK_TYPES: { type: EmailBlockType; label: string }[] = [
  { type: "text", label: "Text" },
  { type: "image", label: "Image" },
  { type: "button", label: "Button" },
  { type: "columns", label: "Columns" },
  { type: "divider", label: "Divider" },
  { type: "spacer", label: "Spacer" },
  { type: "html", label: "HTML" },
]

let n = 0
export function newBlockId(): string {
  return `e_${Date.now().toString(36)}_${(n++).toString(36)}`
}

export function makeEmailBlock(type: EmailBlockType): EmailBlock {
  const id = newBlockId()
  switch (type) {
    case "text": return { id, type, html: "", align: "left" }
    case "image": return { id, type, width: 560, align: "center" }
    case "button": return { id, type, label: "Click here", url: "https://", bg: "#2563eb", color: "#ffffff", align: "left" }
    case "divider": return { id, type, thickness: 1, color: "#e2e8f0" }
    case "spacer": return { id, type, height: 20 }
    case "html": return { id, type, html: "" }
    case "columns": return { id, type, columns: [[], []] }
  }
}

export function asEmailBlocks(v: unknown): EmailBlock[] {
  return Array.isArray(v) ? (v as EmailBlock[]) : []
}
