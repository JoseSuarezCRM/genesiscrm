"use client"

/**
 * One surgeon's website, as staff edit it.
 *
 * Every field the site app can read is reachable from here. That was not true
 * until recently: seventeen of them — the Spanish clinic copy, the research
 * narrative, the per-article paragraphs, the whole publication list — existed on
 * the record and in the site's types, but had no form, so the only way to write
 * one was a script on the command line. A field with no editor is a field the
 * practice does not have.
 *
 * The shell (rail, panels, preview tab) is shared with the practice editor.
 * Nothing here is bespoke chrome.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Loader2, Save, Globe, CircleAlert, CircleCheck, ExternalLink, RefreshCw,
} from "lucide-react"
import {
  updateSurgeonSite, publishSurgeonSite, setSurgeonSiteStatus,
  surgeonSitePreviewUrl, rotateSurgeonSitePreviewToken,
} from "@/app/actions/surgeon-sites"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import {
  missingCredentials, PROFILE_ICONS,
  type SurgeonSiteContent, type SurgeonClinic,
} from "@/lib/surgeon-site"
import {
  PAGE_COPY_GROUPS, PAGE_LIST_KEYS, ARTICLE_BIO_KEYS,
  KNOWN_COPY_KEYS, filledCount,
} from "@/lib/surgeon-site-copy"
import { SurgeonImageField } from "@/components/surgeon-site-image-field"
import { EditorShell, type EditorSection } from "@/components/settings/editor-shell"
import { CollectionEditor } from "@/components/settings/collection-editor"
import {
  Field, Grid, Input, RowList, Select, StringList, Textarea,
} from "@/components/settings/editor-fields"
import {
  ArticleBioEditor, CopyKeyEditor, CopyListEditor,
} from "@/components/settings/copy-key-editor"
import { PublicationsEditor } from "@/components/settings/publications-editor"
import { ProtocolsEditor } from "@/components/settings/protocols-editor"

type Status = "DRAFT" | "PUBLISHED" | "REDIRECTED" | "RETIRED"

/** The languages the site app actually publishes in. */
const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
]

