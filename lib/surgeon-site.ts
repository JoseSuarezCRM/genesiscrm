/**
 * The shape of a surgeon site's content.
 *
 * This is a *contract with a different codebase*. The public site app
 * (chicagocare-drhorner-site) reads it over the API and renders from it, so the
 * types here mirror its `src/lib/surgeon.ts` and the two must be changed
 * together. Nothing else in the CRM depends on this shape, which is why it lives
 * in one file rather than being spread across columns.
 *
 * It is stored as JSON in `SurgeonSite.content` deliberately: a surgeon record
 * is mostly nested lists — clinics, credentials, reviews, protocols,
 * publications — and pinning those as columns would mean a schema push every
 * time the marketing site grew a section.
 *
 * ── Why so much of this is required ───────────────────────────────────────────
 *
 * Most of these fields are claims about one person's training and experience.
 * Publishing one surgeon's fellowship, residency, team-physician history or
 * publication record under another's name is a false statement about a
 * physician's credentials — an FTC deceptive-advertising exposure and a state
 * medical-board advertising violation, not a content bug.
 *
 * The site app enforces this with required types. The CRM enforces it at publish
 * time: `missingCredentials()` below lists what is unfilled, and publishing is
 * refused while anything on that list is empty. The failure mode has to be "this
 * site cannot go live", never "it went live with someone else's CV".
 */

export interface SurgeonCredential {
  label: string
  detail: string
}

export interface SurgeonClinic {
  slug: string
  name: string
  /** Used for schema.org areaServed; may differ from `name`. */
  city: string
  /** Plural, as written in prose: "Mondays". */
  day: string
  street: string
  suite?: string
  cityStateZip: string
  /** Free text handed to Google Maps search. */
  mapQuery: string
  bookingUrl: string
  googleReviewUrl?: string
  lead: string
  intro: string[]
  seoTitle: string
  seoDescription: string
  /** Spanish copy. A clinic without it is absent from the Spanish site. */
  es?: {
    day: string
    lead: string
    intro: string[]
    areas: string
    seoTitle: string
    seoDescription: string
  }
}

export interface SurgeonReview {
  /** Verbatim as published. Never edit or paraphrase — see the note below. */
  quote: string
  office?: string
  source: "Google" | "Zocdoc"
  rating: 1 | 2 | 3 | 4 | 5
  date?: string
}

export interface SurgeonProtocolGroup {
  group: string
  items: { name: string; href: string }[]
}

export interface SurgeonPublication {
  title: string
  year: number
  date: string
  journal: string
  type: string
  url: string
}

export interface SurgeonProfile {
  cards: { icon: string; title: string; description: string }[]
  highlights: { title: string; body: string }[]
  facts: { icon: string; label: string; value: string }[]
  /** About-page narrative, one string per paragraph. */
  bio: string[]
}

export interface SurgeonSiteContent {
  // ── Identity ──────────────────────────────────────────────────────────────
  /** Full display name with credential: "Nolan Horner, MD". */
  name: string
  /** How prose refers to them: "Dr. Horner". */
  shortName: string
  /** Post-nominal alone: "MD". */
  credential: string
  title: string
  /** Origin, no trailing slash. Every canonical and schema URL derives from it. */
  baseUrl: string
  /**
   * Extra hosts the site also answers on while its real domain still points
   * elsewhere — a workers.dev address, a staging subdomain.
   *
   * Canonical URLs keep pointing at `baseUrl`, and the site app marks pages
   * served on these hosts `noindex`: a crawlable duplicate of a live site
   * competes with it or is read as duplicated content.
   */
  previewDomains?: string[]

  // ── Credentials and biography. Never inherited. ───────────────────────────
  credentials: SurgeonCredential[]
  /** As the medical-legal pages state them — different content, different purpose. */
  medicalLegalCredentials: SurgeonCredential[]
  alumniOf: string[]
  linkedin: string
  sameAs: string[]
  researchProfile?: string
  description: string
  headshot: string
  schemaImagePath: string
  /**
   * A second portrait (the About hero) and the surgeon at work.
   *
   * Required on the site app's `Surgeon` type, so they belong here too — this
   * module exists to mirror that type, and a field missing here is a field the
   * site can never be given. They were added after five routes were found
   * importing one surgeon's photographs directly, which put his face on every
   * other surgeon's domain.
   *
   * Blank is safe: the site renders nothing rather than falling back to someone
   * else's likeness. That is why publishing is not blocked on them.
   */
  headshotSecondary: string
  portraitAtWork: string

