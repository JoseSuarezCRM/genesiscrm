/**
 * The page-copy keys a surgeon site can hold, with human labels.
 *
 * `SurgeonSiteContent.pageCopy`, `.pageLists` and `.articleBios` are
 * `Record<string, …>` — open-ended in the type, but *closed in practice*: every
 * call site in the site app passes a string literal, so a key that is not in
 * this list is read by nothing. Without a manifest there is no editor for them
 * at all, because a form cannot render fields for keys it does not know.
 *
 * ── Keeping this honest ───────────────────────────────────────────────────────
 *
 * This is a second copy of something the site app owns, so it can drift. Two
 * things limit the damage:
 *
 *   - The editor also renders any key already present in the data but missing
 *     here, under "Other copy". A key this file forgets is still editable; it
 *     just has no label. Nothing becomes unreachable.
 *   - The list is mechanical to re-derive. From the site repo:
 *
 *       grep -rhoE '(pageCopy|pageDescription|pageLead)\("[^"]+"' src \
 *         | sed 's/.*("//;s/"$//' | sort -u
 *       grep -rhoE '(whyChoose|articleBio)\("[^"]+"' src \
 *         | sed 's/.*("//;s/"$//' | sort -u
 *
 * ── Why the two kinds are marked ──────────────────────────────────────────────
 *
 * A meta description is what Google prints under the link: one sentence, and
 * truncated past roughly 155 characters. Body copy is prose on the page. They
 * are written differently, so the editor says which is which and counts the
 * characters on the ones where the count matters.
 *
 * A blank key is always safe. `pageDescription()` falls back to a sentence built
 * from the surgeon's own record — their name, title and metro — which asserts
 * nothing that is not already theirs. Body copy simply renders nothing.
 */

export type CopyKind = "meta" | "body"

export interface CopyKey {
  key: string
  label: string
  hint?: string
  kind: CopyKind
}

export interface CopyGroup {
  id: string
  label: string
  /** One line, explaining what part of the site this group covers. */
  blurb: string
  keys: CopyKey[]
}

/** Roughly where Google truncates a description. Advisory, never enforced. */
export const META_LENGTH_GUIDE = 155

