/**
 * The rules-based parser from the original referral-intake HTML tool, ported
 * verbatim.
 *
 * It runs on every keystroke in the paste box: free, instant, and entirely in
 * the browser. The AI result refines it; when the AI is slow, busy or declines,
 * this is what the form shows.
 *
 * "Verbatim" is enforced, not aspired to: `scripts/referral-calls-parity.ts`
 * runs this and the vendored original (`scripts/fixtures/referral-calls/
 * original-parser.js`) on thousands of inputs and fails on any difference. So:
 * same regexes, same order of checks, same quirks. Change behaviour here only
 * deliberately. CRM-specific conversions belong in `schema.ts`, not here.
 */

import { emptyFields, type ReferralCallFields } from "./types"

export function parseReferral(text: string): ReferralCallFields {
  const out: ReferralCallFields = emptyFields()
  const plan: string[] = []; const addPlan = (p: string) => { if (!plan.includes(p)) plan.push(p) }
  const labs: string[] = [], meds: string[] = []
  if (!text || !text.trim()) return out
  const junk = [/^click to clear/i, /reply\s+stop/i, /msg\s*&\s*data/i, /rates may apply/i, /^https?:\/\//i, /^[-_=*.\s]+$/, /^\d{1,2}\s*\/\s*\d{1,2}$/, /^(sent|received)\s+(from|via)/i]
  const urgentRe = /\b(urgent|stat|emergent|asap)\b/i
  const dateRe = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/
  const phoneRe = /(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/
  const facilityRe = /\b(er|ed|hospital|center|centre|clinic|medical|health|urgent care|immediate care|ortho|orthopedic|office|practice|associates|group|emergency|icu|floor|unit|rehab|snf|nursing)\b/i
  const drugs: Record<string, string> = { warfarin: "Warfarin", coumadin: "Warfarin", jantoven: "Warfarin", eliquis: "Eliquis", apixaban: "Eliquis", xarelto: "Xarelto", rivaroxaban: "Xarelto", pradaxa: "Pradaxa", dabigatran: "Pradaxa", savaysa: "Savaysa", edoxaban: "Savaysa", lovenox: "Lovenox", enoxaparin: "Lovenox", heparin: "Heparin", plavix: "Plavix", clopidogrel: "Plavix", brilinta: "Brilinta", ticagrelor: "Brilinta", effient: "Effient", prasugrel: "Effient", aspirin: "Aspirin", asa: "Aspirin" }
  const drugRe = new RegExp("\\b(" + Object.keys(drugs).join("|") + ")\\b", "gi")
  const fmtPhone = (s: string) => { const m = String(s).match(phoneRe); return m ? `${m[1]}-${m[2]}-${m[3]}` : String(s).trim() }
  const tidy = (s: string) => s.replace(/\s+/g, " ").replace(/[.;,\s]+$/, "").trim()
  const fixAbbr = (s: string) => s.replace(/\b(er|ed|icu|pacu|snf|alf)\b/gi, (m) => m.toUpperCase())
  const acList: string[] = [], social: string[] = [], pmh: string[] = [], hpi: string[] = [], extra: string[] = []
  const unlabeled: { text: string; afterCaller: boolean }[] = []
  const addDrugs = (s: string) => { let m: RegExpExecArray | null; drugRe.lastIndex = 0; while ((m = drugRe.exec(s))) { const d = drugs[m[1]!.toLowerCase()]!; if (!acList.includes(d)) acList.push(d) } }
  let caller = "", cid = "", mrn = "", name = "", prevKey = "", genericThinner = false

  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean)
  for (const raw of lines) {
    if (junk.some((r) => r.test(raw))) continue
    if (urgentRe.test(raw)) out.urgent = true
    const bare = raw.replace(urgentRe, "").replace(/^[-:!\s]+|[-:!\s]+$/g, "")
    if (!bare) { prevKey = ""; continue }
    addDrugs(bare)
    if (/blood thinner|anticoag/i.test(bare)) genericThinner = true

    // Clinical lines first
    const lastDose = bare.match(/last dose\s*[:\-]?\s*(.+)$/i)
    if (lastDose) { out.lastDose = tidy(lastDose[1]!); continue }
    const npo = bare.match(/\bnpo\b\s*(?:since|after|from|x|:)?\s*(.*)$/i)
    if (npo && bare.length < 60) { out.npo = tidy(npo[1]!) || "yes"; continue }
    if (/\bpoa\b|power of attorney|decision[\s-]?maker|\bguardian\b|health\s?care proxy|\bproxy\b|\bsurrogate\b/i.test(bare) && bare.length < 80) {
      if (/\bown\b|\bself\b/i.test(bare) && !/\bpoa\b|attorney|guardian|proxy/i.test(bare)) { out.dm = "Own"; continue }
      out.dm = "POA"
      const ph = bare.match(phoneRe); if (ph) out.poaPhone = fmtPhone(ph[0])
      const who = tidy(bare.replace(phoneRe, "").replace(/\b(has|with|is|the|a|an)\b/gi, " ")
        .replace(/\b(poa|power of attorney|health\s?care proxy|proxy|decision[\s-]?maker|guardian|surrogate)\b/gi, " ")
        .replace(/[:\-–,()#]+/g, " ").replace(/\b(phone|ph|cell|tel)\b/gi, " "))
      if (who) out.poa = who.charAt(0).toUpperCase() + who.slice(1)
      continue
    }
    const abx = bare.match(/^(?:abx|antibiotics?)\b\s*[:\-]?\s*(.*)$/i)
    if (abx) { addPlan("Abx"); out.abx = tidy(abx[1]!); continue }
    const planHead = bare.match(/^(?:plan|outcome|dispo(?:sition)?)\s*[:\-]\s*(.+)$/i)
    const pl = planHead ? planHead[1]! : bare
    if ((planHead || bare.length < 50) && /\b(wbat|nwb|splint|clearance|outpatient|op f\/u|f\/u in (clinic|office)|planning for surgery|plan for (surgery|or)|to or)\b/i.test(pl)) {
      if (/\bwbat\b/i.test(pl)) addPlan("WBAT")
      if (/\bnwb\b/i.test(pl)) addPlan("NWB")
      if (/splint/i.test(pl)) addPlan("Splint")
      if (/clearance/i.test(pl)) addPlan("Clearance requested/pending")
      if (/planning for surgery|plan for (surgery|or)|\bto or\b/i.test(pl)) addPlan("Planning for surgery")
      if (/outpatient|op f\/u|f\/u in (clinic|office)/i.test(pl)) addPlan("Outpatient f/u needed")
      continue
    }
    const lab = bare.match(/^(?:labs?|imaging|findings|results?|xr|x-?rays?|ct|mri|us|ultrasound|inr|hgb|h\/h|cbc|bmp|wbc|cr)\b\s*[:\-]?\s*(.*)$/i)
    if (lab && bare.length < 120 && !/^(ct|mri|xr)\b.*\b(given|because|went)\b/i.test(bare)) {
      labs.push(/^(labs?|imaging|findings|results?)\b/i.test(bare) ? tidy(lab[1]!) : tidy(bare)); continue
    }
    const med = bare.match(/^(?:meds?|medications?|home meds)\s*[:\-]\s*(.+)$/i)
    if (med) { meds.push(tidy(med[1]!)); continue }
    if (bare.length >= 60 || /^(s\/p|pt is|patient is|\d+\s*(yo|y\/o|year))/i.test(bare)) { hpi.push(bare); continue }
    if (/\bhistorian\b|\blives\b|\bfrom (snf|alf|nursing|assisted)|\b(ambulat|walker|wheelchair|cane|bedbound|non-?ambulatory)|\bnursing home\b/i.test(bare) && bare.length < 60) { social.push(tidy(bare)); continue }
    const hx = bare.match(/^(?:h\/o|hx of|hx:?|history of|pmh[x]?\s*:?|past medical history\s*:?)\s*(.+)$/i)
    if (hx) { const p = hx[1]!.replace(/\s*[,;]?\s*\b(on|takes|taking)\b\s+.*$/i, ""); pmh.push(tidy(p)); continue }

    // e.g. "<Site> ER call - room <n>"
    const callRm = bare.match(/^(.+?)\s+call\b[\s,\-–]*(?:(?:room|rm|bed)\s*#?\s*(.+))?$/i)
    if (callRm && !/^(caller|call ?back)/i.test(bare)) { out.referredFrom = fixAbbr(tidy(callRm[1]!)); if (callRm[2]) out.room = tidy(callRm[2]); prevKey = ""; continue }

    const kv = bare.match(/^([A-Za-z][A-Za-z #\/.'()-]{0,28}?)\s*[:=]\s*(.+)$/)
    if (kv) {
      const k = kv[1]!.toLowerCase().replace(/[.()]/g, "").trim(), v = kv[2]!.trim()
      if (/^(pt|patient)\s*(phone|cell|mobile|number|#|ph|tel)|^(home|cell|mobile)\s*(phone)?$/.test(k)) { out.patientPhone = fmtPhone(v) }
      else if (/^(caller|called by|calling|from|contact|rn|nurse)$/.test(k)) { caller = v }
      else if (/^(phone|ph|tel|callback|call back|cb|cb#|cb #|return call|number|call)$/.test(k)) { out.callback = fmtPhone(v) }
      else if (/^(patient|pt|patient name|pt name|name)$/.test(k)) { name = v }
      else if (/^(room|rm|bed|location|loc|unit)$/.test(k)) { out.room = v }
      else if (/^(dob|date of birth|birth ?date|d\/o\/b)$/.test(k)) { out.dob = v }
      else if (/^(cid|caller id)$/.test(k)) { cid = fmtPhone(v) }
      else if (/^(mrn|med rec|fin|acct|account)$/.test(k)) { mrn = v }
      else if (/^(facility|hospital|referred from|referring|referring facility|ref from|referral from|referred by|referring provider|site)$/.test(k)) { out.referredFrom = fixAbbr(tidy(v)) }
      else if (/^(reason|re|dx|diagnosis|reason for referral|rfr|complaint|cc|chief complaint|injury|concern|regarding)$/.test(k)) { out.reason = tidy(v) }
      else if (/^(hpi|history)$/.test(k)) { hpi.push(v) }
      else if (/^(pmh|pmhx|medical history|hx)$/.test(k)) { pmh.push(tidy(v)) }
      else if (/^(blood thinner|anticoag|anticoagulation|ac)$/.test(k)) { if (!acList.length && !/^(no|none|denies)/i.test(v)) acList.push(tidy(v)); if (/^(no|none|denies)/i.test(v)) out.anticoag = "None" }
      else if (/^(social|sh)$/.test(k)) { social.push(tidy(v)) }
      else if (/^(note|notes|message|msg|comments?|details?)$/.test(k)) { extra.push(v) }
      else { extra.push(`${kv[1]!.trim()}: ${v}`) }
      prevKey = k; continue
    }
    if (!out.dob && dateRe.test(bare) && bare.replace(dateRe, "").replace(/\b(dob|born)\b/i, "").trim().length < 4) { out.dob = bare.match(dateRe)![0]; prevKey = ""; continue }
    if (phoneRe.test(bare) && bare.replace(phoneRe, "").replace(/[^a-z]/gi, "").length < 3) { if (!out.callback) out.callback = fmtPhone(bare); else extra.push(fmtPhone(bare)); prevKey = ""; continue }
    unlabeled.push({ text: bare, afterCaller: /^(caller|called by|calling|from|contact|rn|nurse)$/.test(prevKey) })
    prevKey = ""
  }

  if (!out.referredFrom) {
    let i = unlabeled.findIndex((u) => u.afterCaller)
    if (i < 0) i = unlabeled.findIndex((u) => facilityRe.test(u.text))
    if (i >= 0) { out.referredFrom = fixAbbr(tidy(unlabeled[i]!.text)); unlabeled.splice(i, 1) }
  }
  if (!out.reason && unlabeled.length) { out.reason = tidy(unlabeled.shift()!.text) }
  unlabeled.forEach((u) => extra.push(u.text))

  out.hpi = hpi.join(" ")
  if (!out.reason && out.hpi) {
    const inj = "(fx|fracture|dislocation|tear|rupture|laceration|infection|abscess)"
    const m = out.hpi.match(new RegExp("\\b(?:left|right|bilateral|l|r)\\s+[\\w/ -]{0,25}?\\b" + inj + "\\b", "i"))
      || out.hpi.match(new RegExp("\\b[\\w/-]+(?:\\s+[\\w/-]+){0,2}\\s+" + inj + "\\b", "i"))
    if (m) out.reason = tidy(m[0])
  }
  out.pmhx = pmh.join(", ")
  out.meds = meds.join(", ")
  out.labs = labs.join("\n")
  const PLAN_ORDER = ["Outpatient f/u needed", "Clearance requested/pending", "Planning for surgery", "Splint", "WBAT", "NWB", "Abx"]
  out.outcome = plan.sort((a, b) => PLAN_ORDER.indexOf(a) - PLAN_ORDER.indexOf(b)).join(", ")
  if (acList.length) out.anticoag = acList.join(", ")
  else if (!out.anticoag && genericThinner) out.anticoag = "Yes, agent not specified"
  out.social = social.join("\n")

  if (name) {
    const n = name.replace(/\s+/g, " ").trim(); let first = "", last = ""
    if (n.includes(",")) { const [l, f] = n.split(","); last = l!.trim(); first = (f || "").trim() }
    else { const p = n.split(" "); last = p.length > 1 ? p.pop()! : ""; first = p.join(" ") }
    out.first = titleIfCaps(first); out.last = titleIfCaps(last)
  }
  const notes: string[] = []
  out.caller = caller
  if (mrn) notes.push(`MRN: ${mrn}`)
  if (cid && cid !== out.callback) notes.push(`Caller ID: ${cid}`)
  extra.forEach((e) => notes.push(e))
  out.notes = notes.join("\n")
  return out
}

/**
 * Title-cases a name only when it arrived in all capitals — "MCDONALD" becomes
 * "McDonald", "de la Cruz" is left alone. The original tool's rule, exported so
 * the AI normalizer treats names identically to the parser.
 */
export function titleIfCaps(s: string): string {
  return (/[a-z]/.test(s) ? s : s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase())).replace(/\b(Mc)([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase())
}
