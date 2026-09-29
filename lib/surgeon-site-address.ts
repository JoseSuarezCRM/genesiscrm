/**
 * Naming, and validating, one editable field on a surgeon site.
 *
 * The preview frame can ask this app to change a field. That request crosses an
 * origin boundary from a public marketing site, so it is untrusted input in the
 * same way a URL parameter is, and this module is where it stops being that.
 *
 * ── Why an allow-list and not a blocklist ────────────────────────────────────
 *
 * A blocklist of "fields the site may not touch" is a list someone has to keep
 * complete as the record grows. An allow-list is a list someone has to extend to
 * make a new field editable — and forgetting means the field is not editable,
 * which is a nuisance rather than a hole. The failure modes are not symmetric,
 * so the direction is not a matter of taste.
 *
 * What is deliberately absent: `domain`, `baseUrl`, `previewDomains`, `slug`,
 * `status`, `redirectUrl` and `searchConsoleToken`. Those decide which site this
 * is and where it is served — routing and identity, not copy. A page that could
 * rewrite its own domain is a page that can point a physician's name at
 * somewhere else entirely.
 *
 * Images appear here as paths but never as values. The frame may say "the
 * headshot was clicked"; only this app, through its own media library, decides
 * what the headshot becomes. Otherwise a compromised marketing bundle could
 * write a foreign URL into the record, and the next build would download it.
 */

import {
  KNOWN_ARTICLE_KEYS, KNOWN_COPY_KEYS, KNOWN_IMAGE_KEYS, KNOWN_LIST_KEYS,
} from "@/lib/surgeon-site-copy"

export type ContentSegment = string | number
export type ContentPath = ContentSegment[]

/** Keys that must never be walked into. The classic prototype-pollution route. */
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"])

type Matcher =
  | { lit: string }
  | { index: true }
  | { oneOf: readonly string[] }
  | { from: ReadonlySet<string> }

const IDX: Matcher = { index: true }
const COPY_KEY: Matcher = { from: KNOWN_COPY_KEYS }
const ARTICLE_KEY: Matcher = { from: KNOWN_ARTICLE_KEYS }
const LIST_KEY: Matcher = { from: KNOWN_LIST_KEYS }
const IMAGE_KEY: Matcher = { from: KNOWN_IMAGE_KEYS }

const lit = (s: string): Matcher => ({ lit: s })
const one = (...s: string[]): Matcher => ({ oneOf: s })

/** Clinic fields staff may retype in place. Structure stays in the CRM's forms. */
const CLINIC_FIELDS = one(
  "name", "city", "day", "street", "suite", "cityStateZip", "mapQuery",
  "bookingUrl", "googleReviewUrl", "lead", "seoTitle", "seoDescription",
)
const CLINIC_ES_FIELDS = one("day", "lead", "areas", "seoTitle", "seoDescription")

/** Plain text fields that describe the surgeon rather than route the site. */
const SCALARS = [
  "name", "shortName", "credential", "title", "description",
  "group", "groupUrl", "region", "metro",
  "phone", "phoneE164", "fax", "faxE164", "email",
  "linkedin", "researchProfile",
]

/** Image fields: addressable, but their value comes from the media library. */
const IMAGE_FIELD_LIST = ["headshot", "headshotSecondary", "portraitAtWork", "schemaImagePath"]
const IMAGE_FIELDS = new Set(IMAGE_FIELD_LIST)

const RULES: Matcher[][] = [
  ...SCALARS.map((f) => [lit(f)]),
  ...IMAGE_FIELD_LIST.map((f) => [lit(f)]),

  [lit("pageCopy"), COPY_KEY],
  [lit("articleBios"), ARTICLE_KEY],
  [lit("pageLists"), LIST_KEY, IDX],
  // Shared photographs: addressable by name only. A per-page replacement key is
  // built here from a validated page path, never taken from the frame.
  [lit("pageImages"), IMAGE_KEY],

  [lit("profile"), lit("bio"), IDX],
  [lit("profile"), lit("cards"), IDX, one("title", "description", "icon")],
  [lit("profile"), lit("highlights"), IDX, one("title", "body")],
  [lit("profile"), lit("facts"), IDX, one("label", "value", "icon")],

  [lit("credentials"), IDX, one("label", "detail")],
  [lit("medicalLegalCredentials"), IDX, one("label", "detail")],
  [lit("alumniOf"), IDX],
  [lit("sameAs"), IDX],
  [lit("areaServed"), IDX],

  [lit("clinics"), IDX, CLINIC_FIELDS],
  [lit("clinics"), IDX, lit("intro"), IDX],
  [lit("clinics"), IDX, lit("es"), CLINIC_ES_FIELDS],
  [lit("clinics"), IDX, lit("es"), lit("intro"), IDX],

  [lit("reviews"), IDX, one("quote", "office", "date")],
  [lit("researchStats"), IDX, one("label", "value")],
  [lit("researchThemes"), IDX, one("title", "body")],
  [lit("researchVenues"), IDX],
  [lit("researchMeetings"), IDX],
  [lit("protocolGroups"), IDX, lit("group")],
  [lit("protocolGroups"), IDX, lit("items"), IDX, one("name")],
]