export function SurgeonSiteEditor(props: {
  id: string
  slug: string
  domain: string | null
  status: Status
  redirectUrl: string | null
  publishedAt: string | null
  /**
   * Whether the last publish actually reached the live site.
   *
   * The site bundles its content at build time, so publishing here only takes
   * effect once a deploy runs. That is what keeps the site up when this CRM is
   * down, and the price is that a broken deploy hook would let content quietly
   * stop arriving. Showing it is how that stops being silent.
   */
  lastDeployAt: string | null
  lastDeployOk: boolean | null
  lastDeployError: string | null
  /**
   * The shared address the sites are served on, e.g. a *.vercel.app origin.
   *
   * One deployment serves every surgeon and tells them apart by the domain
   * requested, so that address alone cannot say which surgeon to render —
   * `?preview=<domain>` does. Null when SURGEON_SITE_PREVIEW_URL is unset, and
   * the button is simply absent.
   */
  previewUrl: string | null
  /** Whether a preview link has ever been issued, so Rotate can be offered. */
  hasPreviewToken: boolean
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

  // Recomputed as they type, using the same function the server publishes with,
  // so the checklist can never disagree with what publishing actually allows.
  const missing = missingCredentials(content, domain || null)

  function set<K extends keyof SurgeonSiteContent>(key: K, value: SurgeonSiteContent[K]) {
    setContent((c) => ({ ...c, [key]: value }))
    setSaved(false)
  }

  function setProfile<K extends keyof SurgeonSiteContent["profile"]>(
    key: K,
    value: SurgeonSiteContent["profile"][K],
  ) {
    set("profile", { ...content.profile, [key]: value })
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

  /**
   * Save and wait for it.
   *
   * `save()` runs inside a transition and returns immediately, which is right
   * for the button and wrong for the Preview tab: the preview renders what is
   * STORED, so showing it before the save lands shows the previous version and
   * reads as a broken preview.
   */
  async function saveNow() {
    setErr(null)
    try {
      await updateSurgeonSite(props.id, { domain, redirectUrl, content })
      setSaved(true)
      router.refresh()
    } catch (e: any) {
      setErr(e?.message ?? "Could not save")
      throw e
    }
  }

  /** The draft URL for the Preview tab, minted on demand. */
  async function previewSrc(path?: string) {
    const res = await surgeonSitePreviewUrl(props.id)
    if (res.error || !res.url) {
      setErr(res.error ?? "Could not build the preview link.")
      return null
    }
    if (!path || path === "/") return res.url
    // `?preview=` and the key live on the query, so the path goes before it.
    const u = new URL(res.url)
    u.pathname = path
    return u.toString()
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

  async function rotatePreview() {
    if (
      !(await confirmDialog(
        "Issue a new preview link for this site? Any link already shared stops working.",
      ))
    )
      return
    setErr(null)
    startTransition(async () => {
      const res = await rotateSurgeonSitePreviewToken(props.id)
      if (res.error) setErr(res.error)
      router.refresh()
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

  /**
   * Which section fixes each outstanding item.
   *
   * Derived from the same missingCredentials() the publish gate uses, so the
   * rail cannot disagree with the checklist about what is unfinished. A message
   * with no mapping simply marks nothing rather than guessing.
   */
  const attention = new Set(
    missing.flatMap((m) => {
      const t = m.toLowerCase()
      if (t.includes("name") || t.includes("title") || t.includes("description")) return ["identity"]
      if (t.includes("domain") || t.includes("site url")) return ["web"]
      if (t.includes("email") || t.includes("phone")) return ["contact"]
      if (t.includes("credential")) return ["credentials"]
      if (t.includes("biography")) return ["bio"]
      if (t.includes("clinic")) return ["clinics"]
      return []
    }),
  )

  // How much of the keyed copy has been written — shown in the rail so the two
  // biggest sections say at a glance whether anyone has been through them.
  const copyFilled = PAGE_COPY_GROUPS.reduce(
    (n, g) => n + filledCount(content.pageCopy, g.keys),
    0,
  )
  const copyTotal = PAGE_COPY_GROUPS.reduce((n, g) => n + g.keys.length, 0)
  const bioFilled = ARTICLE_BIO_KEYS.filter((k) => (content.articleBios[k.key] ?? "").trim()).length

  const clinicOptions = content.clinics
    .filter((c) => c.name.trim())
    .map((c) => ({ value: c.name, label: c.name }))

  const sections: EditorSection[] = [
    {
      id: "identity",
      label: "Identity",
      hint: "How the surgeon is named across the site.",
      needsAttention: attention.has("identity"),
      previewPath: "/",
      panel: (
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
      ),
    },
    {
      id: "images",
      label: "Photographs",
      hint: "This surgeon's own likeness. Never anyone else's.",
      previewPath: "/about",
      panel: (
        <>
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
          <p className="mt-3 text-pretty text-xs leading-snug text-zinc-500">
            Leaving one blank is safe — the page simply has no photograph there. It will never
            fall back to another surgeon&apos;s.
          </p>
        </>
      ),
    },
    {
      id: "web",
      label: "Address & domain",
      hint: "Where the site lives.",
      needsAttention: attention.has("web"),
      previewPath: "/",
      panel: (
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
          {props.hasPreviewToken && (
            <Field
              label="Preview link"
              hint="Preview draft carries a key unique to this site. Issue a new one if a link has been shared too widely — it affects only this surgeon and needs no redeploy."
              wide
            >
              <button
                type="button"
                onClick={rotatePreview}
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-40"
              >
                <RefreshCw className="size-4" />
                Issue a new preview link
              </button>
            </Field>
          )}
        </Grid>
      ),
    },
    {
      id: "contact",
      label: "Contact & practice",
      hint: "Phone, email and how the region is described.",
      needsAttention: attention.has("contact"),
      previewPath: "/contact",
      panel: (
        <Grid>
          <Field label="Phone (as displayed)"><Input value={content.phone} onChange={(v) => set("phone", v)} placeholder="(877) 377-1188" /></Field>
          <Field label="Phone (dialable)" hint="International format, used by search engines."><Input value={content.phoneE164} onChange={(v) => set("phoneE164", v)} placeholder="+1-877-377-1188" /></Field>
          <Field label="Fax (as displayed)"><Input value={content.fax} onChange={(v) => set("fax", v)} /></Field>
          <Field label="Fax (dialable)"><Input value={content.faxE164} onChange={(v) => set("faxE164", v)} /></Field>
          <Field label="Email"><Input value={content.email} onChange={(v) => set("email", v)} /></Field>
          <Field label="Practice name"><Input value={content.group} onChange={(v) => set("group", v)} /></Field>
          <Field label="Practice website" hint="Linked wherever the site names the group."><Input value={content.groupUrl} onChange={(v) => set("groupUrl", v)} placeholder="https://genesisortho.com/" /></Field>
          <Field label="Region" hint='As it reads in prose, e.g. "Chicagoland"'><Input value={content.region} onChange={(v) => set("region", v)} /></Field>
          <Field label="Metro" hint='The city named in page titles, e.g. "Chicago". Often different from the region and from any one clinic.'><Input value={content.metro} onChange={(v) => set("metro", v)} /></Field>
          <Field label="LinkedIn"><Input value={content.linkedin} onChange={(v) => set("linkedin", v)} /></Field>
          <Field label="Research profile" hint="ResearchGate or similar. Leave blank if they have none."><Input value={content.researchProfile ?? ""} onChange={(v) => set("researchProfile", v)} /></Field>
        </Grid>
      ),
    },
    {
      id: "reach",
      label: "Reach & links",
      hint: "Languages, service area, and the profiles search engines cross-reference.",
      previewPath: "/",
      panel: (
        <>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Languages
          </p>
          <p className="mb-3 text-pretty text-sm text-zinc-500">
            Turning Spanish off removes the language switcher and keeps the Spanish pages out of
            search. Turning it on does not translate anything — the Spanish copy is written by
            hand under Page copy and on each clinic.
          </p>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((l) => {
              const on = content.languages.includes(l.code)
              return (
                <button
                  key={l.code}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    set(
                      "languages",
                      on
                        ? content.languages.filter((c) => c !== l.code)
                        : [...content.languages, l.code],
                    )
                  }
                  className={
                    on
                      ? "rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
                      : "rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-50"
                  }
                >
                  {l.label}
                </button>
              )
            })}
          </div>

          <p className="mb-2 mt-8 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Areas served
          </p>
          <p className="mb-3 text-pretty text-sm text-zinc-500">
            Towns and neighbourhoods, one per box. Used in the listing search engines read, not
            printed as a list on any page.
          </p>
          <StringList
            values={content.areaServed}
            onChange={(v) => set("areaServed", v)}
            placeholder="Oak Brook"
            addLabel="Add an area"
            itemLabel="area"
          />

          <p className="mb-2 mt-8 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Other profiles
          </p>
          <p className="mb-3 text-pretty text-sm text-zinc-500">
            Full links to profiles that are unmistakably this surgeon — Doximity, Healthgrades, a
            hospital page. Search engines use them to tie this site to the same person.
          </p>
          <StringList
            values={content.sameAs}
            onChange={(v) => set("sameAs", v)}
            placeholder="https://www.doximity.com/pub/…"
            addLabel="Add a profile"
            itemLabel="profile"
          />
        </>
      ),
    },
    {
      id: "credentials",
      label: "Credentials",
      hint: "Board certification, fellowship, residency, team affiliations.",
      needsAttention: attention.has("credentials"),
      badge: "Per surgeon",
      previewPath: "/about",
      panel: (
        <>
          <p className="mb-4 text-pretty text-sm text-zinc-500">
            These appear on every article page. They describe this surgeon&apos;s own training and must
            never be copied from another surgeon&apos;s site.
          </p>
          <RowList
            rows={content.credentials}
            onChange={(rows) => set("credentials", rows)}
            blank={{ label: "", detail: "" }}
            addLabel="Add a credential"
            itemLabel="credential"
            render={(row, update) => (
              <>
                <Input value={row.label} onChange={(v) => update({ ...row, label: v })} placeholder="Fellowship trained" />
                <Input value={row.detail} onChange={(v) => update({ ...row, detail: v })} placeholder="Sports medicine & shoulder, Rush University Medical Center" />
              </>
            )}
          />

          <p className="mb-3 mt-8 text-sm font-medium text-zinc-900">Training institutions</p>
          <StringList
            values={content.alumniOf}
            onChange={(v) => set("alumniOf", v)}
            placeholder="Rush University Medical Center"
            addLabel="Add an institution"
            itemLabel="institution"
          />
        </>
      ),
    },
    {
      id: "bio",
      label: "Biography",
      hint: "The About page narrative.",
      needsAttention: attention.has("bio"),
      badge: "Per surgeon",
      previewPath: "/about",
      panel: (
        <>
          <p className="mb-3 text-pretty text-sm text-zinc-500">
            One paragraph per box. This is the surgeon&apos;s own history — training, research, the teams
            they have covered.
          </p>
          <StringList
            values={content.profile.bio}
            onChange={(bio) => setProfile("bio", bio)}
            placeholder="Dr. … is a board-certified orthopedic surgeon…"
            addLabel="Add a paragraph"
            itemLabel="paragraph"
            multiline
          />
        </>
      ),
    },
    {
      id: "profile",
      label: "Profile blocks",
      hint: "The credential cards, highlights and facts table.",
      badge: "Per surgeon",
      previewPath: "/about",
      panel: (
        <>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Credential cards
          </p>
          <p className="mb-3 text-pretty text-sm text-zinc-500">
            The row of five across the homepage, under the hero.
          </p>
          <CollectionEditor
            items={content.profile.cards}
            onChange={(cards) => setProfile("cards", cards)}
            blank={() => ({ icon: "Award", title: "", description: "" })}
            itemLabel="card"
            reorderable
            emptyHint="No cards. The homepage skips the credentials row entirely."
            summary={(c) => ({ title: c.title, detail: c.description })}
            form={(c, update) => (
              <>
                <Grid>
                  <Field label="Title">
                    <Input value={c.title} onChange={(v) => update({ ...c, title: v })} placeholder="Fellowship trained" />
                  </Field>
                  <Field label="Icon">
                    <Select
                      value={c.icon}
                      onChange={(v) => update({ ...c, icon: v })}
                      options={[...PROFILE_ICONS]}
                    />
                  </Field>
                </Grid>
                <Field label="Description">
                  <Textarea value={c.description} onChange={(v) => update({ ...c, description: v })} rows={2} />
                </Field>
              </>
            )}
          />

          <p className="mb-2 mt-8 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Highlights
          </p>
          <p className="mb-3 text-pretty text-sm text-zinc-500">
            Short titled blocks on the About page, between the biography and the facts.
          </p>
          <CollectionEditor
            items={content.profile.highlights}
            onChange={(highlights) => setProfile("highlights", highlights)}
            blank={() => ({ title: "", body: "" })}
            itemLabel="highlight"
            reorderable
            emptyHint="No highlights. The About page runs straight from the biography to the facts."
            summary={(h) => ({ title: h.title, detail: h.body })}
            form={(h, update) => (
              <>
                <Field label="Title">
                  <Input value={h.title} onChange={(v) => update({ ...h, title: v })} />
                </Field>
                <Field label="Body">
                  <Textarea value={h.body} onChange={(v) => update({ ...h, body: v })} rows={3} />
                </Field>
              </>
            )}
          />

          <p className="mb-2 mt-8 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Facts
          </p>
          <p className="mb-3 text-pretty text-sm text-zinc-500">
            The labelled table on the About page — fellowship, residency, board certification.
          </p>
          <CollectionEditor
            items={content.profile.facts}
            onChange={(facts) => setProfile("facts", facts)}
            blank={() => ({ icon: "GraduationCap", label: "", value: "" })}
            itemLabel="fact"
            reorderable
            emptyHint="No facts. The table is left out."
            summary={(f) => ({ title: f.label, detail: f.value })}
            form={(f, update) => (
              <Grid>
                <Field label="Label">
                  <Input value={f.label} onChange={(v) => update({ ...f, label: v })} placeholder="Fellowship" />
                </Field>
                <Field label="Icon">
                  <Select
                    value={f.icon}
                    onChange={(v) => update({ ...f, icon: v })}
                    options={[...PROFILE_ICONS]}
                  />
                </Field>
                <Field label="Value" wide>
                  <Input value={f.value} onChange={(v) => update({ ...f, value: v })} placeholder="Sports medicine & shoulder, Rush University Medical Center" />
                </Field>
              </Grid>
            )}
          />
        </>
      ),
    },
    {
      id: "clinics",
      label: "Clinics",
      hint: "Each one generates its own page, nav entry and map listing.",
      needsAttention: attention.has("clinics"),
      badge: String(content.clinics.length),
      previewPath: "/contact",
      panel: (
        <>
          <p className="mb-4 text-pretty text-sm text-zinc-500">
            Adding a clinic here creates its page, its entry in the menu, its listing for Google and its
            place in the sitemap. There is nothing else to set up. Offices the practice runs that this
            surgeon does <strong className="font-medium">not</strong> attend come from the practice
            record, not from here.
          </p>
          <ClinicList clinics={content.clinics} onChange={(clinics) => set("clinics", clinics)} />
        </>
      ),
    },
    {
      id: "reviews",
      label: "Reviews",
      hint: "Verbatim patient reviews. Never edited, never moved between surgeons.",
      badge: String(content.reviews.length),
      previewPath: "/reviews",
      panel: (
        <>
          <p className="mb-4 text-pretty text-sm text-zinc-500">
            Quote each review exactly as it was published. A review is one patient&apos;s statement
            about one doctor: rewriting it to name someone else is fabricating a testimonial. Empty
            is a perfectly good answer — the page links out to Google instead.
          </p>
          <CollectionEditor
            items={content.reviews}
            onChange={(reviews) => set("reviews", reviews)}
            blank={() => ({ quote: "", source: "Google" as const, rating: 5 as const })}
            itemLabel="review"
            reorderable
            emptyHint="No reviews. The page sends patients to this surgeon's Google listing instead."
            summary={(r) => ({
              title: r.quote,
              detail: [r.source, `${r.rating}★`, r.office, r.date].filter(Boolean).join(" · "),
            })}
            form={(r, update) => (
              <>
                <Field label="Quote" hint="Word for word, as the patient wrote it.">
                  <Textarea value={r.quote} onChange={(v) => update({ ...r, quote: v })} rows={4} />
                </Field>
                <Grid>
                  <Field label="Source">
                    <Select
                      value={r.source}
                      onChange={(v) => update({ ...r, source: v as typeof r.source })}
                      options={[
                        { value: "Google", label: "Google" },
                        { value: "Zocdoc", label: "Zocdoc" },
                      ]}
                    />
                  </Field>
                  <Field label="Rating">
                    <Select
                      value={String(r.rating)}
                      onChange={(v) =>
                        update({ ...r, rating: (Number.parseInt(v, 10) || 5) as typeof r.rating })
                      }
                      options={[5, 4, 3, 2, 1].map((n) => ({
                        value: String(n),
                        label: `${n} star${n === 1 ? "" : "s"}`,
                      }))}
                    />
                  </Field>
                  <Field label="Office" hint="Which clinic it was left for, if it says.">
                    <Select
                      value={r.office ?? ""}
                      onChange={(v) => update({ ...r, office: v })}
                      options={clinicOptions}
                      placeholder="Not stated"
                    />
                  </Field>
                  <Field label="Date" hint="As shown on the review.">
                    <Input value={r.date ?? ""} onChange={(v) => update({ ...r, date: v })} placeholder="March 2025" />
                  </Field>
                </Grid>
              </>
            )}
          />
        </>
      ),
    },
    {
      id: "research",
      label: "Research",
      hint: "The research page's narrative, journals and meetings.",
      badge: "Per surgeon",
      previewPath: "/research",
      panel: (
        <>
          <p className="mb-4 text-pretty text-sm text-zinc-500">
            All of this was written into the site app until recently, which credited every surgeon
            with one person&apos;s career. Each part renders nothing when empty, so a surgeon who has
            published but not written these gets a shorter page — never someone else&apos;s.
          </p>

          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Figures
          </p>
          <p className="mb-3 text-pretty text-sm text-zinc-500">
            The counts across the top of the page — publications, trials, citations.
          </p>
          <RowList
            rows={content.researchStats}
            onChange={(v) => set("researchStats", v)}
            blank={{ label: "", value: "" }}
            addLabel="Add a figure"
            itemLabel="figure"
            render={(row, update) => (
              <>
                <Input value={row.label} onChange={(v) => update({ ...row, label: v })} placeholder="Peer-reviewed publications" />
                <Input value={row.value} onChange={(v) => update({ ...row, value: v })} placeholder="100+" />
              </>
            )}
          />

          <p className="mb-2 mt-8 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Themes
          </p>
          <p className="mb-3 text-pretty text-sm text-zinc-500">
            The strands of their work, one titled block each. These name the trials a surgeon led
            and the journals that published them, so they belong to one person only.
          </p>
          <CollectionEditor
            items={content.researchThemes}
            onChange={(v) => set("researchThemes", v)}
            blank={() => ({ title: "", body: "" })}
            itemLabel="theme"
            reorderable
            emptyHint="No themes. The research page shows the publication list without the narrative above it."
            summary={(t) => ({ title: t.title, detail: t.body })}
            form={(t, update) => (
              <>
                <Field label="Title">
                  <Input value={t.title} onChange={(v) => update({ ...t, title: v })} />
                </Field>
                <Field label="Body">
                  <Textarea value={t.body} onChange={(v) => update({ ...t, body: v })} rows={6} />
                </Field>
              </>
            )}
          />

          <p className="mb-2 mt-8 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Journals
          </p>
          <p className="mb-3 text-pretty text-sm text-zinc-500">
            Where their work has appeared, one per box.
          </p>
          <StringList
            values={content.researchVenues}
            onChange={(v) => set("researchVenues", v)}
            placeholder="The American Journal of Sports Medicine"
            addLabel="Add a journal"
            itemLabel="journal"
          />

          <p className="mb-2 mt-8 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Meetings
          </p>
          <p className="mb-3 text-pretty text-sm text-zinc-500">
            Conferences they have presented at, one per box.
          </p>
          <StringList
            values={content.researchMeetings}
            onChange={(v) => set("researchMeetings", v)}
            placeholder="American Academy of Orthopaedic Surgeons Annual Meeting"
            addLabel="Add a meeting"
            itemLabel="meeting"
          />
        </>
      ),
    },
    {
      id: "publications",
      label: "Publications",
      hint: "The full list. Paste it rather than typing it.",
      badge: String(content.publications.length),
      previewPath: "/research/publications",
      panel: (
        <PublicationsEditor
          items={content.publications}
          onChange={(v) => set("publications", v)}
        />
      ),
    },
    {
      id: "protocols",
      label: "Rehab protocols",
      hint: "This surgeon's own post-operative instructions.",
      badge: String(content.protocolGroups.reduce((n, g) => n + g.items.length, 0)),
      previewPath: "/rehabilitation-protocols",
      panel: (
        <>
          <ProtocolsEditor
            groups={content.protocolGroups}
            onChange={(v) => set("protocolGroups", v)}
          />
          <div className="mt-8">
            <Field
              label="Protocol source page"
              hint="Where the full set lives on the practice's own site, if it does. Linked at the foot of the page."
            >
              <Input
                value={content.protocolsSourceUrl ?? ""}
                onChange={(v) => set("protocolsSourceUrl", v)}
                placeholder="https://genesisortho.com/protocols/"
              />
            </Field>
          </div>
        </>
      ),
    },
    {
      id: "medical-legal",
      label: "Medical-legal",
      hint: "How the expert-witness pages state their qualifications.",
      badge: "Per surgeon",
      previewPath: "/medical-legal",
      panel: (
        <>
          <p className="mb-4 text-pretty text-sm text-zinc-500">
            A separate list from the Credentials section: the expert-witness pages address
            attorneys, and state the same training differently. It never falls back to the other
            list — leave this empty and the &ldquo;Why work with&hellip;&rdquo; heading appears
            with nothing under it.
          </p>
          <RowList
            rows={content.medicalLegalCredentials}
            onChange={(v) => set("medicalLegalCredentials", v)}
            blank={{ label: "", detail: "" }}
            addLabel="Add a credential"
            itemLabel="credential"
            render={(row, update) => (
              <>
                <Input value={row.label} onChange={(v) => update({ ...row, label: v })} placeholder="Board certification" />
                <Input value={row.detail} onChange={(v) => update({ ...row, detail: v })} placeholder="American Board of Orthopaedic Surgery" />
              </>
            )}
          />
          <p className="mt-6 text-pretty text-xs text-zinc-400">
            The enquiry address, scheduling links and turnaround are the same for every surgeon and
            live on the practice record, under Settings → Practice.
          </p>
        </>
      ),
    },
    {
      id: "copy",
      label: "Page copy",
      hint: "The sentences on each page that describe this surgeon.",
      badge: `${copyFilled}/${copyTotal}`,
      previewPath: "/",
      panel: (
        <>
          <p className="mb-4 text-pretty text-sm text-zinc-500">
            Search descriptions and the opening paragraphs, page by page. All optional: where one
            is blank, a search description is built from this surgeon&apos;s own name, title and
            metro, and body copy is simply left out.
          </p>
          <CopyKeyEditor
            groups={PAGE_COPY_GROUPS}
            values={content.pageCopy}
            onChange={(v) => set("pageCopy", v)}
            known={KNOWN_COPY_KEYS}
          />
          <div className="mt-8">
            <CopyListEditor
              keys={PAGE_LIST_KEYS}
              values={content.pageLists}
              onChange={(v) => set("pageLists", v)}
            />
          </div>
        </>
      ),
    },
    {
      id: "articles",
      label: "Article intros",
      hint: 'The "why patients choose…" paragraph that closes each clinical article.',
      badge: `${bioFilled}/${ARTICLE_BIO_KEYS.length}`,
      previewPath: "/expertise",
      panel: (
        <>
          <p className="mb-4 text-pretty text-sm text-zinc-500">
            The clinical part of each article is shared across every surgeon&apos;s site. This
            paragraph is not — it is why a patient would choose <em>this</em> surgeon for that
            problem, and an article with no entry simply ends without the section.
          </p>
          <ArticleBioEditor
            keys={ARTICLE_BIO_KEYS}
            values={content.articleBios}
            onChange={(v) => set("articleBios", v)}
          />
        </>
      ),
    },
  ]

  return (
    <EditorShell
      title={content.name || "New surgeon website"}
      subtitle={
        <>
          {props.publishedAt
            ? `Last published ${new Date(props.publishedAt).toLocaleString()}`
            : "Never published — nothing is live yet"}
          {props.lastDeployAt && props.lastDeployOk && (
            <> · site rebuilt {new Date(props.lastDeployAt).toLocaleString()}</>
          )}
        </>
      }
      sections={sections}
      // The Preview tab shows the SAVED draft, so the shell saves first. Offered
      // whatever the status, including DRAFT: seeing a site before it has ever
      // gone live is the main thing this is for.
      canPreview={!!props.previewUrl && !!domain}
      resolvePreviewSrc={previewSrc}
      onBeforePreview={saveNow}
      actions={
        <>
          {props.previewUrl && props.status === "PUBLISHED" && domain && (
            <a
              href={`${props.previewUrl}/?preview=${encodeURIComponent(domain)}`}
              target="_blank"
              rel="noreferrer"
              title="Open the published site on the shared preview address"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              <ExternalLink className="size-4" />
              Published site
            </a>
          )}
          <button
            type="button"
            onClick={() => save()}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-40"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save draft
          </button>
          <button
            type="button"
            onClick={publish}
            disabled={pending || missing.length > 0}
            title={missing.length > 0 ? "Fill in the remaining details first" : "Make this live"}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-40"
          >
            <Globe className="size-4" />
            {props.status === "PUBLISHED" ? "Publish changes" : "Publish"}
          </button>
        </>
      }
      notices={
        <>
          {err && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <span className="text-pretty">{err}</span>
            </div>
          )}
          {/*
            The deploy, shown only when it failed. A successful one needs no
            notice — publishing worked and the site is rebuilding — but a failure
            means the published content is sitting in this database and not on
            the internet, which otherwise looks exactly like success.
          */}
          {props.lastDeployOk === false && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <div className="text-pretty">
                <p className="font-medium">Published here, but the live site was not rebuilt.</p>
                <p className="mt-0.5 text-amber-700">
                  {props.lastDeployError ?? "The deploy could not be requested."}
                </p>
                <p className="mt-1 text-amber-700">
                  The site keeps serving what it last built, so nothing is broken — but these
                  changes will not appear until it is redeployed.
                </p>
              </div>
            </div>
          )}
          {saved && !err && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CircleCheck className="size-4" /> Draft saved. Nothing is live until you publish.
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
                  <li key={m} className="flex items-start gap-2 text-pretty">
                    <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-amber-500" />
                    {m}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-pretty text-xs text-amber-700">
                Credentials and biography can&apos;t be carried over from another surgeon — they
                describe one person&apos;s training, so they have to be written for this one.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CircleCheck className="size-4" /> Everything needed is filled in.
            </div>
          )}
          {props.status === "REDIRECTED" && (
            <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
              This site currently redirects visitors elsewhere.{" "}
              <button
                type="button"
                onClick={() => changeStatus("PUBLISHED")}
                disabled={pending}
                className="font-medium text-zinc-900 underline-offset-4 hover:underline disabled:opacity-40"
              >
                Serve the site again
              </button>
            </div>
          )}
        </>
      }
    />
  )
}

/* ── Clinics ───────────────────────────────────────────────────────────────── */

function blankClinic(): SurgeonClinic {
  return {
    slug: "", name: "", city: "", day: "", street: "", cityStateZip: "",
    mapQuery: "", bookingUrl: "", lead: "", intro: [], seoTitle: "", seoDescription: "",
  }
}

function slugify(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

/**
 * A clinic is twenty fields — fourteen English, six Spanish — which is why it
 * edits in a dialog rather than as a row. The Spanish half in particular had no
 * editor at all before, so a clinic created here was permanently absent from the
 * Spanish site: the pages are generated per clinic from `es`, and a clinic
 * without it is skipped.
 */
function ClinicList(props: { clinics: SurgeonClinic[]; onChange: (c: SurgeonClinic[]) => void }) {
  return (
    <CollectionEditor
      items={props.clinics}
      onChange={props.onChange}
      blank={blankClinic}
      itemLabel="clinic"
      reorderable
      emptyHint="No clinics yet. A site needs at least one before it can be published."
      summary={(c) => ({
        title: c.name,
        detail: [c.day, c.cityStateZip, c.es ? "Spanish ✓" : "no Spanish"].filter(Boolean).join(" · "),
      })}
      form={(c, update) => (
        <>
          <Grid>
            <Field label="Name">
              <Input
                value={c.name}
                onChange={(v) => update({ ...c, name: v, slug: c.slug || slugify(v) })}
                placeholder="Oak Brook"
              />
            </Field>
            <Field label="URL key" hint="Appears in the page address.">
              <Input value={c.slug} onChange={(v) => update({ ...c, slug: v })} placeholder="oak-brook" />
            </Field>
            <Field label="Clinic day" hint='Plural, as it reads: "Mondays"'>
              <Input value={c.day} onChange={(v) => update({ ...c, day: v })} placeholder="Mondays" />
            </Field>
            <Field label="City" hint="Used for local search listings.">
              <Input value={c.city} onChange={(v) => update({ ...c, city: v })} />
            </Field>
            <Field label="Street">
              <Input value={c.street} onChange={(v) => update({ ...c, street: v })} />
            </Field>
            <Field label="Suite">
              <Input value={c.suite ?? ""} onChange={(v) => update({ ...c, suite: v })} />
            </Field>
            <Field label="City, state and ZIP">
              <Input value={c.cityStateZip} onChange={(v) => update({ ...c, cityStateZip: v })} placeholder="Oak Brook, IL 60523" />
            </Field>
            <Field label="Map search text" hint="What to search for on Google Maps.">
              <Input value={c.mapQuery} onChange={(v) => update({ ...c, mapQuery: v })} />
            </Field>
            <Field
              label="Booking link"
              hint="Where the Book button goes. With none, no button is shown — it never falls back to another surgeon's."
              wide
            >
              <Input value={c.bookingUrl} onChange={(v) => update({ ...c, bookingUrl: v })} />
            </Field>
            <Field label="Google review link" hint="Where the page sends patients to leave a review." wide>
              <Input value={c.googleReviewUrl ?? ""} onChange={(v) => update({ ...c, googleReviewUrl: v })} />
            </Field>
            <Field label="Introduction" hint="The opening paragraph on this clinic's page." wide>
              <Textarea value={c.lead} onChange={(v) => update({ ...c, lead: v })} rows={2} />
            </Field>
          </Grid>

          <Field label="Body paragraphs" hint="After the introduction. One paragraph per box.">
            <StringList
              values={c.intro}
              onChange={(intro) => update({ ...c, intro })}
              addLabel="Add a paragraph"
              itemLabel="paragraph"
              multiline
            />
          </Field>

          <Grid>
            <Field label="Page title" hint="Shown in search results." wide>
              <Input value={c.seoTitle} onChange={(v) => update({ ...c, seoTitle: v })} />
            </Field>
            <Field label="Page description" hint="The snippet under the title in search results." wide>
              <Textarea value={c.seoDescription} onChange={(v) => update({ ...c, seoDescription: v })} rows={2} />
            </Field>
          </Grid>

          <ClinicSpanish clinic={c} update={update} />
        </>
      )}
    />
  )
}

/**
 * The Spanish half of a clinic.
 *
 * Behind a toggle because it is genuinely optional and the English form is long
 * enough already. Turning it off removes the whole `es` object rather than
 * blanking its fields: the site tests for the object's presence to decide
 * whether this clinic appears on the Spanish site, so six empty strings would
 * publish a Spanish page with nothing on it.
 */
function ClinicSpanish(props: {
  clinic: SurgeonClinic
  update: (c: SurgeonClinic) => void
}) {
  const { clinic: c, update } = props
  const es = c.es

  const setEs = (patch: Partial<NonNullable<SurgeonClinic["es"]>>) =>
    update({
      ...c,
      es: { day: "", lead: "", intro: [], areas: "", seoTitle: "", seoDescription: "", ...es, ...patch },
    })

  return (
    <div className="mt-2 rounded-xl border border-zinc-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900">Spanish page</p>
          <p className="mt-0.5 text-pretty text-xs text-zinc-500">
            Without this, the clinic has no page on the Spanish site at all. Written by hand —
            nothing here is translated for you.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (es) {
              const { es: _drop, ...rest } = c
              update(rest)
            } else {
              setEs({})
            }
          }}
          className="shrink-0 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
        >
          {es ? "Remove" : "Add Spanish"}
        </button>
      </div>

      {es && (
        <div className="mt-4 space-y-4">
          <Grid>
            <Field label="Día de consulta" hint='In Spanish, plural: "Lunes"'>
              <Input value={es.day} onChange={(v) => setEs({ day: v })} placeholder="Lunes" />
            </Field>
            <Field label="Zonas atendidas" hint="One sentence listing the areas served.">
              <Input value={es.areas} onChange={(v) => setEs({ areas: v })} />
            </Field>
            <Field label="Introducción" wide>
              <Textarea value={es.lead} onChange={(v) => setEs({ lead: v })} rows={2} />
            </Field>
          </Grid>
          <Field label="Párrafos" hint="One paragraph per box.">
            <StringList
              values={es.intro}
              onChange={(intro) => setEs({ intro })}
              addLabel="Añadir párrafo"
              itemLabel="párrafo"
              multiline
            />
          </Field>
          <Grid>
            <Field label="Título de la página" wide>
              <Input value={es.seoTitle} onChange={(v) => setEs({ seoTitle: v })} />
            </Field>
            <Field label="Descripción de la página" wide>
              <Textarea value={es.seoDescription} onChange={(v) => setEs({ seoDescription: v })} rows={2} />
            </Field>
          </Grid>
        </div>
      )}
    </div>
  )
}
