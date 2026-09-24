"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Loader2, Save, Globe, CircleAlert, CircleCheck, Plus, Trash2, ChevronDown, ChevronRight,
} from "lucide-react"
import {
  updateSurgeonSite, publishSurgeonSite, setSurgeonSiteStatus,
} from "@/app/actions/surgeon-sites"
import { missingCredentials, type SurgeonSiteContent, type SurgeonClinic } from "@/lib/surgeon-site"
import { SurgeonImageField } from "@/components/surgeon-site-image-field"
import { cn } from "@/lib/utils"

type Status = "DRAFT" | "PUBLISHED" | "REDIRECTED" | "RETIRED"

export function SurgeonSiteEditor(props: {
  id: string
  slug: string
  domain: string | null
  status: Status
  redirectUrl: string | null
  publishedAt: string | null
  content: SurgeonSiteContent
  missing: string[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [content, setContent] = useState<SurgeonSiteContent>(props.content)
  const [domain, setDomain] = useState(props.domain ?? "")
  const [redirectUrl, setRedirectUrl] = useState(props.redirectUrl ?? "")
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [open, setOpen] = useState<string>("identity")

  // Recomputed as they type, using the same function the server publishes with,
  // so the checklist can never disagree with what publishing actually allows.
  const missing = missingCredentials(content, domain || null)

  function set<K extends keyof SurgeonSiteContent>(key: K, value: SurgeonSiteContent[K]) {
    setContent((c) => ({ ...c, [key]: value }))
    setSaved(false)
  }

  function save(then?: () => void) {
    setErr(null)
    startTransition(async () => {
      try {
        await updateSurgeonSite(props.id, { domain, redirectUrl, content })
        setSaved(true)
        then?.()
        router.refresh()
      } catch (e: any) {
        setErr(e?.message ?? "Could not save")
      }
    })
  }

  function publish() {
    setErr(null)
    startTransition(async () => {
      try {
        // Save first: publishing snapshots what is stored, not what is on screen.
        await updateSurgeonSite(props.id, { domain, redirectUrl, content })
        await publishSurgeonSite(props.id)
        setSaved(true)
        router.refresh()
      } catch (e: any) {
        setErr(e?.message ?? "Could not publish")
      }
    })
  }

  function changeStatus(status: Status) {
    setErr(null)
    startTransition(async () => {
      try {
        await updateSurgeonSite(props.id, { domain, redirectUrl, content })
        await setSurgeonSiteStatus(props.id, status)
        router.refresh()
      } catch (e: any) {
        setErr(e?.message ?? "Could not change status")
      }
    })
  }

  return (
    <div className="mt-4 space-y-5 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            {content.name || "New surgeon website"}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {props.publishedAt
              ? `Last published ${new Date(props.publishedAt).toLocaleString()}`
              : "Never published — nothing is live yet"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => save()}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-40"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save draft
          </button>
          <button
            onClick={publish}
            disabled={pending || missing.length > 0}
            title={missing.length > 0 ? "Fill in the remaining details first" : "Make this live"}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-40"
          >
            <Globe className="h-4 w-4" />
            {props.status === "PUBLISHED" ? "Publish changes" : "Publish"}
          </button>
        </div>
      </div>

      {err && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{err}</span>
        </div>
      )}
      {saved && !err && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CircleCheck className="h-4 w-4" /> Draft saved. Nothing is live until you publish.
        </div>
      )}

      {/* The publish checklist. Framed as what's left rather than as errors,
          because on a new site everything is legitimately unfilled. */}
      {missing.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            Before this site can go live, it still needs:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-amber-800">
            {missing.map((m) => (
              <li key={m} className="flex items-start gap-2">
                <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                {m}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-amber-700">
            Credentials and biography can&apos;t be carried over from another surgeon — they describe
            one person&apos;s training, so they have to be written for this one.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CircleCheck className="h-4 w-4" /> Everything needed is filled in.
        </div>
      )}

      <Section id="identity" open={open} setOpen={setOpen} title="Identity" hint="How the surgeon is named across the site.">
        <Grid>
          <Field label="Full name with credential" hint='Appears in titles and the byline, e.g. "Nolan Horner, MD"'>
            <Input value={content.name} onChange={(v) => set("name", v)} />
          </Field>
          <Field label="Short name" hint='How articles refer to them mid-sentence, e.g. "Dr. Horner"'>
            <Input value={content.shortName} onChange={(v) => set("shortName", v)} />
          </Field>
          <Field label="Credential" hint="MD, DO, PA-C">
            <Input value={content.credential} onChange={(v) => set("credential", v)} />
          </Field>
          <Field label="Professional title" hint='e.g. "Board-Certified Orthopedic Surgeon"'>
            <Input value={content.title} onChange={(v) => set("title", v)} />
          </Field>
          <Field label="One-line description" hint="Used in search results and social previews." wide>
            <Textarea value={content.description} onChange={(v) => set("description", v)} rows={2} />
          </Field>
        </Grid>
      </Section>

      <Section id="images" open={open} setOpen={setOpen} title="Photographs" hint="This surgeon's own likeness. Never anyone else's.">
        <div className="grid gap-5 sm:grid-cols-2">
          <SurgeonImageField
            label="Headshot"
            hint="The main portrait — homepage, Spanish homepage and medical-legal page."
            value={content.headshot}
            onChange={(v) => set("headshot", v)}
          />
          <SurgeonImageField
            label="Second portrait"
            hint="The About page hero. A different crop or pose from the main headshot."
            value={content.headshotSecondary}
            onChange={(v) => set("headshotSecondary", v)}
          />
          <SurgeonImageField
            label="At work"
            hint="In the operating room or clinic. Used on the homepage and About page."
            value={content.portraitAtWork}
            onChange={(v) => set("portraitAtWork", v)}
          />
          <SurgeonImageField
            label="Search-result image"
            hint="What Google shows beside the practice. A large square image works best."
            value={content.schemaImagePath}
            onChange={(v) => set("schemaImagePath", v)}
          />
        </div>
        <p className="mt-3 text-[11px] leading-snug text-zinc-500">
          Leaving one blank is safe — the page simply has no photograph there. It will never
          fall back to another surgeon&apos;s.
        </p>
      </Section>

      <Section id="web" open={open} setOpen={setOpen} title="Address & domain" hint="Where the site lives.">
        <Grid>
          <Field label="Domain" hint="The address patients visit, without https://">
            <Input value={domain} onChange={(v) => { setDomain(v); setSaved(false) }} placeholder="nolanhornermd.com" />
          </Field>
          <Field label="Site URL" hint="Full origin used in links Google reads. Usually https:// plus the domain.">
            <Input value={content.baseUrl} onChange={(v) => set("baseUrl", v)} placeholder="https://nolanhornermd.com" />
          </Field>
          <Field label="Search Console token" hint="Per domain, not per surgeon. Each site needs its own.">
            <Input value={content.searchConsoleToken ?? ""} onChange={(v) => set("searchConsoleToken", v)} />
          </Field>
          <Field
            label="Preview hosts"
            hint="Extra addresses this site answers on while the real domain points elsewhere. One per line. These are kept out of search."
            wide
          >
            <Textarea
              value={(content.previewDomains ?? []).join("\n")}
              onChange={(v) =>
                set(
                  "previewDomains",
                  v.split("\n").map((x) => x.trim()).filter(Boolean),
                )
              }
              rows={2}
              placeholder="something.workers.dev"
            />
          </Field>
          <Field label="Redirect destination" hint="Where visitors go if this site is set to Redirected.">
            <Input value={redirectUrl} onChange={(v) => { setRedirectUrl(v); setSaved(false) }} placeholder="https://genesisortho.com/" />
          </Field>
        </Grid>
      </Section>

      <Section id="contact" open={open} setOpen={setOpen} title="Contact & practice" hint="Phone, email and how the region is described.">
        <Grid>
          <Field label="Phone (as displayed)"><Input value={content.phone} onChange={(v) => set("phone", v)} placeholder="(877) 377-1188" /></Field>
          <Field label="Phone (dialable)" hint="International format, used by search engines."><Input value={content.phoneE164} onChange={(v) => set("phoneE164", v)} placeholder="+1-877-377-1188" /></Field>
          <Field label="Fax (as displayed)"><Input value={content.fax} onChange={(v) => set("fax", v)} /></Field>
          <Field label="Fax (dialable)"><Input value={content.faxE164} onChange={(v) => set("faxE164", v)} /></Field>
          <Field label="Email"><Input value={content.email} onChange={(v) => set("email", v)} /></Field>
          <Field label="Practice name"><Input value={content.group} onChange={(v) => set("group", v)} /></Field>
          <Field label="Region" hint='As it reads in prose, e.g. "Chicagoland"'><Input value={content.region} onChange={(v) => set("region", v)} /></Field>
          <Field label="Metro" hint='The city named in page titles, e.g. "Chicago". Often different from the region and from any one clinic.'><Input value={content.metro} onChange={(v) => set("metro", v)} /></Field>
          <Field label="LinkedIn"><Input value={content.linkedin} onChange={(v) => set("linkedin", v)} /></Field>
          <Field label="Research profile" hint="ResearchGate or similar. Leave blank if they have none."><Input value={content.researchProfile ?? ""} onChange={(v) => set("researchProfile", v)} /></Field>
        </Grid>
      </Section>

      <Section
        id="credentials"
        open={open}
        setOpen={setOpen}
        title="Credentials"
        hint="Board certification, fellowship, residency, team affiliations."
        warn
      >
        <p className="mb-4 text-sm text-zinc-500">
          These appear on every article page. They describe this surgeon&apos;s own training and must
          never be copied from another surgeon&apos;s site.
        </p>
        <RowList
          rows={content.credentials}
          onChange={(rows) => set("credentials", rows)}
          blank={{ label: "", detail: "" }}
          addLabel="Add a credential"
          render={(row, update) => (
            <>
              <Input value={row.label} onChange={(v) => update({ ...row, label: v })} placeholder="Fellowship trained" />
              <Input value={row.detail} onChange={(v) => update({ ...row, detail: v })} placeholder="Sports medicine & shoulder, Rush University Medical Center" />
            </>
          )}
        />

        <p className="mt-6 mb-3 text-sm font-medium text-zinc-900">Training institutions</p>
        <StringList values={content.alumniOf} onChange={(v) => set("alumniOf", v)} placeholder="Rush University Medical Center" />
      </Section>

      <Section id="bio" open={open} setOpen={setOpen} title="Biography" hint="The About page narrative." warn>
        <p className="mb-3 text-sm text-zinc-500">
          One paragraph per box. This is the surgeon&apos;s own history — training, research, the teams
          they have covered.
        </p>
        <StringList
          values={content.profile.bio}
          onChange={(bio) => set("profile", { ...content.profile, bio })}
          placeholder="Dr. … is a board-certified orthopedic surgeon…"
          multiline
        />
      </Section>

      <Section id="clinics" open={open} setOpen={setOpen} title="Clinics" hint="Each one generates its own page, nav entry and map listing.">
        <p className="mb-4 text-sm text-zinc-500">
          Adding a clinic here creates its page, its entry in the menu, its listing for Google and its
          place in the sitemap. There is nothing else to set up.
        </p>
        <ClinicList clinics={content.clinics} onChange={(clinics) => set("clinics", clinics)} />
      </Section>
    </div>
  )
}

/* ── Layout pieces ─────────────────────────────────────────────────────────── */

function Section(props: {
  id: string
  open: string
  setOpen: (id: string) => void
  title: string
  hint: string
  warn?: boolean
  children: React.ReactNode
}) {
  const isOpen = props.open === props.id
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <button
        onClick={() => props.setOpen(isOpen ? "" : props.id)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-zinc-50"
      >
        {isOpen ? <ChevronDown className="h-4 w-4 text-zinc-400" /> : <ChevronRight className="h-4 w-4 text-zinc-400" />}
        <span className="text-sm font-medium text-zinc-900">{props.title}</span>
        {props.warn && (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[0.7rem] font-medium text-amber-700">
            Per surgeon
          </span>
        )}
        <span className="ml-auto hidden text-xs text-zinc-400 sm:block">{props.hint}</span>
      </button>
      {isOpen && <div className="border-t border-zinc-100 p-4">{props.children}</div>}
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>
}

function Field(props: { label: string; hint?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={cn("block", props.wide && "sm:col-span-2")}>
      <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">{props.label}</span>
      {props.children}
      {props.hint && <span className="mt-1 block text-xs text-zinc-400">{props.hint}</span>}
    </label>
  )
}

function Input(props: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      placeholder={props.placeholder}
      className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none transition-colors focus:border-zinc-400"
    />
  )
}

function Textarea(props: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <textarea
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      rows={props.rows ?? 3}
      placeholder={props.placeholder}
      className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none transition-colors focus:border-zinc-400"
    />
  )
}

