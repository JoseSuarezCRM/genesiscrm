"use client"

/**
 * The practice every surgeon site shares.
 *
 * One edit here changes every site, which is the point — the office roster, the
 * insurance list and the medical-legal contacts are the organisation's, not any
 * one surgeon's. Before this they were hardcoded in the site app, so adding an
 * insurance plan or correcting an address needed a developer.
 *
 * Same shell as the surgeon editor, deliberately: two settings screens that
 * behave differently is a worse outcome than either of them being slightly
 * imperfect.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Save, CircleAlert, CircleCheck } from "lucide-react"
import { updatePractice } from "@/app/actions/practice"
import { practiceGaps, type PracticeContent } from "@/lib/practice"
import { EditorShell, type EditorSection } from "@/components/settings/editor-shell"
import { CollectionEditor } from "@/components/settings/collection-editor"
import { Field, Grid, Input, StringList, Textarea } from "@/components/settings/editor-fields"

export function PracticeEditor({ initial }: { initial: PracticeContent }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [content, setContent] = useState<PracticeContent>(initial)
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Recomputed as they type, with the same function the server would use.
  const gaps = practiceGaps(content)

  function set<K extends keyof PracticeContent>(key: K, value: PracticeContent[K]) {
    setContent((c) => ({ ...c, [key]: value }))
    setSaved(false)
  }

  function save() {
    setErr(null)
    startTransition(async () => {
      try {
        await updatePractice(content)
        setSaved(true)
        router.refresh()
      } catch (e: any) {
        setErr(e?.message ?? "Could not save")
      }
    })
  }

  const sections: EditorSection[] = [
    {
      id: "identity",
      label: "Practice",
      hint: "The name and number every site shows.",
      needsAttention: gaps.some((g) => g.includes("name") || g.includes("phone")),
      panel: (
        <Grid>
          <Field label="Practice name" hint="Shown wherever a site names the group.">
            <Input value={content.name} onChange={(v) => set("name", v)} placeholder="Genesis Orthopedics & Sports Medicine" />
          </Field>
          <Field label="Practice website">
            <Input value={content.url} onChange={(v) => set("url", v)} placeholder="https://genesisortho.com/" />
          </Field>
          <Field label="Appointment phone" hint="As displayed to patients.">
            <Input value={content.phone} onChange={(v) => set("phone", v)} placeholder="(877) 377-1188" />
          </Field>
          <Field label="Appointment phone (dialable)" hint="International format, used by search engines.">
            <Input value={content.phoneE164} onChange={(v) => set("phoneE164", v)} placeholder="+1-877-377-1188" />
          </Field>
        </Grid>
      ),
    },
    {
      id: "offices",
      label: "Offices",
      hint: "Every office the practice runs.",
      badge: String(content.offices.length),
      needsAttention: gaps.some((g) => g.includes("office")),
      panel: (
        <>
          <p className="mb-4 text-pretty text-sm text-zinc-500">
            The whole roster, including offices no surgeon on these sites attends. Each site lists
            the ones its own surgeon does <strong className="font-medium">not</strong> work at, under
            a heading that says so. Which offices a surgeon <em>does</em> work at is set on their own
            record, under Clinics.
          </p>
          <CollectionEditor
            items={content.offices}
            onChange={(offices) => set("offices", offices)}
            blank={() => ({ name: "", lines: [] })}
            itemLabel="office"
            reorderable
            emptyHint="No offices yet. The contact page's roster will be empty."
            summary={(o) => ({ title: o.name, detail: o.lines.join(", ") })}
            form={(o, update) => (
              <>
                <Field label="Office name" hint='As the site prints it, e.g. "Oak Brook".'>
                  <Input value={o.name} onChange={(v) => update({ ...o, name: v })} />
                </Field>
                <Field label="Address lines" hint="One line per box, in display order.">
                  <StringList
                    values={o.lines}
                    onChange={(lines) => update({ ...o, lines })}
                    placeholder="2425 W. 22nd St."
                    addLabel="Add a line"
                    itemLabel="address line"
                  />
                </Field>
              </>
            )}
          />
        </>
      ),
    },
    {
      id: "hours",
      label: "Opening hours",
      hint: "Shared across the practice's offices.",
      badge: String(content.hours.length),
      needsAttention: gaps.some((g) => g.includes("hours")),
      panel: (
        <CollectionEditor
          items={content.hours}
          onChange={(hours) => set("hours", hours)}
          blank={() => ({ day: "", time: "" })}
          itemLabel="day"
          reorderable
          emptyHint="No hours set. Pages that show opening times will omit them."
          summary={(h) => ({ title: h.day, detail: h.time })}
          form={(h, update) => (
            <Grid>
              <Field label="Day">
                <Input value={h.day} onChange={(v) => update({ ...h, day: v })} placeholder="Monday" />
              </Field>
              <Field label="Hours" hint='As displayed, or "Closed".'>
                <Input value={h.time} onChange={(v) => update({ ...h, time: v })} placeholder="8:00am – 5:30pm" />
              </Field>
            </Grid>
          )}
        />
      ),
    },
    {
      id: "insurance",
      label: "Insurance",
      hint: "The plans accepted and the networks joined.",
      badge: String(content.insuranceCategories.reduce((n, c) => n + c.plans.length, 0)),
      needsAttention: gaps.some((g) => g.includes("Insurance")),
      panel: (
        <>
          <CollectionEditor
            items={content.insuranceCategories}
            onChange={(insuranceCategories) => set("insuranceCategories", insuranceCategories)}
            blank={() => ({ title: "", plans: [] })}
            itemLabel="category"
            reorderable
            emptyHint="No plans listed. The Insurances page will be empty on every site."
            summary={(c) => ({
              title: c.title,
              detail: `${c.plans.length} plan${c.plans.length === 1 ? "" : "s"}`,
            })}
            form={(c, update) => (
              <>
                <Field label="Category">
                  <Input
                    value={c.title}
                    onChange={(v) => update({ ...c, title: v })}
                    placeholder="Medicare & Medicare Advantage"
                  />
                </Field>
                <Field label="Plans" hint="One per box.">
                  <StringList
                    values={c.plans}
                    onChange={(plans) => update({ ...c, plans })}
                    placeholder="BCBS Medicare Advantage"
                    addLabel="Add a plan"
                    itemLabel="plan"
                  />
                </Field>
              </>
            )}
          />
          <p className="mb-3 mt-8 text-sm font-medium text-zinc-900">Network affiliations</p>
          <StringList
            values={content.networkAffiliations}
            onChange={(v) => set("networkAffiliations", v)}
            placeholder="Blue Cross Blue Shield PPO network"
            addLabel="Add a network"
            itemLabel="network"
          />
        </>
      ),
    },
    {
      id: "medical-legal",
      label: "Medical-legal",
      hint: "Who handles enquiries, and where they are scheduled.",
      needsAttention: gaps.some((g) => g.includes("Medical-legal")),
      panel: (
        <>
          <p className="mb-4 text-pretty text-sm text-zinc-500">
            Shared by every surgeon offering expert-witness work. Where a surgeon examines patients
            comes from their own clinics, not from here.
          </p>
          <Grid>
            <Field label="Enquiry email">
              <Input
                value={content.medicalLegal.inquiryEmail}
                onChange={(v) => set("medicalLegal", { ...content.medicalLegal, inquiryEmail: v })}
              />
            </Field>
            <Field label="Enquiry contact" hint="Named on the page, so attorneys know who to ask for.">
              <Input
                value={content.medicalLegal.inquiryContact}
                onChange={(v) => set("medicalLegal", { ...content.medicalLegal, inquiryContact: v })}
              />
            </Field>
            <Field label="IME scheduling link" wide>
              <Input
                value={content.medicalLegal.imeSchedulingUrl}
                onChange={(v) => set("medicalLegal", { ...content.medicalLegal, imeSchedulingUrl: v })}
              />
            </Field>
            <Field label="Deposition scheduling link" wide>
              <Input
                value={content.medicalLegal.depositionSchedulingUrl}
                onChange={(v) =>
                  set("medicalLegal", { ...content.medicalLegal, depositionSchedulingUrl: v })
                }
              />
            </Field>
            <Field label="Report turnaround" hint="As displayed to attorneys.">
              <Input
                value={content.medicalLegal.turnaround}
                onChange={(v) => set("medicalLegal", { ...content.medicalLegal, turnaround: v })}
                placeholder="3–7 business days"
              />
            </Field>
            <Field label="Licensure" hint="The state named on the medical-legal pages.">
              <Input
                value={content.medicalLegal.licensure}
                onChange={(v) => set("medicalLegal", { ...content.medicalLegal, licensure: v })}
                placeholder="Illinois"
              />
            </Field>
          </Grid>
        </>
      ),
    },
  ]

  return (
    <EditorShell
      title="Practice"
      subtitle="Shared by every surgeon website. Changes reach the sites when a site is next published."
      sections={sections}
      actions={
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-40"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save
        </button>
      }
      notices={
        <>
          {err && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <span className="text-pretty">{err}</span>
            </div>
          )}
          {saved && !err && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CircleCheck className="size-4" /> Saved.
            </div>
          )}
          {/*
            Advisory, not a gate. Unlike a surgeon's credentials, a thin practice
            record leaves a page short rather than making a false claim about a
            person — so it is worth saying, not worth blocking on.
          */}
          {gaps.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-900">
                The sites will be missing:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-amber-800">
                {gaps.map((g) => (
                  <li key={g} className="flex items-start gap-2 text-pretty">
                    <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-amber-500" />
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      }
    />
  )
}
