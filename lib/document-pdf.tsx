// Renders a DocumentTemplate (block model) to a PDF Buffer with react-pdf.
// Text-block HTML (from RichTextEditor) is converted to react-pdf Text nodes;
// tokens are resolved per record before rendering. Server-only.

import React from "react"
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer"
import { parse, type HTMLElement as ParsedEl, type Node as ParsedNode } from "node-html-parser"
import { prisma } from "@/lib/prisma"
import { buildRecordTokenVars } from "@/lib/record-token-vars"
import { resolveMessageTokens } from "@/lib/message-tokens"
import { asBlocks, type DocBlock, type ColumnChild, type Align } from "@/lib/document-blocks"

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 64, paddingHorizontal: 54, fontFamily: "Times-Roman", fontSize: 11, color: "#1a1a1a", lineHeight: 1.4 },
  para: { marginBottom: 8 },
  li: { flexDirection: "row", marginBottom: 2 },
  bullet: { width: 14 },
  headerRegion: { position: "absolute", top: 24, left: 54, right: 54 },
  footerRegion: { position: "absolute", bottom: 24, left: 54, right: 54 },
})

// ── HTML (editor output) → react-pdf Text nodes ─────────────────────────────
interface Inherited { bold?: boolean; italic?: boolean; underline?: boolean }

function inlineChildren(node: ParsedNode, inh: Inherited, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const kids = (node as ParsedEl).childNodes ?? []
  kids.forEach((child, i) => {
    const key = `${keyBase}.${i}`
    if (child.nodeType === 3) { // text
      const t = (child as any).rawText ? decode((child as any).rawText) : (child as any).text
      if (t) out.push(t)
      return
    }
    const el = child as ParsedEl
    const tag = (el.tagName || "").toLowerCase()
    if (tag === "br") { out.push("\n"); return }
    const next: Inherited = {
      bold: inh.bold || tag === "b" || tag === "strong",
      italic: inh.italic || tag === "i" || tag === "em",
      underline: inh.underline || tag === "u",
    }
    const style: any = {}
    if (next.bold) style.fontFamily = next.italic ? "Times-BoldItalic" : "Times-Bold"
    else if (next.italic) style.fontFamily = "Times-Italic"
    if (next.underline) style.textDecoration = "underline"
    if (tag === "a") style.color = "#1d4ed8"
    out.push(<Text key={key} style={style}>{inlineChildren(el, next, key)}</Text>)
  })
  return out
}

function decode(s: string): string {
  return s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#3?9;|&apos;/g, "'")
}

function blockAlign(a?: Align): any { return a && a !== "left" ? { textAlign: a } : {} }

// Convert a text block's HTML into an array of react-pdf elements.
function htmlToNodes(html: string, align: Align | undefined, fontSize: number | undefined, keyBase: string): React.ReactNode[] {
  const root = parse(html || "", { lowerCaseTagName: true })
  const nodes: React.ReactNode[] = []
  const base: any = { ...styles.para, ...blockAlign(align), ...(fontSize ? { fontSize } : {}) }

  const walk = (parent: ParsedEl) => {
    const children = parent.childNodes ?? []
    children.forEach((child, i) => {
      const key = `${keyBase}.${i}`
      if (child.nodeType === 3) { const t = (child as any).text?.trim(); if (t) nodes.push(<Text key={key} style={base}>{decode((child as any).text)}</Text>); return }
      const el = child as ParsedEl
      const tag = (el.tagName || "").toLowerCase()
      if (tag === "ul" || tag === "ol") {
        ;(el.childNodes ?? []).forEach((li, j) => {
          if ((li as ParsedEl).tagName?.toLowerCase() !== "li") return
          const bullet = tag === "ol" ? `${j + 1}.` : "•"
          nodes.push(
            <View key={`${key}.${j}`} style={styles.li}>
              <Text style={styles.bullet}>{bullet}</Text>
              <Text style={{ flex: 1, ...blockAlign(align), ...(fontSize ? { fontSize } : {}) }}>{inlineChildren(li as ParsedEl, {}, `${key}.${j}`)}</Text>
            </View>
          )
        })
      } else if (tag === "p" || tag === "div" || /^h[1-6]$/.test(tag)) {
        const hStyle = /^h[1-6]$/.test(tag) ? { fontFamily: "Times-Bold", fontSize: (fontSize ?? 11) + (tag === "h1" ? 7 : tag === "h2" ? 4 : 2) } : {}
        nodes.push(<Text key={key} style={{ ...base, ...hStyle }}>{inlineChildren(el, {}, key)}</Text>)
      } else if (tag === "br") {
        nodes.push(<Text key={key} style={base}> </Text>)
      } else {
        // stray inline at top level → wrap in a paragraph
        nodes.push(<Text key={key} style={base}>{inlineChildren({ childNodes: [el] } as any, {}, key)}</Text>)
      }
    })
  }
  walk(root)
  if (!nodes.length && html) nodes.push(<Text key={keyBase} style={base}>{decode(html.replace(/<[^>]+>/g, ""))}</Text>)
  return nodes
}