  // ── Practice and contact ──────────────────────────────────────────────────
  group: string
  groupUrl: string
  /** Marketing region, as it reads in prose: "Chicagoland". */
  region: string
  /** The metro named in titles: "Chicago". Distinct from `region` and any clinic. */
  metro: string
  phone: string
  phoneE164: string
  fax: string
  faxE164: string
  email: string

  clinics: SurgeonClinic[]
  areaServed: string[]
  /** BCP-47 codes the site publishes in. */
  languages: string[]
  /** Per *domain*, not per person. A new site needs its own token. */
  searchConsoleToken?: string

  // ── Per-surgeon content ───────────────────────────────────────────────────
  /**
   * Verbatim patient reviews. A review is a real person's statement about a
   * specific doctor: rewriting one to name someone else is fabricating a
   * testimonial, which the FTC's rule on fake reviews treats as deceptive.
   * Empty is correct for a surgeon with none — the page links Google instead.
   */
  reviews: SurgeonReview[]
  /** This surgeon's own post-op instructions. Handing out another's is clinical. */
  protocolGroups: SurgeonProtocolGroup[]
  protocolsSourceUrl?: string
  publications: SurgeonPublication[]
  researchStats: { label: string; value: string }[]
  /** The "why patients choose…" paragraph per article, keyed by article slug. */
  articleBios: Record<string, string>
  profile: SurgeonProfile
  /** Per-page copy that describes the surgeon, keyed by page. */
  pageCopy: Record<string, string>
  pageLists: Record<string, string[]>
}

/** A new site starts empty rather than pre-filled with anyone's details. */
export function emptyContent(): SurgeonSiteContent {
  return {
    name: "",
    shortName: "",
    credential: "MD",
    title: "",
    baseUrl: "",
    previewDomains: [],
    credentials: [],
    medicalLegalCredentials: [],
    alumniOf: [],
    linkedin: "",
    sameAs: [],
    description: "",
    headshot: "",
    schemaImagePath: "",
    headshotSecondary: "",
    portraitAtWork: "",
    group: "Genesis Orthopedics & Sports Medicine",
    groupUrl: "https://genesisortho.com/",
    region: "",
    metro: "",
    phone: "",
    phoneE164: "",
    fax: "",
    faxE164: "",
    email: "",
    clinics: [],
    areaServed: [],
    languages: ["en"],
    reviews: [],
    protocolGroups: [],
    publications: [],
    researchStats: [],
    articleBios: {},
    profile: { cards: [], highlights: [], facts: [], bio: [] },
    pageCopy: {},
    pageLists: {},
  }
}

/** Read stored JSON back as content, filling anything a newer field added. */
export function parseContent(raw: unknown): SurgeonSiteContent {
  return { ...emptyContent(), ...((raw as Partial<SurgeonSiteContent>) ?? {}) }
}

/**
 * What a site is missing before it can be published, in plain words.
 *
 * Two kinds of check. The first is ordinary completeness — a site with no name
 * or no domain is not finished. The second is the one that matters: the fields
 * that describe *this* surgeon's training must be filled by this surgeon,
 * because a blank here is what would otherwise be papered over with whatever the
 * template shipped with.
 *
 * Returns an empty array when the site is publishable.
 */
export function missingCredentials(content: SurgeonSiteContent, domain: string | null): string[] {
  const missing: string[] = []

  if (!content.name.trim()) missing.push("Full name")
  if (!content.shortName.trim()) missing.push('Short name (e.g. "Dr. Horner")')
  if (!content.title.trim()) missing.push("Professional title")
  if (!domain?.trim()) missing.push("Domain")
  if (!content.baseUrl.trim()) missing.push("Site URL")
  if (!content.email.trim()) missing.push("Contact email")
  if (!content.phone.trim()) missing.push("Phone number")
  if (content.clinics.length === 0) missing.push("At least one clinic")

  // The credential checks. Blank here means the page would either say nothing
  // about who this surgeon is, or — the thing being prevented — say something
  // that is true of someone else.
  if (content.credentials.length === 0) missing.push("Credentials (board certification, training)")
  if (!content.description.trim()) missing.push("One-line description, used in search results")
  if (content.profile.bio.length === 0) missing.push("Biography paragraphs for the About page")

  // A clinic with no Spanish copy is simply absent from the Spanish site, which
  // is fine. A clinic missing its English copy is a broken page.
  for (const c of content.clinics) {
    if (!c.name.trim() || !c.slug.trim()) missing.push("A clinic is missing its name or slug")
    else if (!c.lead.trim()) missing.push(`Clinic "${c.name}" has no introduction`)
  }

  return Array.from(new Set(missing))
}

/** Slugify a name for use as a site key: "Nolan Horner, MD" -> "nolan-horner". */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/,.*$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