export const PAGE_COPY_GROUPS: CopyGroup[] = [
  {
    id: "home",
    label: "Home",
    blurb: "The front page and what search engines print beneath it.",
    keys: [
      { key: "home.description", label: "Search description", kind: "meta" },
      {
        key: "home.intro",
        label: "Opening paragraph",
        hint: "The first thing a patient reads about this surgeon.",
        kind: "body",
      },
      { key: "home.intro2", label: "Second paragraph", kind: "body" },
      {
        key: "home.research",
        label: "Research paragraph",
        hint: "The homepage's summary of their research. Omit for a surgeon who does none.",
        kind: "body",
      },
    ],
  },
  {
    id: "about",
    label: "About",
    blurb: "The biography page. Its paragraphs live under Biography; this is the search snippet.",
    keys: [{ key: "about.description", label: "Search description", kind: "meta" }],
  },
  {
    id: "expertise",
    label: "Expertise overview",
    blurb: "The hub page and the sections without their own article set.",
    keys: [
      { key: "expertise.lead", label: "Overview lead", kind: "meta" },
      { key: "expertise.trauma.description", label: "Trauma — search description", kind: "meta" },
      {
        key: "expertise.hip.lead",
        label: "Hip — opening paragraph",
        kind: "body",
      },
      {
        key: "expertise.hip.hamstring-gluteal-tendon-repair.description",
        label: "Hamstring & gluteal tendon repair — search description",
        kind: "meta",
      },
    ],
  },
  {
    id: "shoulder",
    label: "Shoulder",
    blurb: "The shoulder hub and its seven articles.",
    keys: [
      { key: "expertise.shoulder.copy1", label: "Hub — first block", kind: "body" },
      { key: "expertise.shoulder.copy2", label: "Hub — second block", kind: "body" },
      { key: "expertise.shoulder.copy3", label: "Hub — lead", kind: "meta" },
      { key: "expertise.shoulder.copy4", label: "Hub — closing block", kind: "body" },
      {
        key: "expertise.shoulder.rotator-cuff-repair.description",
        label: "Rotator cuff repair — search description",
        kind: "meta",
      },
      {
        key: "expertise.shoulder.shoulder-replacement.description",
        label: "Shoulder replacement — search description",
        kind: "meta",
      },
      {
        key: "expertise.shoulder.shoulder-instability.description",
        label: "Shoulder instability — search description",
        kind: "meta",
      },
      {
        key: "expertise.shoulder.shoulder-impingement.description",
        label: "Shoulder impingement — search description",
        kind: "meta",
      },
      {
        key: "expertise.shoulder.shoulder-separation.description",
        label: "Shoulder separation — search description",
        kind: "meta",
      },
      {
        key: "expertise.shoulder.frozen-shoulder.description",
        label: "Frozen shoulder — search description",
        kind: "meta",
      },
      {
        key: "expertise.shoulder.clavicle-fracture.description",
        label: "Clavicle fracture — search description",
        kind: "meta",
      },
    ],
  },
  {
    id: "knee",
    label: "Knee",
    blurb: "Knee articles.",
    keys: [
      {
        key: "expertise.knee.acl-reconstruction.description",
        label: "ACL reconstruction — search description",
        kind: "meta",
      },
      {
        key: "expertise.knee.patellar-instability.description",
        label: "Patellar instability — search description",
        kind: "meta",
      },
    ],
  },
  {
    id: "sports-medicine",
    label: "Sports medicine",
    blurb: "The sports-medicine hub and its four articles.",
    keys: [
      { key: "expertise.sports-medicine.copy1", label: "Hub — first block", kind: "body" },
      { key: "expertise.sports-medicine.copy2", label: "Hub — lead", kind: "meta" },
      { key: "expertise.sports-medicine.copy3", label: "Hub — second block", kind: "body" },
      { key: "expertise.sports-medicine.copy4", label: "Hub — closing block", kind: "body" },
      {
        key: "expertise.sports-medicine.achilles-tendon-rupture.description",
        label: "Achilles tendon rupture — search description",
        kind: "meta",
      },
      {
        key: "expertise.sports-medicine.distal-biceps-repair.description",
        label: "Distal biceps repair — search description",
        kind: "meta",
      },
      {
        key: "expertise.sports-medicine.tennis-elbow.description",
        label: "Tennis elbow — search description",
        kind: "meta",
      },
      {
        key: "expertise.sports-medicine.tommy-john-ucl.description",
        label: "Tommy John (UCL) — search description",
        kind: "meta",
      },
    ],
  },
  {
    id: "research",
    label: "Research",
    blurb:
      "The research pages. All of this is one person's record — none of it carries over from another surgeon.",
    keys: [
      { key: "research.description", label: "Search description", kind: "meta" },
      {
        key: "research.og",
        label: "Social-share description",
        hint: "Shown when the page is pasted into a message. Usually the same as the search description.",
        kind: "meta",
      },
      {
        key: "research.schema",
        label: "Structured-data description",
        hint: "What search engines read as the page's summary, separate from the snippet.",
        kind: "meta",
      },
      { key: "research.lead", label: "Opening lead", kind: "meta" },
      {
        key: "research.numbers",
        label: "Figures paragraph",
        hint: "The prose around the counts. The counts themselves come from Research figures.",
        kind: "body",
      },
      {
        key: "research.publications.copy1",
        label: "Publications page — first block",
        kind: "body",
      },
      {
        key: "research.publications.copy2",
        label: "Publications page — second block",
        kind: "body",
      },
    ],
  },
  {
    id: "medical-legal",
    label: "Medical-legal",
    blurb: "The expert-witness pages. Where examinations happen comes from Clinics.",
    keys: [
      { key: "medical-legal.lead", label: "Opening lead", kind: "body" },
      {
        key: "medical-legal.imes",
        label: "Examinations paragraph",
        hint: "Also appended to the IME page's search description.",
        kind: "body",
      },
    ],
  },
  {
    id: "reviews",
    label: "Reviews",
    blurb: "The reviews page. The reviews themselves are under Reviews.",
    keys: [{ key: "reviews.description", label: "Search description", kind: "meta" }],
  },
  {
    id: "spanish",
    label: "Spanish",
    blurb:
      "The Spanish site. Written in Spanish — these are not translated automatically, and an empty key simply leaves that part of the page out.",
    keys: [
      { key: "es.home.copy5", label: "Home — search description", kind: "meta" },
      { key: "es.home.copy1", label: "Home — first credential line", kind: "body" },
      { key: "es.home.copy2", label: "Home — second credential line", kind: "body" },
      { key: "es.home.copy3", label: "Home — third credential line", kind: "body" },
      { key: "es.home.copy4", label: "Home — fourth credential line", kind: "body" },
      { key: "es.about.copy1", label: "Biography — search description", kind: "meta" },
      { key: "es.about.copy2", label: "Biography — lead", kind: "meta" },
      { key: "es.about.copy3", label: "Biography — first paragraph", kind: "body" },
      { key: "es.about.copy4", label: "Biography — second paragraph", kind: "body" },
      {
        key: "reparacion-manguito-rotador.es-bio",
        label: "Rotator cuff repair — why patients choose",
        kind: "body",
      },
      {
        key: "reemplazo-de-hombro.es-bio",
        label: "Shoulder replacement — why patients choose",
        kind: "body",
      },
      {
        key: "reconstruccion-lca.es-bio",
        label: "ACL reconstruction — why patients choose",
        kind: "body",
      },
    ],
  },
]

