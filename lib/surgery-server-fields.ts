// Server-side surgery filter fields.
//
// Delegates to the shared registry (lib/object-fields-server) so the list, the
// CSV export and the Filter panel all describe the object the same way. It used
// to build its own list from surgeryFilterFields, which meant the server knew 18
// criteria while the panel offered its own set — and `status` and `expires`,
// real columns missing from RECORD_FIELDS, were invisible to the report builder.

import type { FilterField } from "@/lib/filters"
import { fieldsFor } from "@/lib/object-fields-server"
import { toFilterFields } from "@/lib/object-fields"

export async function surgeryServerFilterFields(): Promise<FilterField[]> {
  return toFilterFields(await fieldsFor("SURGERY"))
}
