/** The extract route's response, shared by the route and the intake. */

import type { ExtractOutcome } from "./safe-log"
import type { ExtraValue } from "./snapshot"
import type { ReferralCallFields } from "./types"

export type ExtractResponse =
  | {
      ok: true
      /** Only the fields the AI was asked to fill; the rest keep the rules' values. */
      fields: Partial<ReferralCallFields>
      /** Values for admin-added properties, keyed by property id. */
      extras: Record<string, ExtraValue>
    }
  | { ok: false; code: ExtractOutcome; error: string }
