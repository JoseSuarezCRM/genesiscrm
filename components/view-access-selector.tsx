"use client"

import { useState } from "react"
import { Lock, Globe, Users, UserCog, Check, Search } from "lucide-react"

export type Visibility = "PRIVATE" | "EVERYONE" | "TEAM" | "CUSTOM"

export interface ViewAccessValue {
  visibility: Visibility
  teamId: string | null
  sharedUserIds: string[]
}

export interface ShareUser { id: string; name: string | null; email: string }
export interface ShareTeam { id: string; name: string }

const OPTIONS: { value: Visibility; label: string; icon: typeof Lock }[] = [
  { value: "PRIVATE", label: "Only me", icon: Lock },
  { value: "EVERYONE", label: "Everyone", icon: Globe },
  { value: "TEAM", label: "My team", icon: Users },
  { value: "CUSTOM", label: "Specific people", icon: UserCog },
]

export function ViewAccessSelector({ value, onChange, users, teams }: {
  value: ViewAccessValue
  onChange: (v: ViewAccessValue) => void
  users: ShareUser[]
  teams: ShareTeam[]
}) {
  const [userQuery, setUserQuery] = useState("")

  // Hide the "My team" option when the user belongs to no team
  const options = OPTIONS.filter(o => o.value !== "TEAM" || teams.length > 0)

  function pick(v: Visibility) {
    if (v === "TEAM") {
      onChange({ visibility: "TEAM", teamId: value.teamId ?? teams[0]?.id ?? null, sharedUserIds: [] })
    } else if (v === "CUSTOM") {
      onChange({ visibility: "CUSTOM", teamId: null, sharedUserIds: value.sharedUserIds })
    } else {
      onChange({ visibility: v, teamId: null, sharedUserIds: [] })
    }
  }

  function toggleUser(id: string) {
    onChange({
      ...value,
      sharedUserIds: value.sharedUserIds.includes(id)
        ? value.sharedUserIds.filter(x => x !== id)
        : [...value.sharedUserIds, id],
    })
  }

  const filteredUsers = userQuery.trim()
    ? users.filter(u => (u.name ?? u.email).toLowerCase().includes(userQuery.toLowerCase()))
    : users

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Who can see this?</label>
      <div className="grid grid-cols-2 gap-1.5">
        {options.map(o => {
          const Icon = o.icon
          const active = value.visibility === o.value
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => pick(o.value)}
              className={`flex items-center gap-1.5 h-9 px-2.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                active ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{o.label}</span>
            </button>
          )
        })}
      </div>

      {/* Team picker (only when user is in more than one team) */}
      {value.visibility === "TEAM" && teams.length > 1 && (
        <select
          value={value.teamId ?? ""}
          onChange={e => onChange({ ...value, teamId: e.target.value })}
          className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-slate-400"
        >
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}

      {/* Custom user picker */}
      {value.visibility === "CUSTOM" && (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-slate-100">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input
              value={userQuery}
              onChange={e => setUserQuery(e.target.value)}
              placeholder="Search people..."
              className="flex-1 text-sm outline-none bg-transparent placeholder:text-slate-400"
            />
          </div>
          <div className="max-h-40 overflow-y-auto py-1">
            {filteredUsers.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-400">No people found</p>
            ) : filteredUsers.map(u => (
              <button
                key={u.id}
                type="button"
                onClick={() => toggleUser(u.id)}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-slate-50 text-left"
              >
                <span className={`shrink-0 w-[14px] h-[14px] rounded border flex items-center justify-center ${value.sharedUserIds.includes(u.id) ? "bg-zinc-900 border-zinc-900" : "border-slate-300"}`}>
                  {value.sharedUserIds.includes(u.id) && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                </span>
                <span className="text-slate-700 truncate">{u.name ?? u.email}</span>
              </button>
            ))}
          </div>
          {value.sharedUserIds.length > 0 && (
            <div className="px-3 py-1.5 border-t border-slate-100 text-xs text-slate-400">
              {value.sharedUserIds.length} selected
            </div>
          )}
        </div>
      )}
    </div>
  )
}
