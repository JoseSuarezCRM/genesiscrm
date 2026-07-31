// Public-API JSON shapes — a clean, stable contract that hides internal columns.

export function serializeReferral(r: any) {
  return {
    id: r.id,
    patient: {
      firstName: r.patientFirstName,
      lastName: r.patientLastName,
      phone: r.patientPhone ?? null,
      email: r.patientEmail ?? null,
      dob: r.patientDob ? new Date(r.patientDob).toISOString() : null,
      mrn: r.patientMrn ?? null,
    },
    status: r.status,
    referralDate: r.referralDate ? new Date(r.referralDate).toISOString() : null,
    appointmentDate: r.appointmentDate ? new Date(r.appointmentDate).toISOString() : null,
    insuranceProvider: r.insuranceProvider ?? null,
    notes: r.notes ?? null,
    practice: r.referringPractice
      ? { id: r.referringPractice.id, name: r.referringPractice.name }
      : (r.referringPracticeId ? { id: r.referringPracticeId, name: null } : null),
    provider: r.referringDoctor
      ? { id: r.referringDoctor.id, name: r.referringDoctor.name }
      : (r.referringDoctorName ? { id: null, name: r.referringDoctorName } : null),
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
  }
}
