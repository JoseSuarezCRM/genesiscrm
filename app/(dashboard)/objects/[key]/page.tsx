import { notFound } from "next/navigation"
import { requireView } from "@/lib/auth-guard"
import { userCanLevel, userCanDelete } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { getCustomObject } from "@/app/actions/custom-objects"
import { listCustomObjectRecords, countCustomObjectRecords, queryCustomObjectRecords } from "@/app/actions/custom-object-records"
import { CO_SERVER_THRESHOLD } from "@/lib/custom-object-config"
import { getCustomObjectViews } from "@/app/actions/custom-object-views"
import { getViewShareOptions } from "@/app/actions/view-share-options"
import CustomObjectList from "@/components/custom-object-list"
import { getCreateForm } from "@/app/actions/create-form"

interface Props {
  params: { key: string }
  searchParams: { page?: string; sort?: string; dir?: string; search?: string; filter?: string }
}

export default async function CustomObjectListPage({ params, searchParams }: Props) {
  const def = await getCustomObject(params.key)
  if (!def) notFound()

  const session = await requireView(`CO:${params.key}`)
  const user = session?.user as any
  const canEdit = userCanLevel(user, `CO:${params.key}`, "EDIT")
  const canDelete = userCanDelete(user, `CO:${params.key}`)

  // Adaptive: small objects load fully (instant client-side sort/filter); large
  // objects switch to server-side pagination + sort + filter automatically.
  const totalRecords = await countCustomObjectRecords(params.key)
  const serverMode = totalRecords > CO_SERVER_THRESHOLD

  const [users, savedViews, shareOptions, createFormConfig] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    getCustomObjectViews(params.key),
    getViewShareOptions(),
    getCreateForm(`CO:${params.key}`),
  ])

  const pageData = serverMode
    ? await queryCustomObjectRecords(params.key, {
        page: parseInt(searchParams.page ?? "1"), sort: searchParams.sort,
        dir: searchParams.dir === "asc" ? "asc" : "desc", search: searchParams.search, filter: searchParams.filter,
      })
    : { rows: await listCustomObjectRecords(params.key), total: totalRecords, page: 1, pageSize: 0 }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{def.plural}</h1>
        <p className="text-sm text-slate-500">{totalRecords} {totalRecords === 1 ? def.singular.toLowerCase() : def.plural.toLowerCase()}</p>
      </div>

      <CustomObjectList
        objectKey={def.key}
        singular={def.singular}
        plural={def.plural}
        ownerLabel={def.ownerLabel}
        properties={def.properties}
        records={pageData.rows as any}
        users={users.map((u) => ({ id: u.id, label: u.name ?? u.email }))}
        canEdit={canEdit}
        canDelete={canDelete}
        savedViews={savedViews as any}
        shareUsers={shareOptions.users as any}
        shareTeams={shareOptions.teams as any}
        serverMode={serverMode}
        serverTotal={pageData.total}
        serverPage={pageData.page}
        serverPageSize={pageData.pageSize}
        createFormConfig={createFormConfig}
        isAdmin={user?.role === "ADMIN"}
      />
    </div>
  )
}
