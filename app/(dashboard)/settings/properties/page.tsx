import { settingsPageOrRedirect } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { listCustomObjects } from "@/app/actions/custom-objects"
import { CP_ENTITIES } from "@/lib/custom-property-entities"
import { RECORD_FIELDS } from "@/lib/record-field-catalog"
import { getNativeLabels } from "@/lib/native-labels"
import PropertiesSettings, { type PropertiesObject } from "@/components/properties-settings"

export const dynamic = "force-dynamic"

// Every property of every object on one page (replaced Custom Properties and
// Property Customization). Two stores stay behind it — CustomProperty rows for
// built-in objects, the CustomObjectDef.properties JSON for custom ones — because
// record values, saved views, workflows and tokens already key on their ids.
export default async function PropertiesSettingsPage({ searchParams }: { searchParams?: { object?: string } }) {
  await settingsPageOrRedirect("properties")

  const [customProps, customObjects, renamed] = await Promise.all([
    prisma.customProperty.findMany({ orderBy: { createdAt: "asc" } }),
    listCustomObjects(),
    getNativeLabels(),
  ])

  const objects: PropertiesObject[] = [
    ...CP_ENTITIES.map((e): PropertiesObject => ({
      kind: "builtin",
      key: e.type,
      label: e.label,
      native: (RECORD_FIELDS[e.type] ?? []).map((f) => ({
        key: f.key, label: renamed[e.type]?.[f.key] ?? f.label, defaultLabel: f.label, renamed: !!renamed[e.type]?.[f.key], type: f.type, options: f.options ?? [], optionLabels: f.optionLabels, readOnly: !!f.readOnly,
      })),
      custom: customProps.filter((p) => p.entityType === e.type).map((p) => ({
        id: p.id, name: p.name, internalName: p.internalName, type: p.type, required: p.required, unique: p.unique,
        description: p.description, defaultValue: p.defaultValue, options: p.options,
        optionLabels: (p.optionLabels as Record<string, string> | null) ?? null,
        optionColors: (p.optionColors as Record<string, string> | null) ?? null,
        optionStyle: p.optionStyle, conditional: (p.conditional as any) ?? null, visibilityRule: (p.visibilityRule as any) ?? null,
        numberFormat: p.numberFormat,
      })),
    })),
    ...customObjects.map((o): PropertiesObject => ({
      kind: "custom",
      key: `CO:${o.key}`,
      label: o.plural,
      defId: o.id,
      properties: o.properties,
    })),
  ]

  return (
    <div className="max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Properties</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Every property of every object — built-in fields and your own. They appear on records, in lists,
          filters, exports and workflows.
        </p>
      </div>
      <PropertiesSettings objects={objects} initialObject={searchParams?.object} />
    </div>
  )
}