/* ── Repeatable rows ───────────────────────────────────────────────────────── */

function RowList<T>(props: {
  rows: T[]
  onChange: (rows: T[]) => void
  blank: T
  addLabel: string
  render: (row: T, update: (row: T) => void) => React.ReactNode
}) {
  return (
    <div className="space-y-2">
      {props.rows.map((row, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="grid flex-1 gap-2 sm:grid-cols-2">{props.render(row, (next) => {
            const rows = [...props.rows]
            rows[i] = next
            props.onChange(rows)
          })}</div>
          <button
            onClick={() => props.onChange(props.rows.filter((_, j) => j !== i))}
            className="mt-2 text-zinc-300 transition-colors hover:text-red-600"
            title="Remove"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        onClick={() => props.onChange([...props.rows, props.blank])}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
      >
        <Plus className="h-4 w-4" /> {props.addLabel}
      </button>
    </div>
  )
}

function StringList(props: {
  values: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  multiline?: boolean
}) {
  return (
    <div className="space-y-2">
      {props.values.map((value, i) => (
        <div key={i} className="flex items-start gap-2">
          {props.multiline ? (
            <textarea
              value={value}
              rows={4}
              placeholder={props.placeholder}
              onChange={(e) => {
                const v = [...props.values]
                v[i] = e.target.value
                props.onChange(v)
              }}
              className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            />
          ) : (
            <input
              value={value}
              placeholder={props.placeholder}
              onChange={(e) => {
                const v = [...props.values]
                v[i] = e.target.value
                props.onChange(v)
              }}
              className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            />
          )}
          <button
            onClick={() => props.onChange(props.values.filter((_, j) => j !== i))}
            className="mt-2 text-zinc-300 transition-colors hover:text-red-600"
            title="Remove"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        onClick={() => props.onChange([...props.values, ""])}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
      >
        <Plus className="h-4 w-4" /> Add
      </button>
    </div>
  )
}

function ClinicList(props: { clinics: SurgeonClinic[]; onChange: (c: SurgeonClinic[]) => void }) {
  function update(i: number, next: SurgeonClinic) {
    const clinics = [...props.clinics]
    clinics[i] = next
    props.onChange(clinics)
  }

  return (
    <div className="space-y-4">
      {props.clinics.map((c, i) => (
        <div key={i} className="rounded-lg border border-zinc-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-900">{c.name || `Clinic ${i + 1}`}</p>
            <button
              onClick={() => props.onChange(props.clinics.filter((_, j) => j !== i))}
              className="text-zinc-300 transition-colors hover:text-red-600"
              title="Remove this clinic"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <Grid>
            <Field label="Name"><Input value={c.name} onChange={(v) => update(i, { ...c, name: v, slug: c.slug || v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") })} placeholder="Oak Brook" /></Field>
            <Field label="URL key" hint="Appears in the page address."><Input value={c.slug} onChange={(v) => update(i, { ...c, slug: v })} placeholder="oak-brook" /></Field>
            <Field label="Clinic day" hint='Plural, as it reads: "Mondays"'><Input value={c.day} onChange={(v) => update(i, { ...c, day: v })} placeholder="Mondays" /></Field>
            <Field label="City" hint="Used for local search listings."><Input value={c.city} onChange={(v) => update(i, { ...c, city: v })} /></Field>
            <Field label="Street"><Input value={c.street} onChange={(v) => update(i, { ...c, street: v })} /></Field>
            <Field label="Suite"><Input value={c.suite ?? ""} onChange={(v) => update(i, { ...c, suite: v })} /></Field>
            <Field label="City, state and ZIP"><Input value={c.cityStateZip} onChange={(v) => update(i, { ...c, cityStateZip: v })} placeholder="Oak Brook, IL 60523" /></Field>
            <Field label="Map search text" hint="What to search for on Google Maps."><Input value={c.mapQuery} onChange={(v) => update(i, { ...c, mapQuery: v })} /></Field>
            <Field label="Booking link" wide><Input value={c.bookingUrl} onChange={(v) => update(i, { ...c, bookingUrl: v })} /></Field>
            <Field label="Introduction" hint="The opening paragraph on this clinic's page." wide>
              <Textarea value={c.lead} onChange={(v) => update(i, { ...c, lead: v })} rows={2} />
            </Field>
            <Field label="Page title" hint="Shown in search results." wide><Input value={c.seoTitle} onChange={(v) => update(i, { ...c, seoTitle: v })} /></Field>
            <Field label="Page description" hint="The snippet under the title in search results." wide>
              <Textarea value={c.seoDescription} onChange={(v) => update(i, { ...c, seoDescription: v })} rows={2} />
            </Field>
          </Grid>
        </div>
      ))}
      <button
        onClick={() =>
          props.onChange([
            ...props.clinics,
            {
              slug: "", name: "", city: "", day: "", street: "", cityStateZip: "",
              mapQuery: "", bookingUrl: "", lead: "", intro: [], seoTitle: "", seoDescription: "",
            },
          ])
        }
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
      >
        <Plus className="h-4 w-4" /> Add a clinic
      </button>
    </div>
  )
}
