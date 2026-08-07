// The block model for PDF document templates. An ordered list of typed blocks;
// text blocks carry token-bearing HTML resolved per record at generation time.
// Shared by the builder UI and the react-pdf renderer.

export type BlockRegion = "header" | "body" | "footer"
export type Align = "left" | "center" | "right"

// Optional per-block spacing controls (HubSpot-style). All in pt/px; omitted =
// sensible defaults. `lineHeight` is a multiplier (e.g. 1.4). `spaceAfter` is the
// gap below the block. pad* are inner padding on each side.
export interface BlockSpacing { lineHeight?: number; spaceAfter?: number; padTop?: number; padBottom?: number; padLeft?: number; padRight?: number }

export interface TextBlock extends BlockSpacing { id: string; type: "text"; region: BlockRegion; html: string; align?: Align; fontSize?: number }
export interface ImageBlock extends BlockSpacing { id: string; type: "image"; region: BlockRegion; url?: string; width?: number; align?: Align }
export interface DividerBlock extends BlockSpacing { id: string; type: "divider"; region: BlockRegion; thickness?: number }
export interface SpacerBlock extends BlockSpacing { id: string; type: "spacer"; region: BlockRegion; height?: number }
// A column's contents are a small stack of leaf blocks (text/image/divider/spacer).
export type ColumnChild = TextBlock | ImageBlock | DividerBlock | SpacerBlock
export interface ColumnsBlock { id: string; type: "columns"; region: BlockRegion; columns: ColumnChild[][]; widths?: number[] }

export type DocBlock = TextBlock | ImageBlock | DividerBlock | SpacerBlock | ColumnsBlock
export type BlockType = DocBlock["type"]

export const BLOCK_TYPES: { type: BlockType; label: string }[] = [
  { type: "text", label: "Text" },
  { type: "image", label: "Image" },
  { type: "columns", label: "Columns" },
  { type: "divider", label: "Divider" },
  { type: "spacer", label: "Spacer" },
]

let n = 0
export function newBlockId(): string {
  return `b_${Date.now().toString(36)}_${(n++).toString(36)}`
}

export function makeBlock(type: BlockType, region: BlockRegion = "body"): DocBlock {
  const id = newBlockId()
  switch (type) {
    case "text": return { id, type, region, html: "", align: "left" }
    case "image": return { id, type, region, width: 160, align: "left" }
    case "divider": return { id, type, region, thickness: 1 }
    case "spacer": return { id, type, region, height: 16 }
    case "columns": return { id, type, region, columns: [[], []] }
  }
}

export function asBlocks(v: unknown): DocBlock[] {
  return Array.isArray(v) ? (v as DocBlock[]) : []
}
