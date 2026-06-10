"use client"

import { useState } from "react"
import { Settings } from "lucide-react"
import CustomPropertyManager from "@/components/custom-property-manager"

interface CustomProperty {
  id: string
  name: string
  type: string
  entityType: string
  required: boolean
  description: string | null
  options: string[]
  createdAt: Date
}

interface Props {
  referralProps: CustomProperty[]
  providerProps: CustomProperty[]
  practiceProps: CustomProperty[]
}

export default function CustomPropertiesPageClient({
  referralProps: initialReferralProps,
  providerProps: initialProviderProps,
  practiceProps: initialPracticeProps,
}: Props) {
  const [search, setSearch] = useState("")

  const filterProps = (props: CustomProperty[]) =>
    props.filter(
      (p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.type.toLowerCase().includes(search.toLowerCase())
    )

  const referralProps = filterProps(initialReferralProps)
  const providerProps = filterProps(initialProviderProps)
  const practiceProps = filterProps(initialPracticeProps)

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
        <input
          type="text"
          placeholder="Search properties..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-md px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200"
        />
        <button
          title="Settings"
          className="p-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Custom Properties</h1>
          <p className="text-sm text-slate-500 mt-1">
            Create and manage custom fields for referrals, providers, and practices
          </p>
        </div>

        <CustomPropertyManager
          referralProps={referralProps}
          providerProps={providerProps}
          practiceProps={practiceProps}
        />
      </div>
    </div>
  )
}