// ── Blocks → react-pdf ──────────────────────────────────────────────────────
type ImageMap = Record<string, { data: Buffer; format: "png" | "jpg" }>

function renderLeaf(b: ColumnChild, images: ImageMap, key: string): React.ReactNode {
  if (b.type === "text") return <View key={key}>{htmlToNodes(b.html, b.align, b.fontSize, key)}</View>
  if (b.type === "image") { const img = b.url ? images[b.url] : undefined; return img ? <Image key={key} src={img} style={{ width: b.width ?? 160, alignSelf: b.align === "center" ? "center" : b.align === "right" ? "flex-end" : "flex-start", marginBottom: 6 }} /> : null }
  if (b.type === "divider") return <View key={key} style={{ borderBottomWidth: b.thickness ?? 1, borderBottomColor: "#cbd5e1", marginVertical: 8 }} />
  if (b.type === "spacer") return <View key={key} style={{ height: b.height ?? 16 }} />
  return null
}

function renderBlock(b: DocBlock, images: ImageMap, key: string): React.ReactNode {
  if (b.type === "columns") {
    return (
      <View key={key} style={{ flexDirection: "row", marginBottom: 8 }}>
        {b.columns.map((col, ci) => (
          <View key={`${key}.c${ci}`} style={{ flex: b.widths?.[ci] ?? 1, paddingRight: ci < b.columns.length - 1 ? 8 : 0 }}>
            {col.map((child, i) => renderLeaf(child, images, `${key}.c${ci}.${i}`))}
          </View>
        ))}
      </View>
    )
  }
  return renderLeaf(b as ColumnChild, images, key)
}

const PAGE_SIZES: Record<string, any> = { LETTER: "LETTER", A4: "A4", LEGAL: "LEGAL" }

export async function renderTemplatePdf(blocks: DocBlock[], images: ImageMap, pageSize = "LETTER"): Promise<Buffer> {
  const header = blocks.filter((b) => b.region === "header")
  const footer = blocks.filter((b) => b.region === "footer")
  const body = blocks.filter((b) => b.region === "body" || !b.region)
  const doc = (
    <Document>
      <Page size={PAGE_SIZES[pageSize] ?? "LETTER"} style={styles.page}>
        {header.length > 0 && <View fixed style={styles.headerRegion}>{header.map((b, i) => renderBlock(b, images, `h${i}`))}</View>}
        {footer.length > 0 && <View fixed style={styles.footerRegion}>{footer.map((b, i) => renderBlock(b, images, `f${i}`))}</View>}
        {body.map((b, i) => renderBlock(b, images, `b${i}`))}
      </Page>
    </Document>
  )
  return await renderToBuffer(doc)
}

// Collect every image url referenced by the blocks (including inside columns) and
// fetch their bytes for react-pdf.
export async function fetchImagesFor(blocks: DocBlock[]): Promise<ImageMap> {
  const urls = new Set<string>()
  const collect = (b: DocBlock) => {
    if (b.type === "image" && b.url) urls.add(b.url)
    else if (b.type === "columns") b.columns.forEach((col) => col.forEach((c) => collect(c as DocBlock)))
  }
  blocks.forEach(collect)
  const images: ImageMap = {}
  await Promise.all(Array.from(urls).map(async (u) => { const img = await fetchImage(u); if (img) images[u] = img }))
  return images
}

// Fetch an image URL (incl. private Blob) into bytes for react-pdf.
async function fetchImage(url: string): Promise<{ data: Buffer; format: "png" | "jpg" } | null> {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN
    const res = await fetch(url, token && url.includes("blob.vercel-storage") ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
    if (!res.ok) return null
    const data = Buffer.from(await res.arrayBuffer())
    const format: "png" | "jpg" = /\.jpe?g($|\?)/i.test(url) || res.headers.get("content-type")?.includes("jpeg") ? "jpg" : "png"
    return { data, format }
  } catch { return null }
}

// Resolve tokens + images for a record and render the template to a PDF Buffer.
export async function generateDocumentPdf(templateId: string, recordType: string, recordId: string): Promise<{ buffer: Buffer; filename: string } | { error: string }> {
  const tpl = await (prisma as any).documentTemplate.findUnique({ where: { id: templateId } })
  if (!tpl) return { error: "Template not found." }
  const blocks = asBlocks(tpl.blocks)
  const vars = await buildRecordTokenVars(recordType, recordId).catch(() => ({} as Record<string, string>))

  // Resolve tokens in every text block (including inside columns).
  const resolve = (b: DocBlock): DocBlock => {
    if (b.type === "text") return { ...b, html: resolveMessageTokens(b.html ?? "", vars) }
    if (b.type === "columns") return { ...b, columns: b.columns.map((col) => col.map((c) => resolve(c) as ColumnChild)) }
    return b
  }
  const resolved = blocks.map(resolve)
  const images = await fetchImagesFor(resolved)

  const buffer = await renderTemplatePdf(resolved, images, tpl.pageSize)
  const safe = String(tpl.name || "document").replace(/[^\w.\- ]+/g, "").trim() || "document"
  return { buffer, filename: `${safe}.pdf` }
}
