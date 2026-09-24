/**
 * Telling the public surgeon sites that their content changed.
 *
 * The site app bundles its content at build time rather than fetching it per
 * request, so a site's uptime does not depend on this CRM's. The cost of that is
 * this file: publishing here changes nothing out there until a build runs, and
 * something has to ask for one.
 *
 * `SURGEON_SITE_DEPLOY_HOOK` is a Vercel deploy hook URL for the site project —
 * an opaque, unguessable POST endpoint that triggers a build. It is a URL, not a
 * credential in a header, so it belongs in an environment variable and must
 * never be logged or surfaced in the UI.
 *
 * ── Deliberately non-fatal, deliberately recorded ─────────────────────────────
 *
 * A failed hook must not fail the publish. The publish is the real work and it
 * is already committed; refusing it because a webhook timed out would lose the
 * edit and teach people to avoid the button.
 *
 * But a silently broken hook is the one genuinely bad failure mode of building
 * at build time: content would quietly stop reaching the sites and nobody would
 * notice for weeks. So the outcome is written to the row, and the editor shows
 * when a site was last deployed. "It says it published but the site is old" has
 * to be answerable by looking, not by guessing.
 */

import { prisma } from "@/lib/prisma"

export type DeployOutcome =
  | { ok: true; at: Date }
  | { ok: false; at: Date; reason: string }

/** Is a deploy hook configured at all? */
export function deployHookConfigured(): boolean {
  return !!(process.env.SURGEON_SITE_DEPLOY_HOOK ?? "").trim()
}

/**
 * Ask the site project to rebuild, and record what happened on the site row.
 *
 * Never throws. Callers publish first and call this after.
 */
export async function requestSurgeonSiteDeploy(
  siteId: string,
  reason: string,
): Promise<DeployOutcome> {
  const hook = (process.env.SURGEON_SITE_DEPLOY_HOOK ?? "").trim()
  const at = new Date()

  const record = async (outcome: DeployOutcome) => {
    // Best-effort: if this write fails the publish still stands, and losing the
    // bookkeeping is better than turning it into an error the user sees.
    await (prisma as any).surgeonSite
      .update({
        where: { id: siteId },
        data: {
          lastDeployAt: outcome.at,
          lastDeployOk: outcome.ok,
          lastDeployError: outcome.ok ? null : outcome.reason.slice(0, 500),
        },
      })
      .catch(() => {})
    return outcome
  }

  if (!hook) {
    return record({
      ok: false,
      at,
      reason:
        "No deploy hook is configured, so the published content will not reach the live site until someone redeploys it. Set SURGEON_SITE_DEPLOY_HOOK.",
    })
  }

  try {
    const res = await fetch(hook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      // The URL is never included in the message: it is the secret.
      return record({ ok: false, at, reason: `The deploy hook answered ${res.status}.` })
    }
    return record({ ok: true, at })
  } catch (e: any) {
    return record({ ok: false, at, reason: `Could not reach the deploy hook: ${e?.message ?? e}` })
  }
}