function segmentMatches(m: Matcher, seg: ContentSegment): boolean {
  if ("lit" in m) return seg === m.lit
  if ("index" in m) return typeof seg === "number" && Number.isInteger(seg) && seg >= 0
  if ("oneOf" in m) return typeof seg === "string" && m.oneOf.includes(seg)
  return typeof seg === "string" && m.from.has(seg)
}

/** Shape and safety only — says nothing about whether the field is editable. */
export function isWellFormedPath(path: unknown): path is ContentPath {
  return (
    Array.isArray(path) &&
    path.length > 0 &&
    path.length <= 8 &&
    path.every(
      (s) =>
        (typeof s === "string" && s.length > 0 && s.length <= 120 && !FORBIDDEN.has(s)) ||
        (typeof s === "number" && Number.isInteger(s) && s >= 0 && s < 5000),
    )
  )
}

/** Whether the preview frame may address this field at all. */
export function isEditablePath(path: unknown): path is ContentPath {
  if (!isWellFormedPath(path)) return false
  return RULES.some(
    (rule) => rule.length === path.length && rule.every((m, i) => segmentMatches(m, path[i]!)),
  )
}

/** Whether this field's value is chosen here rather than sent by the frame. */
export function isImagePath(path: ContentPath): boolean {
  if (path[0] === "pageImages") return true
  return path.length === 1 && typeof path[0] === "string" && IMAGE_FIELDS.has(path[0])
}

/**
 * A page path reported by the frame, if it is a plausible one.
 *
 * It becomes a key on the record ("replace this page's hero only"), so it is
 * held to the shape of a real route: absolute, lowercase segments, no dots, no
 * query. Anything else is refused rather than stored.
 */
export function safePagePath(page: unknown): string | null {
  if (typeof page !== "string" || page.length > 200) return null
  return /^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/.test(page) ? page : null
}

/**
 * A copy of `root` with `path` set to `value`.
 *
 * Clones only the containers along the path, so nothing already rendered is
 * mutated underneath React.
 *
 * Returns `root` unchanged when the path does not already lead somewhere. An
 * inline edit changes a thing that exists; it never creates one. Adding and
 * removing entries stays in the CRM's own forms, which can keep the rest of the
 * record consistent — and it means a hostile index cannot extend an array.
 */
export function setAtPath<T>(root: T, path: ContentPath, value: unknown): T {
  const [head, ...rest] = path
  if (head === undefined) return root

  if (Array.isArray(root)) {
    if (typeof head !== "number" || head < 0 || head >= root.length) return root
    const next = [...root]
    next[head] = rest.length === 0 ? value : setAtPath(root[head], rest, value)
    return next as unknown as T
  }

  if (typeof root === "object" && root !== null) {
    const obj = root as Record<string, unknown>
    if (typeof head !== "string" || !Object.prototype.hasOwnProperty.call(obj, head)) return root
    return {
      ...obj,
      [head]: rest.length === 0 ? value : setAtPath(obj[head], rest, value),
    } as unknown as T
  }

  return root
}

/** The value at `path`, or undefined if the path does not lead anywhere. */
export function getAtPath(root: unknown, path: ContentPath): unknown {
  let node: unknown = root
  for (const seg of path) {
    if (node === null || typeof node !== "object") return undefined
    if (Array.isArray(node)) {
      if (typeof seg !== "number") return undefined
      node = node[seg]
    } else {
      if (typeof seg !== "string") return undefined
      const obj = node as Record<string, unknown>
      if (!Object.prototype.hasOwnProperty.call(obj, seg)) return undefined
      node = obj[seg]
    }
  }
  return node
}

/**
 * Which editor section fixes this path.
 *
 * The frame says which field was clicked; the rail has to open somewhere. A path
 * with no mapping simply leaves the rail where it is rather than guessing.
 */
export function sectionForPath(path: ContentPath): string | null {
  const head = path[0]
  if (typeof head !== "string") return null
  switch (head) {
    case "pageCopy":
    case "pageLists":
      return "copy"
    case "articleBios":
      return "articles"
    case "profile":
      return path[1] === "bio" ? "bio" : "profile"
    case "credentials":
    case "alumniOf":
      return "credentials"
    case "medicalLegalCredentials":
      return "medical-legal"
    case "clinics":
      return "clinics"
    case "reviews":
      return "reviews"
    case "researchStats":
    case "researchThemes":
    case "researchVenues":
    case "researchMeetings":
      return "research"
    case "protocolGroups":
      return "protocols"
    case "headshot":
    case "headshotSecondary":
    case "portraitAtWork":
    case "schemaImagePath":
      return "images"
    case "sameAs":
    case "areaServed":
      return "reach"
    case "name":
    case "shortName":
    case "credential":
    case "title":
    case "description":
      return "identity"
    default:
      return "contact"
  }
}
