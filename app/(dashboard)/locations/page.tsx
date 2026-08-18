import { prisma } from "@/lib/prisma"
import { requireView } from "@/lib/auth-guard"
import { getLocations } from "@/app/actions/referring-doctors"
import { listCustomProperties } from "@/app/actions/custom-properties"
import { getAssignableUsers } from "@/app/actions/view-share-options"
import { userCanLevel, userCanDelete } from "@/lib/permissions"
import LocationManager from "@/components/location-manager"

export default async function LocationsPage() {
  const session = await requireView("LOCATIONS")
  const user = session?.user as any
  const canEdit = userCanLevel(user, "LOCATIONS", "EDIT") || userCanLevel(user, "PRACTICES", "EDIT")
  const canDelete = userCanDelete(user, "LOCATIONS") || userCanDelete(user, "PRACTICES")

  const [locations, practices, customPropertyDefs, assignableUsers] = await Promise.all([
    getLocations(),
    prisma.referringPractice.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    listCustomProperties("LOCATION"),
    getAssignableUsers(),
  ])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Locations</h1>
        <p className="text-sm text-slate-500">
          {locations.length} location{locations.length !== 1 ? "s" : ""}
        </p>
      </div>

      <LocationManager
        locations={locations.map((l) => ({ ...l, createdAt: l.createdAt as any })) as any}
        practices={practices}
        customPropertyDefs={customPropertyDefs as any}
        canEdit={canEdit}
        canDelete={canDelete}
        users={assignableUsers}
      />
    </div>
  )
}