/** Every labelled key, for spotting the ones in the data that are not here. */
export const KNOWN_COPY_KEYS: ReadonlySet<string> = new Set(
  PAGE_COPY_GROUPS.flatMap((g) => g.keys.map((k) => k.key)),
)

/**
 * The list-valued copy keys. Only one so far, which is why the editor gives
 * them a single small section rather than a group structure of their own.
 */
export const PAGE_LIST_KEYS: CopyKey[] = [
  {
    key: "es.about.focus",
    label: "Biography — areas of focus (Spanish)",
    hint: "One bullet per box, on the Spanish biography page.",
    kind: "body",
  },
]

export const KNOWN_LIST_KEYS: ReadonlySet<string> = new Set(PAGE_LIST_KEYS.map((k) => k.key))

/**
 * The articles that close with "Why patients choose …".
 *
 * A surgeon with no entry for an article gets no section — the site returns an
 * empty array that spreads to nothing. That is the point: a missing paragraph,
 * never another surgeon's training under this one's name.
 *
 * The three Spanish equivalents are not here; they are ordinary `pageCopy` keys
 * under Spanish, because the Spanish articles were built that way.
 */
export const ARTICLE_BIO_KEYS: { key: string; label: string; area: string }[] = [
  { key: "rotator-cuff-repair", label: "Rotator cuff repair", area: "Shoulder" },
  { key: "shoulder-replacement", label: "Shoulder replacement", area: "Shoulder" },
  { key: "shoulder-instability", label: "Shoulder instability", area: "Shoulder" },
  { key: "shoulder-impingement", label: "Shoulder impingement", area: "Shoulder" },
  { key: "shoulder-separation", label: "Shoulder separation", area: "Shoulder" },
  { key: "frozen-shoulder", label: "Frozen shoulder", area: "Shoulder" },
  { key: "clavicle-fracture", label: "Clavicle fracture", area: "Shoulder" },
  { key: "acl-reconstruction", label: "ACL reconstruction", area: "Knee" },
  { key: "meniscus-tear", label: "Meniscus tear", area: "Knee" },
  { key: "patellar-instability", label: "Patellar instability", area: "Knee" },
  { key: "labral-tear-fai", label: "Hip labral tear & FAI", area: "Hip" },
  {
    key: "hamstring-gluteal-tendon-repair",
    label: "Hamstring & gluteal tendon repair",
    area: "Hip",
  },
  {
    key: "achilles-tendon-rupture",
    label: "Achilles tendon rupture",
    area: "Sports medicine",
  },
  { key: "distal-biceps-repair", label: "Distal biceps repair", area: "Sports medicine" },
  { key: "tennis-elbow", label: "Tennis elbow", area: "Sports medicine" },
  { key: "tommy-john-ucl", label: "Tommy John (UCL)", area: "Sports medicine" },
]

export const KNOWN_ARTICLE_KEYS: ReadonlySet<string> = new Set(ARTICLE_BIO_KEYS.map((k) => k.key))

/** Keys present in stored copy that this manifest does not name. */
export function unknownKeys(
  stored: Record<string, unknown>,
  known: ReadonlySet<string>,
): string[] {
  return Object.keys(stored)
    .filter((k) => !known.has(k))
    .sort()
}

/** How many of a group's keys the surgeon has actually written. */
export function filledCount(stored: Record<string, string>, keys: CopyKey[]): number {
  return keys.filter((k) => (stored[k.key] ?? "").trim().length > 0).length
}
