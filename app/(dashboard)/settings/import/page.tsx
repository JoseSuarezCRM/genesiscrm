import { settingsPageOrRedirect } from "@/lib/auth-guard"
import { canOpenSettingsPage } from "@/lib/settings-pages"
import { prisma } from "@/lib/prisma"
import { userCanLevel } from "@/lib/permissions"
import { listObjectTypes } from "@/lib/object-registry"
import { PROVIDER_IMPORT_KEY, PIPELINE_TARGET, STAGE_TARGET } from "@/lib/import-types"
import { pipelinesForObject } from "@/lib/stages/core"
import { PROVIDER_IMPORT_FIELDS, PROVIDER_NATIVE_LINK_TYPES } from "@/lib/import-providers"
import ImportWizard, { type ImportObject, type AssocTarget } from "@/components/import-wizard"

export const metadata = { title: "Import Records" }

export default async function ImportPage() {
  // The page needs Import Records; each object in it still needs Edit on that object.
  const session = await settingsPageOrRedirect("import")
  const user = session.user as any

  const defs = await (prisma as any).customObjectDef.findMany({
    orderBy: { plural: "asc" },
    select: { key: true, singular: true, plural: true, properties: true },
  })

  // Custom objects the user can edit, plus Providers — the one native object the
  // importer takes (lib/import-providers.ts).
  const objects: ImportObject[] = await Promise.all(defs
    .filter((d: any) => userCanLevel(user, `CO:${d.key}`, "EDIT"))
    .map(async (d: any) => {
      // An object with pipelines can place records by Pipeline / Stage columns
      // (names, any case). Without them, new records go to the default
      // pipeline's first stage — the hint shows which names are valid.
      const pipelines = (await pipelinesForObject(`CO:${d.key}`)).filter((p) => p.stages.length > 0)
      return {
        key: d.key,
        singular: d.singular,
        plural: d.plural,
        canCreateProperty: true,
        properties: [
          ...((d.properties as any[]) ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            type: p.type,
            options: p.options ?? undefined,
            optionLabels: p.optionLabels ?? undefined,
          })),
          ...(pipelines.length ? [
            { id: PIPELINE_TARGET, name: "Pipeline", type: "TEXT", aliases: ["Pipeline Name"] },
            { id: STAGE_TARGET, name: "Stage", type: "TEXT", aliases: ["Deal Stage", "Pipeline Stage", "Stage Name"] },
          ] : []),
        ],
        pipelineHint: pipelines.length
          ? pipelines.map((p) => `${p.name}: ${p.stages.map((st) => st.name).join(", ")}`).join(" · ")
          : undefined,
        defaultPipeline: pipelines[0] ? `${pipelines[0].name} → ${pipelines[0].stages[0].name}` : undefined,
      }
    }))

  if (userCanLevel(user, "PROVIDERS", "EDIT")) {
    const providerProps = await prisma.customProperty.findMany({ where: { entityType: "PROVIDER" }, orderBy: { createdAt: "asc" } })
    objects.push({
      key: PROVIDER_IMPORT_KEY,
      singular: "Provider",
      plural: "Providers",
      // Provider properties are CustomProperty rows; adding one needs the Custom Properties page.
      canCreateProperty: canOpenSettingsPage(user, "custom-properties"),
      requiredForCreate: ["name", "__practice"],
      excludeAssocTypes: PROVIDER_NATIVE_LINK_TYPES,
      properties: [
        ...PROVIDER_IMPORT_FIELDS,
        ...providerProps.map((p) => ({
          id: `cp_${p.id}`,
          name: p.name,
          type: p.type,
          options: p.options ?? undefined,
          optionLabels: (p.optionLabels as Record<string, string> | null) ?? undefined,
        })),
      ],
    })
    objects.sort((a, b) => a.plural.localeCompare(b.plural))
  }

  // Any object type can be an association target (linked by id / Record ID).
  const assocTargets: AssocTarget[] = (await listObjectTypes()).map((t) => ({ key: t.key, label: t.label }))

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Import Records</h1>
        <p className="text-sm text-slate-500 mt-1">
          Upload a CSV or Excel file, map its columns to your object&apos;s fields, and create or update records. Rows are matched by <span className="font-medium text-slate-600">Record ID</span> — a matching id updates the record, a blank one creates a new record. Add a column with a related record&apos;s id to associate them.
        </p>
      </div>
      {objects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 p-10 text-center text-sm text-slate-500">
          You don&apos;t have edit access to Providers or any custom object yet. Create one under{" "}
          <a href="/settings/objects" className="text-blue-600 hover:underline">Custom Objects</a> to import records.
        </div>
      ) : (
        <ImportWizard objects={objects} assocTargets={assocTargets} />
      )}
    </div>
  )
}
