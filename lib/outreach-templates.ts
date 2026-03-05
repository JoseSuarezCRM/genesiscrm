// HIPAA-safe message templates.
// SMS: first name, appointment date, callback phone only — NO PHI.
// Email: slightly richer but still no diagnoses, MRN, or insurance info.

const PRACTICE_NAME = process.env.PRACTICE_NAME ?? "Genesis Ortho"
const PRACTICE_PHONE = process.env.PRACTICE_PHONE ?? "our office"

// ── SMS Templates ────────────────────────────────────────────────────────────

export function appointmentConfirmationSMS(firstName: string, dateStr: string): string {
  return `Hi ${firstName}, your appointment at ${PRACTICE_NAME} has been confirmed for ${dateStr}. Questions? Call us at ${PRACTICE_PHONE}. Reply STOP to opt out.`
}

export function appointmentReminderSMS(firstName: string, dateStr: string): string {
  return `Hi ${firstName}, reminder: your appointment at ${PRACTICE_NAME} is tomorrow, ${dateStr}. Need to reschedule? Call ${PRACTICE_PHONE}. Reply STOP to opt out.`
}

export function followUpSMS(firstName: string): string {
  return `Hi ${firstName}, thank you for your recent visit at ${PRACTICE_NAME}. We hope you are doing well. Questions? Call ${PRACTICE_PHONE}. Reply STOP to opt out.`
}

// ── Email Templates ──────────────────────────────────────────────────────────

export function appointmentConfirmationEmail(
  firstName: string,
  dateStr: string
): { subject: string; html: string } {
  return {
    subject: `Your Appointment at ${PRACTICE_NAME} is Confirmed`,
    html: `
      <p>Hi ${firstName},</p>
      <p>Your appointment at <strong>${PRACTICE_NAME}</strong> has been confirmed for <strong>${dateStr}</strong>.</p>
      <p>If you have any questions or need to reschedule, please call us at <strong>${PRACTICE_PHONE}</strong>.</p>
      <p>We look forward to seeing you.</p>
      <p>${PRACTICE_NAME}</p>
    `,
  }
}

export function appointmentReminderEmail(
  firstName: string,
  dateStr: string
): { subject: string; html: string } {
  return {
    subject: `Appointment Reminder — ${PRACTICE_NAME}`,
    html: `
      <p>Hi ${firstName},</p>
      <p>This is a friendly reminder that your appointment at <strong>${PRACTICE_NAME}</strong> is scheduled for <strong>${dateStr}</strong>.</p>
      <p>Need to reschedule? Please call us at <strong>${PRACTICE_PHONE}</strong> as soon as possible.</p>
      <p>We look forward to seeing you.</p>
      <p>${PRACTICE_NAME}</p>
    `,
  }
}

export function followUpEmail(firstName: string): { subject: string; html: string } {
  return {
    subject: `Thank You for Visiting ${PRACTICE_NAME}`,
    html: `
      <p>Hi ${firstName},</p>
      <p>Thank you for your recent visit at <strong>${PRACTICE_NAME}</strong>. We hope you are recovering well.</p>
      <p>If you have any questions or concerns, please don't hesitate to call us at <strong>${PRACTICE_PHONE}</strong>.</p>
      <p>Thank you for choosing ${PRACTICE_NAME}.</p>
      <p>${PRACTICE_NAME}</p>
    `,
  }
}
