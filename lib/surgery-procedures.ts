// Shared surgery option data — single source of truth for the surgery detail
// form, the workflow property catalog, and the automation engine.

export const PROCEDURE_DATA: Record<string, Record<string, string[]>> = {
  "Horner, Nolan": {
    Shoulder: [
      "AC Joint Reconstruction", "Bankart Repair", "Latarjet", "Pec Repair",
      "Reverse Total Shoulder Arthroplasty", "Rotator Cuff Debridement", "Rotator Cuff Repair",
      "Shoulder Arthroscopy and Biceps Tenodesis", "Shoulder Manipulation/Lysis of Adhesions",
      "Total Shoulder Arthroplasty", "Proximal Humerus Post-Op Instructions",
    ],
    Knee: [
      "ACL Reconstruction with Meniscus Repair", "ACL Reconstruction without Meniscus Repair",
      "ACL Reconstruction with MCL Reconstruction", "ACL/PCL Repair, possible ORIF Discharge",
      "Knee Arthroscopy - Meniscal Repair", "Partial Meniscectomy/Debridement",
      "OCD Fixation or Drilling", "MUA Knee", "Patellar Tendon Repair", "MPFL",
    ],
    "Hand & Elbow": [
      "Carpal Tunnel Release", "Trigger Finger", "Cubital Tunnel Release", "Ganglion Cyst Excision",
      "Distal Biceps Repair", "Elbow Dislocation", "Lateral Medial Epicondyle Debridement Repair",
      "Tricep Reconstruction/Repair", "UCL Recon", "UCL Rehab non op",
    ],
    Trauma: [
      "Achilles Repair", "Proximal Hamstring Repair", "Upper Extremity ORIF",
      "Humeral Shaft Post-Op Instructions",
    ],
    Other: [
      "General Post Op-Instructions", "Brostrom Procedure", "Clavicle ORIF", "Hip Arthroscopy",
      "Lower Extremity Removal", "Lower Extremity ORIF", "QUAD", "OCD Excision", "Troch Bursitis",
    ],
  },
  "Diamond, Matthew": {
    Ankle: ["Achilles Repair", "ORIF Lower Extremity"],
    Feet: ["Bunionectomy", "Cheilectomy", "Hammer Toe Arthroplasty", "Lisfranc Pinning"],
    Other: ["General Post-Op Instructions"],
  },
  "Wang, Jonathan": {
    Knee: ["Partial Meniscectomy/Debridement", "Total Knee Arthroplasty"],
    Hip: ["Total Hip Arthroplasty"],
  },
}

// Find which provider + body part a stored procedure belongs to.
export function findProcedureLocation(proc: string): { provider: string; bodyPart: string } {
  for (const [prov, bodyParts] of Object.entries(PROCEDURE_DATA)) {
    for (const [bp, procs] of Object.entries(bodyParts)) {
      if (procs.includes(proc)) return { provider: prov, bodyPart: bp }
    }
  }
  return { provider: "", bodyPart: "" }
}

export function surgeryProviders(): string[] {
  return Object.keys(PROCEDURE_DATA)
}

export function allBodyParts(): string[] {
  const set = new Set<string>()
  for (const bodyParts of Object.values(PROCEDURE_DATA)) {
    for (const bp of Object.keys(bodyParts)) set.add(bp)
  }
  return Array.from(set)
}

export function allProcedures(): string[] {
  const set = new Set<string>()
  for (const bodyParts of Object.values(PROCEDURE_DATA)) {
    for (const procs of Object.values(bodyParts)) {
      for (const p of procs) set.add(p)
    }
  }
  return Array.from(set).sort()
}

// ── Dropdown option lists (mirror the surgery detail form) ────────────────────
export const CLEARANCE_OPTIONS = [
  "Not required", "Arrangements to be made", "Scheduled",
  "Awaiting clearance documents", "Completed, on file",
]
export const DENTAL_CLEARANCE_OPTIONS = [
  "Not required", "Arrangements to be made", "Scheduled",
  "Awaiting clearance documents", "Treatment required", "Completed, on file",
]
export const CT_REQUIRED_OPTIONS = ["Yes", "No", "Received"]
export const GLP1_OPTIONS = ["Yes", "No"]
export const DME_OPTIONS = ["Incomplete", "Ordered", "Requested", "N/A"]
export const PHYSICAL_THERAPY_OPTIONS = ["Internal/GOSM", "External", "NA", "Undecided"]
export const FACILITY_OPTIONS = [
  "Glen Oaks Hospital", "Humboldt Park Hospital", "Mercy Aurora Hospital",
  "Good Samaritan Hospital", "Oak Brook Surgical Center", "Aiden Center For Day Surgery",
  "Fullerton-Kimball Medical & Surgical Center", "Illinois Masonic Hospital",
]
export const REFERRAL_PRESETS = [
  "LCHC", "PCC", "VNA", "PIC", "AHC", "ZocDoc", "Molina", "Meridian",
  "Aetna Better Health", "JenCare", "GFH", "Advocate", "OSH", "Aunt Martha's",
  "Esperanza", "Access", "Rush", "Mercy", "Google", "GOSM Website", "BCC", "BCBS",
]

export function toOptions(values: string[]): { value: string; label: string }[] {
  return values.map(v => ({ value: v, label: v }))
}
