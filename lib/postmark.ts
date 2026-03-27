export const FROM_EMAIL = process.env.POSTMARK_FROM_EMAIL ?? "jsuarez@genesisortho.com"

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.POSTMARK_API_KEY
  if (!apiKey) {
    console.error("[POSTMARK] POSTMARK_API_KEY is not set")
    return { success: false, error: "Email service not configured" }
  }

  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": apiKey,
      },
      body: JSON.stringify({
        From: FROM_EMAIL,
        To: to,
        Subject: subject,
        HtmlBody: html,
        TextBody: html.replace(/<[^>]+>/g, ""),
        MessageStream: "outbound",
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const msg = (body as { Message?: string }).Message ?? `HTTP ${res.status}`
      console.error("[POSTMARK]", msg)
      return { success: false, error: msg }
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[POSTMARK]", message)
    return { success: false, error: message }
  }
}
