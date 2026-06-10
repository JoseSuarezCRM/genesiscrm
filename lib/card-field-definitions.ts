// Available fields for each card type per entity
export type CardFieldDefinition = {
  id: string
  label: string
  fieldKey: string
}

type EntityType = "REFERRAL" | "PROVIDER" | "PRACTICE"

export const cardFieldDefinitions: Record<EntityType, Record<string, CardFieldDefinition[]>> = {
  REFERRAL: {
    "Patient": [
      { id: "mrn", label: "MRN", fieldKey: "genesisMrn" },
      { id: "dob", label: "Date of Birth", fieldKey: "patientDob" },
      { id: "phone", label: "Phone", fieldKey: "patientPhone" },
      { id: "email", label: "Email", fieldKey: "patientEmail" },
      { id: "firstName", label: "First Name", fieldKey: "patientFirstName" },
      { id: "lastName", label: "Last Name", fieldKey: "patientLastName" },
    ],
    "Source": [
      { id: "practice", label: "Practice", fieldKey: "referringPractice.name" },
      { id: "provider", label: "Provider", fieldKey: "referringDoctor.name" },
      { id: "npi", label: "NPI", fieldKey: "referringNpi" },
      { id: "location", label: "Location", fieldKey: "referringLocation.name" },
    ],
    "Referral": [
      { id: "status", label: "Status", fieldKey: "status" },
      { id: "pipeline", label: "Pipeline", fieldKey: "pipeline.name" },
      { id: "location", label: "Location", fieldKey: "referringLocation.name" },
      { id: "insurance", label: "Insurance", fieldKey: "insuranceProvider" },
      { id: "appointmentDate", label: "Appointment Date", fieldKey: "appointmentDate" },
      { id: "referralDate", label: "Referral Date", fieldKey: "referralDate" },
    ],
    "Practice": [
      { id: "name", label: "Name", fieldKey: "referringPractice.name" },
      { id: "phone", label: "Phone", fieldKey: "referringPractice.phone" },
      { id: "fax", label: "Fax", fieldKey: "referringPractice.fax" },
      { id: "address", label: "Address", fieldKey: "referringPractice.address" },
      { id: "city", label: "City", fieldKey: "referringPractice.city" },
      { id: "state", label: "State", fieldKey: "referringPractice.state" },
    ],
    "Provider": [
      { id: "name", label: "Name", fieldKey: "referringDoctor.name" },
      { id: "specialty", label: "Specialty", fieldKey: "referringDoctor.specialty" },
      { id: "npi", label: "NPI", fieldKey: "referringDoctor.npi" },
      { id: "phone", label: "Phone", fieldKey: "referringDoctor.phone" },
      { id: "email", label: "Email", fieldKey: "referringDoctor.email" },
      { id: "title", label: "Title", fieldKey: "referringDoctor.title" },
      { id: "location", label: "Location", fieldKey: "referringDoctor.locations" },
    ],
  },
  PROVIDER: {
    "Provider": [
      { id: "name", label: "Name", fieldKey: "name" },
      { id: "specialty", label: "Specialty", fieldKey: "specialty" },
      { id: "npi", label: "NPI", fieldKey: "npi" },
      { id: "phone", label: "Phone", fieldKey: "phone" },
      { id: "email", label: "Email", fieldKey: "email" },
      { id: "title", label: "Title", fieldKey: "title" },
    ],
  },
  PRACTICE: {
    "Practice": [
      { id: "name", label: "Name", fieldKey: "name" },
      { id: "phone", label: "Phone", fieldKey: "phone" },
      { id: "fax", label: "Fax", fieldKey: "fax" },
      { id: "address", label: "Address", fieldKey: "address" },
      { id: "city", label: "City", fieldKey: "city" },
      { id: "state", label: "State", fieldKey: "state" },
      { id: "zip", label: "Zip Code", fieldKey: "zip" },
    ],
  },
}

// Properties available for custom cards in the left sidebar of the referral detail page.
// Widget fields (status, assignedTo, tags) render interactive controls; the rest render values.
export const referralLeftFieldPool: { id: string; label: string }[] = [
  { id: "status", label: "Status" },
  { id: "assignedTo", label: "Assigned To" },
  { id: "tags", label: "Tags" },
  { id: "mrn", label: "MRN" },
  { id: "dob", label: "Date of Birth" },
  { id: "patientPhone", label: "Patient Phone" },
  { id: "patientEmail", label: "Patient Email" },
  { id: "practice", label: "Practice" },
  { id: "provider", label: "Provider" },
  { id: "npi", label: "NPI" },
  { id: "location", label: "Location" },
  { id: "insurance", label: "Insurance" },
  { id: "pipeline", label: "Pipeline" },
  { id: "referralDate", label: "Referral Date" },
  { id: "appointmentDate", label: "Appointment Date" },
  { id: "createdBy", label: "Created By" },
  { id: "createdAt", label: "Created Date" },
]

// Get all card names for an entity type
export function getCardNamesForEntity(entityType: EntityType): string[] {
  return Object.keys(cardFieldDefinitions[entityType] || {})
}

// Get available fields for a card
export function getAvailableFieldsForCard(entityType: EntityType, cardName: string): CardFieldDefinition[] {
  return cardFieldDefinitions[entityType]?.[cardName] || []
}
