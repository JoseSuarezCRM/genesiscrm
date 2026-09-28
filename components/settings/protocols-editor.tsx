"use client"

/**
 * Rehabilitation protocols: groups of PDFs, one group per body area.
 *
 * These are the surgeon's own post-operative instructions. Handing a patient
 * another surgeon's protocol is a clinical error rather than a marketing one,
 * which is why they sit on the record and never fall back to anything.
 *
 * ── Why a link and not an upload ──────────────────────────────────────────────
 *
 * Every protocol on the record today is an absolute link to a PDF already
 * hosted on the practice's own site, which is also where they are revised. The
 * media library would be the obvious alternative, but it accepts images only,
 * and widening a publicly-served store to take arbitrary PDFs is a decision
 * about what staff might upload into it, not a field type. So: a link.
 */

import * as React from "react"
import { CollectionEditor } from "@/components/settings/collection-editor"
import { Field, Input, RowList } from "@/components/settings/editor-fields"
import type { SurgeonProtocolGroup } from "@/lib/surgeon-site"

export function ProtocolsEditor(props: {
  groups: SurgeonProtocolGroup[]
  onChange: (groups: SurgeonProtocolGroup[]) => void
}) {
  const total = props.groups.reduce((n, g) => n + g.items.length, 0)

  return (
    <div className="space-y-4">
      <p className="text-pretty text-sm text-zinc-500">
        {total === 0
          ? "No protocols. The page stays out of the menu until there is at least one."
          : `${total} protocol${total === 1 ? "" : "s"} across ${props.groups.length} group${props.groups.length === 1 ? "" : "s"}.`}
      </p>

      <CollectionEditor
        items={props.groups}
        onChange={props.onChange}
        blank={() => ({ group: "", items: [] })}
        itemLabel="group"
        reorderable
        emptyHint="No protocol groups yet. A group is a heading — Shoulder, Knee — with its PDFs under it."
        summary={(g) => ({
          title: g.group,
          detail: `${g.items.length} protocol${g.items.length === 1 ? "" : "s"}`,
        })}
        form={(g, update) => (
          <>
            <Field label="Group heading" hint='The body area, as the page prints it: "Shoulder".'>
              <Input value={g.group} onChange={(v) => update({ ...g, group: v })} />
            </Field>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                Protocols
              </p>
              <RowList
                rows={g.items}
                onChange={(items) => update({ ...g, items })}
                blank={{ name: "", href: "" }}
                addLabel="Add a protocol"
                itemLabel="protocol"
                render={(row, set) => (
                  <>
                    <Input
                      value={row.name}
                      onChange={(v) => set({ ...row, name: v })}
                      placeholder="Rotator cuff repair"
                    />
                    <Input
                      value={row.href}
                      onChange={(v) => set({ ...row, href: v })}
                      placeholder="https://…/RC-Repair.pdf"
                    />
                  </>
                )}
              />
              <p className="mt-2 text-pretty text-xs text-zinc-400">
                Each row is a name and a link to the PDF. The link opens directly, so it must be
                one anyone can reach without signing in.
              </p>
            </div>
          </>
        )}
      />
    </div>
  )
}
