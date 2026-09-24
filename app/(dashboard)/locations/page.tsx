import { prisma } from "@/lib/prisma"
import { requireView } from "@/lib/auth-guard"
import { getLocations } from "@/app/actions/referring-doctors"
import { listCustomProperties } from "@/app/actions/custom-properties"
import { getAssignableUsers } from "@/app/actions/view-share-options"
import { getCreateForm } from "@/app/actions/create-form"
import { userCanLevel, userCanDelete } from "@/lib/permissions"
import { associationColumnDefs } from "@/lib/association-columns"
import LocationManager from "@/components/location-manager"
import { fieldsFor } from "@/lib/object-fields-server"

export default async function LocationsPage() {
  const session = await requireView("LOCATIONS")
  const user = session?.user as any
  const canEdit = userCanLevel(user, "LOCATIONS", "EDIT") || userCanLevel(user, "PRACTICES", "EDIT")
  const canDelete = userCanDelete(user, "LOCATIONS") || userCanDelete(user, "PRACTICES")

  const [locations, practices, customPropertyDefs, assignableUsers, createFormConfig, filterDefs] = await Promise.all([
    getLocations(),
    prisma.referringPractice.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    listCustomProperties("LOCATION"),
    getAssignableUsers(),
    getCreateForm("LOCATION"),
    fieldsFor("LOCATION"),
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
        createFormConfig={createFormConfig}
        isAdmin={user?.role === "ADMIN"}
        associations={await associationColumnDefs("LOCATION")}
        filterDefs={filterDefs}
      />
    </div>
  )
}
