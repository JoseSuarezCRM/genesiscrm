/**
 * The practice itself — the things every surgeon's site shares.
 *
 * This is the second half of the contract with the site app. `lib/surgeon-site.ts`
 * describes one physician; this describes the organisation they all work for:
 * the office roster, the insurance lists, the medical-legal contacts, the hours.
 *
 * ── Why this is not on each surgeon ───────────────────────────────────────────
 *
 * All of it lived in the site app's code, and the office roster carried a
 * per-surgeon `seesPatients` flag — which is how a second surgeon's contact page
 * came to list Dr. Horner's three clinics, with addresses, as their own.
 *
 * Copying it onto six surgeon records instead would mean the same fourteen
 * addresses stored six times, and correcting one office meaning six edits. It is
 * genuinely organisation-level, so it is stored once.
 *
 * **Which offices a given surgeon works at still comes from their own record.**
 * This roster only ever answers "what other offices does the practice have".
 *
 * Stored as JSON in `Practice.content` for the same reason a surgeon's is: it is
 * mostly nested lists, and pinning them as columns would mean a schema push
 * every time the marketing site grew a section.
 */

export interface PracticeOffice {
  /** Short label as the site prints it: "Oak Brook", "Chicago — Merchandise Mart". */
  name: string
  /** Address lines, in display order. */
  lines: string[]
}

export interface PracticeHours {
  /** "Monday" … "Sunday". */
  day: string
  /** As displayed: "8:00am – 5:30pm", or "Closed". */
  time: string
}

export interface InsuranceCategory {
  title: string
  plans: string[]
}

export interface PracticeMedicalLegal {
  /** Where case-review enquiries go. */
  inquiryEmail: string
  /** The person who handles them, named on the page. */
  inquiryContact: string
  imeSchedulingUrl: string
  depositionSchedulingUrl: string
  /** As displayed: "3–7 business days". */
  turnaround: string
  /** The state the surgeons are licensed in, as the pages word it. */
  licensure: string
}

export interface PracticeContent {
  /** "Genesis Orthopedics & Sports Medicine". */
  name: string
  /** The practice's own website. */
  url: string
  /**
   * The shared appointment line, as displayed and in E.164.
   *
   * Every surgeon record also carries a phone, and today they are the same
   * number. The site still reads the surgeon's, because a surgeon could be given
   * a direct line; this is the practice default a new surgeon should be seeded
   * with. If they ever diverge, the surgeon's wins on their own site.
   */
  phone: string
  phoneE164: string
  /**
   * Every office the practice runs, including ones no surgeon on these sites
   * attends. The contact pages list the ones the current surgeon does NOT work
   * at, under a heading that says exactly that.
   */
  offices: PracticeOffice[]
  hours: PracticeHours[]
  insuranceCategories: InsuranceCategory[]
  networkAffiliations: string[]
  medicalLegal: PracticeMedicalLegal
}

/** A practice with nothing filled in. */
export function emptyPractice(): PracticeContent {
  return {
    name: "",
    url: "",
    phone: "",
    phoneE164: "",
    offices: [],
    hours: [],
    insuranceCategories: [],
    networkAffiliations: [],
    medicalLegal: {
      inquiryEmail: "",
      inquiryContact: "",
      imeSchedulingUrl: "",
      depositionSchedulingUrl: "",
      turnaround: "",
      licensure: "",
    },
  }
}

/** Read stored JSON back, filling anything a newer field added. */
export function parsePractice(raw: unknown): PracticeContent {
  const base = emptyPractice()
  const v = (raw as Partial<PracticeContent>) ?? {}
  return {
    ...base,
    ...v,
    // Nested object, so a spread alone would drop fields added later.
    medicalLegal: { ...base.medicalLegal, ...(v.medicalLegal ?? {}) },
  }
}

/**
 * What the practice is missing before the sites can rely on it.
 *
 * Advisory, not a gate: unlike a surgeon's credentials, a thin practice record
 * degrades a page rather than making a false claim about a person. The editor
 * shows this so it is a choice rather than a surprise.
 */
export function practiceGaps(p: PracticeContent): string[] {
  const gaps: string[] = []
  if (!p.name.trim()) gaps.push("Practice name")
  if (!p.phone.trim()) gaps.push("Appointment phone number")
  if (p.offices.length === 0) gaps.push("At least one office")
  if (p.hours.length === 0) gaps.push("Opening hours")
  if (p.insuranceCategories.length === 0) gaps.push("Insurance list — the Insurances page will be empty")
  if (!p.medicalLegal.inquiryEmail.trim()) gaps.push("Medical-legal enquiry email")
  return gaps
}
