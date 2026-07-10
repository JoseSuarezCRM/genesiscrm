"use client"

import StyledSelect from "@/components/ui/styled-select"
import { useState, useTransition } from "react"
import { Role } from "@prisma/client"
import { inviteUser, resendInvite, updateUserRole, updateUserPermissions, deleteUser, resetPassword } from "@/app/actions/users"
import { createTeam, updateTeam, deleteTeam, addTeamMember, removeTeamMember } from "@/app/actions/teams"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, Trash2, Loader2, KeyRound, ShieldCheck, Users, Pencil, X, ChevronDown, ChevronUp, Crown, Mail } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  NAV_PERMISSIONS, CAPABILITIES, ACCESS_OBJECTS, ACCESS_LEVELS,
  type PermissionDef, type AccessLevel, accessLevelFromPerms, canDeleteFromPerms,
} from "@/lib/permissions"

// ── Types ─────────────────────────────────────────────────────────────────────

type UserRow = {
  id: string
  name: string | null
  email: string
  role: Role
  permissions: string[]
  isActive: boolean
  createdAt: Date
  _count: { referralsCreated: number }
  teamMemberships: { team: { id: string; name: string } }[]
}

type TeamRow = {
  id: string
  name: string
  description: string | null
  permissions: string[]
  members: {
    id: string
    userId: string
    teamId: string
    user: { id: string; name: string | null; email: string; role: string }
  }[]
}

interface Props {
  users: UserRow[]
  teams: TeamRow[]
  currentUserId: string
}

// ── Permission definitions ────────────────────────────────────────────────────


// ── Permission checklist ───────────────────────────────────────────────────────

function PermissionChecklist({
  selected, onChange, disabled, items,
}: { selected: string[]; onChange: (v: string[]) => void; disabled?: boolean; items: PermissionDef[] }) {
  return (
    <div className="space-y-3">
      {items.map((p) => (
        <label key={p.key} className={cn("flex items-start gap-3 cursor-pointer group", disabled && "opacity-40 pointer-events-none")}>
          <Checkbox
            checked={selected.includes(p.key)}
            onCheckedChange={(checked) =>
              onChange(checked ? [...selected, p.key] : selected.filter((x) => x !== p.key))
            }
            className="mt-0.5"
          />
          <div>
            <p className="text-sm font-medium text-slate-800">{p.label}</p>
            <p className="text-xs text-slate-500">{p.description}</p>
          </div>
        </label>
      ))}
    </div>
  )
}

// Per-object access: a level (No access / View / View & Edit) + a separate Delete toggle.
function ObjectAccessMatrix({ perms, onChange, disabled }: { perms: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const setLevel = (obj: string, level: AccessLevel) => {
    const next = perms.filter((p) => p !== `${obj}:VIEW` && p !== `${obj}:EDIT`)
    if (level === "VIEW") next.push(`${obj}:VIEW`)
    if (level === "EDIT") next.push(`${obj}:EDIT`)
    // Delete makes no sense without at least view — drop it if access is removed.
    onChange(level === "NONE" ? next.filter((p) => p !== `${obj}:DELETE`) : next)
  }
  const toggleDelete = (obj: string, on: boolean) => {
    const key = `${obj}:DELETE`
    onChange(on ? [...perms, key] : perms.filter((p) => p !== key))
  }
  return (
    <div className={cn("border border-slate-200 rounded-lg overflow-hidden", disabled && "opacity-40 pointer-events-none")}>
      <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <span>Object</span><span>Access</span><span className="text-center">Delete</span>
      </div>
      <div className="divide-y divide-slate-100">
        {ACCESS_OBJECTS.map((o) => {
          const level = accessLevelFromPerms(perms, o.key)
          const canDel = canDeleteFromPerms(perms, o.key)
          return (
            <div key={o.key} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-3 py-2">
              <span className="text-sm text-slate-700">{o.label}</span>
              <select
                value={level}
                onChange={(e) => setLevel(o.key, e.target.value as AccessLevel)}
                className="w-40 h-8 px-2 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:border-slate-400"
              >
                {ACCESS_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
              <div className="flex justify-center w-14">
                <Checkbox checked={canDel} disabled={level === "NONE"} onCheckedChange={(c) => toggleDelete(o.key, !!c)} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// The full permission editor: menu access + object access matrix + capabilities.
function PermissionEditor({ perms, onChange, disabled }: { perms: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  return (
    <div className="space-y-5">
      <div>
        <Label className="mb-1 block">Menu Access</Label>
        <p className="text-xs text-slate-500 mb-3">Which sections of the navigation this {disabled ? "user" : "set"} can see.</p>
        <PermissionChecklist selected={perms} onChange={onChange} items={NAV_PERMISSIONS} disabled={disabled} />
      </div>
      <div>
        <Label className="mb-1 block">Object Access</Label>
        <p className="text-xs text-slate-500 mb-3">Per-object access level, plus whether they can delete records.</p>
        <ObjectAccessMatrix perms={perms} onChange={onChange} disabled={disabled} />
      </div>
      <div>
        <Label className="mb-1 block">Other Capabilities</Label>
        <p className="text-xs text-slate-500 mb-3">Standalone abilities that aren’t a view/edit spectrum.</p>
        <PermissionChecklist selected={perms} onChange={onChange} items={CAPABILITIES} disabled={disabled} />
      </div>
    </div>
  )
}

// ── Team form ─────────────────────────────────────────────────────────────────

function TeamForm({
  initial, onSave, onCancel,
}: { initial?: TeamRow; onSave: () => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? "")
  const [desc, setDesc] = useState(initial?.description ?? "")
  const [perms, setPerms] = useState<string[]>(initial?.permissions ?? [])
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError("Name is required."); return }
    setError("")
    startTransition(async () => {
      const res = initial
        ? await updateTeam(initial.id, { name: name.trim(), description: desc.trim() || undefined, permissions: perms })
        : await createTeam({ name: name.trim(), description: desc.trim() || undefined, permissions: perms })
      if (!res.success) { setError(res.error ?? "Failed."); return }
      onSave()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-h-[80vh] overflow-y-auto pr-1">
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Team Name *</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Front Desk" required />
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional" />
        </div>
      </div>

      <PermissionEditor perms={perms} onChange={setPerms} />

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {initial ? "Save Changes" : "Create Team"}
        </Button>
      </DialogFooter>
    </form>
  )
}

// ── Team card ─────────────────────────────────────────────────────────────────

function TeamCard({ team, users }: { team: TeamRow; users: UserRow[] }) {
  const [expanded, setExpanded] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [addUserId, setAddUserId] = useState("")
  const [isPending, startTransition] = useTransition()

  const memberIds = new Set(team.members.map(m => m.userId))
  const nonMembers = users.filter(u => !memberIds.has(u.id))

  const navPerms = team.permissions.filter(p => p.startsWith("NAV_"))
  const objectGrants = ACCESS_OBJECTS.filter(o => team.permissions.some(p => p.startsWith(o.key + ":"))).length
  const capPerms = team.permissions.filter(p => CAPABILITIES.some(c => c.key === p))

  function handleAddMember() {
    if (!addUserId) return
    startTransition(async () => {
      await addTeamMember(team.id, addUserId)
      setAddUserId("")
    })
  }

  function handleRemoveMember(userId: string) {
    startTransition(async () => { await removeTeamMember(team.id, userId) })
  }

  function handleDelete() {
    if (!confirm(`Delete team "${team.name}"? Members will lose team permissions.`)) return
    startTransition(async () => { await deleteTeam(team.id) })
  }

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex-1 flex items-center gap-3 text-left"
        >
          <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-lg shrink-0">
            <Users className="h-4 w-4 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 text-sm">{team.name}</p>
            <p className="text-xs text-slate-500 truncate">
              {team.members.length} member{team.members.length !== 1 ? "s" : ""}
              {team.description && ` · ${team.description}`}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0 flex-wrap">
            {navPerms.map(p => (
              <span key={p} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                {NAV_PERMISSIONS.find(x => x.key === p)?.label ?? p}
              </span>
            ))}
            {objectGrants > 0 && (
              <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{objectGrants} object{objectGrants !== 1 ? "s" : ""}</span>
            )}
            {capPerms.slice(0, 2).map(p => (
              <span key={p} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                {CAPABILITIES.find(x => x.key === p)?.label ?? p}
              </span>
            ))}
            {capPerms.length > 2 && (
              <span className="text-xs text-slate-400">+{capPerms.length - 2} more</span>
            )}
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8" title="Edit team">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Edit Team — {team.name}</DialogTitle></DialogHeader>
              <TeamForm initial={team} onSave={() => setEditOpen(false)} onCancel={() => setEditOpen(false)} />
            </DialogContent>
          </Dialog>
          <Button
            size="icon" variant="ghost"
            className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50"
            onClick={handleDelete} disabled={isPending} title="Delete team"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Expanded: members */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-3 bg-slate-50/50">
          <div className="space-y-1">
            {team.members.length === 0 && (
              <p className="text-xs text-slate-400 italic">No members yet.</p>
            )}
            {team.members.map(m => (
              <div key={m.id} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-xs font-semibold text-blue-700">
                    {(m.user.name || m.user.email).charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-slate-800">{m.user.name ?? m.user.email}</span>
                  <span className="text-xs text-slate-400">{m.user.email}</span>
                </div>
                <button
                  onClick={() => handleRemoveMember(m.userId)}
                  disabled={isPending}
                  className="text-slate-400 hover:text-red-500 disabled:opacity-50"
                  title="Remove from team"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {nonMembers.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <StyledSelect
                value={addUserId}
                onChange={e => setAddUserId(e.target.value)}
                className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Add a member…</option>
                {nonMembers.map(u => (
                  <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
                ))}
              </StyledSelect>
              <Button size="sm" onClick={handleAddMember} disabled={!addUserId || isPending} className="text-xs h-7">
                Add
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function UserManager({ users, teams, currentUserId }: Props) {
  const [tab, setTab] = useState<"users" | "teams">("users")
  const [isPending, startTransition] = useTransition()
  const [addOpen, setAddOpen] = useState(false)
  const [addTeamOpen, setAddTeamOpen] = useState(false)
  const [resetUserId, setResetUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Add user form
  const [newName, setNewName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newIsSuperAdmin, setNewIsSuperAdmin] = useState(false)
  const [newTeamId, setNewTeamId] = useState("")
  const [addErrors, setAddErrors] = useState<Record<string, string[]>>({})

  // Reset password
  const [newPw, setNewPw] = useState("")

  // Permissions dialog
  const [permUserId, setPermUserId] = useState<string | null>(null)
  const [selectedPerms, setSelectedPerms] = useState<string[]>([])

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault()
    setAddErrors({})
    startTransition(async () => {
      const role = newIsSuperAdmin ? Role.ADMIN : Role.STAFF
      const result = await inviteUser({ name: newName, email: newEmail, role })
      if (result?.error) {
        setAddErrors(result.error as Record<string, string[]>)
      } else {
        if (newTeamId && !newIsSuperAdmin && result.userId) {
          await addTeamMember(newTeamId, result.userId)
        }
        setAddOpen(false)
        setNewName(""); setNewEmail(""); setNewPassword("")
        setNewIsSuperAdmin(false); setNewTeamId("")
        setSuccess(result.emailSent
          ? `Invitation sent to ${newEmail}.`
          : `User created, but the invite email failed to send. Share this link: ${result.inviteLink}`)
        setTimeout(() => setSuccess(null), result.emailSent ? 4000 : 20000)
      }
    })
  }

  async function handleResendInvite(userId: string, email: string) {
    startTransition(async () => {
      const res = await resendInvite(userId)
      if ((res as any)?.error) { setError((res as any).error); setTimeout(() => setError(null), 4000); return }
      setSuccess((res as any).emailSent
        ? `Invitation re-sent to ${email}.`
        : `Invite link (email failed): ${(res as any).inviteLink}`)
      setTimeout(() => setSuccess(null), (res as any).emailSent ? 4000 : 20000)
    })
  }

  async function handleToggleSuperAdmin(userId: string, makeAdmin: boolean) {
    startTransition(async () => {
      const result = await updateUserRole(userId, makeAdmin ? Role.ADMIN : Role.STAFF)
      if (result?.error) setError(typeof result.error === "string" ? result.error : "Error")
    })
  }

  async function handleDelete(userId: string) {
    if (!confirm("Delete this user? This cannot be undone.")) return
    startTransition(async () => {
      const result = await deleteUser(userId)
      if (result?.error) setError(typeof result.error === "string" ? result.error : "Error")
    })
  }

  async function handleSavePermissions() {
    if (!permUserId) return
    startTransition(async () => {
      const result = await updateUserPermissions(permUserId, selectedPerms)
      if (result?.error) {
        setError(typeof result.error === "string" ? result.error : "Error")
      } else {
        setPermUserId(null)
        setSuccess("Permissions updated.")
        setTimeout(() => setSuccess(null), 4000)
      }
    })
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!resetUserId) return
    startTransition(async () => {
      const result = await resetPassword(resetUserId, newPw)
      if (result?.error) {
        setError(typeof result.error === "string" ? result.error : "Error")
      } else {
        setResetUserId(null); setNewPw("")
        setSuccess("Password reset successfully.")
        setTimeout(() => setSuccess(null), 4000)
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* Tabs + action */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {(["users", "teams"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize",
                tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              {t === "users" ? `Users (${users.length})` : `Teams (${teams.length})`}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">
              {error}
              <button className="ml-2 underline" onClick={() => setError(null)}>Dismiss</button>
            </p>
          )}
          {success && <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-md">{success}</p>}

          {tab === "users" && (
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />Invite User</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Invite a User</DialogTitle></DialogHeader>
                <form onSubmit={handleAddUser} className="space-y-4">
                  <p className="text-sm text-slate-500">
                    They&apos;ll get an email with a link to set their own password and activate their account.
                  </p>
                  <div className="space-y-1.5">
                    <Label>Full Name *</Label>
                    <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Jane Smith" required />
                    {addErrors.name && <p className="text-xs text-red-600">{addErrors.name[0]}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email *</Label>
                    <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} type="email" placeholder="jane@genesisortho.com" required />
                    {addErrors.email && <p className="text-xs text-red-600">{addErrors.email[0]}</p>}
                  </div>

                  <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-slate-200 px-3 py-2.5 hover:bg-slate-50">
                    <Checkbox
                      checked={newIsSuperAdmin}
                      onCheckedChange={v => { setNewIsSuperAdmin(!!v); if (v) setNewTeamId("") }}
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-800">Super Admin</p>
                      <p className="text-xs text-slate-500">Full access to all sections and features</p>
                    </div>
                    <Crown className="h-4 w-4 text-amber-500 ml-auto" />
                  </label>

                  {!newIsSuperAdmin && (
                    <div className="space-y-1.5">
                      <Label>Assign to Team</Label>
                      <Select value={newTeamId || "none"} onValueChange={v => setNewTeamId(v === "none" ? "" : v)}>
                        <SelectTrigger><SelectValue placeholder="No team (assign later)" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No team (assign later)</SelectItem>
                          {teams.map(t => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={isPending}>
                      {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Send Invite
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}

          {tab === "teams" && (
            <Dialog open={addTeamOpen} onOpenChange={setAddTeamOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />New Team</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Create Team</DialogTitle></DialogHeader>
                <TeamForm onSave={() => setAddTeamOpen(false)} onCancel={() => setAddTeamOpen(false)} />
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* ── Users tab ── */}
      {tab === "users" && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <th className="text-left px-6 py-3 font-semibold">Name</th>
                <th className="text-left px-6 py-3 font-semibold">Email</th>
                <th className="text-left px-6 py-3 font-semibold">Team</th>
                <th className="text-left px-6 py-3 font-semibold">Referrals</th>
                <th className="text-right px-6 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSuperAdmin = u.role === "ADMIN"
                return (
                  <tr key={u.id} className="border-b hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center w-7 h-7 bg-blue-100 rounded-full text-xs font-semibold text-blue-700">
                          {(u.name || u.email).charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-900">
                          {u.name ?? "—"}
                          {u.id === currentUserId && <span className="ml-1 text-xs text-slate-400">(you)</span>}
                          {!u.isActive && <span className="ml-2 text-xs font-medium bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full align-middle">Invited</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-slate-600">{u.email}</td>
                    <td className="px-6 py-3">
                      {isSuperAdmin ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
                          <Crown className="h-3 w-3" /> Super Admin
                        </span>
                      ) : u.teamMemberships.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {u.teamMemberships.map(m => (
                            <span key={m.team.id} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                              {m.team.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">No team</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-slate-600">{u._count.referralsCreated}</td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {u.id !== currentUserId && (
                          <Button
                            size="icon" variant="ghost"
                            className={cn("h-8 w-8", isSuperAdmin ? "text-amber-500 hover:text-amber-700 hover:bg-amber-50" : "text-slate-400 hover:text-amber-500 hover:bg-amber-50")}
                            title={isSuperAdmin ? "Revoke Super Admin" : "Make Super Admin"}
                            onClick={() => handleToggleSuperAdmin(u.id, !isSuperAdmin)}
                            disabled={isPending}
                          >
                            <Crown className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="icon" variant="ghost" className="h-8 w-8"
                          title="Manage individual permissions"
                          onClick={() => { setPermUserId(u.id); setSelectedPerms(u.permissions) }}
                        >
                          <ShieldCheck className="h-4 w-4" />
                        </Button>
                        {!u.isActive && (
                          <Button
                            size="icon" variant="ghost"
                            className="h-8 w-8 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                            title="Resend invitation"
                            disabled={isPending}
                            onClick={() => handleResendInvite(u.id, u.email)}
                          >
                            <Mail className="h-4 w-4" />
                          </Button>
                        )}
                        {u.isActive && (
                          <Button
                            size="icon" variant="ghost" className="h-8 w-8"
                            title="Reset password"
                            onClick={() => { setResetUserId(u.id); setNewPw("") }}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                        )}
                        {u.id !== currentUserId && (
                          <Button
                            size="icon" variant="ghost"
                            className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                            disabled={isPending}
                            onClick={() => handleDelete(u.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Teams tab ── */}
      {tab === "teams" && (
        <div className="space-y-3">
          {teams.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl">
              No teams yet. Create one to group users and control which sections they can access.
            </div>
          )}
          {teams.map(team => (
            <TeamCard key={team.id} team={team} users={users} />
          ))}
        </div>
      )}

      {/* Individual Permissions Dialog */}
      {(() => {
        const permUser = permUserId ? users.find(u => u.id === permUserId) : null
        const isSuperAdmin = permUser?.role === "ADMIN"
        return (
          <Dialog open={!!permUserId} onOpenChange={o => !o && setPermUserId(null)}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  Individual Permissions
                  {permUser && <span className="ml-2 text-sm font-normal text-slate-500">— {permUser.name ?? permUser.email}</span>}
                </DialogTitle>
              </DialogHeader>
              <div className="py-2">
                {isSuperAdmin ? (
                  <p className="text-sm text-slate-500 bg-amber-50 border border-amber-100 rounded-md px-3 py-2 flex items-center gap-2">
                    <Crown className="h-4 w-4 text-amber-500 shrink-0" />
                    Super Admin users have full access to everything.
                  </p>
                ) : (
                  <div className="space-y-5">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Individual overrides (in addition to team permissions)</p>
                      <PermissionEditor perms={selectedPerms} onChange={setSelectedPerms} />
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPermUserId(null)}>Cancel</Button>
                {!isSuperAdmin && (
                  <Button onClick={handleSavePermissions} disabled={isPending}>
                    {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Save
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )
      })()}

      {/* Reset Password Dialog */}
      <Dialog open={!!resetUserId} onOpenChange={o => !o && setResetUserId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset Password</DialogTitle></DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label>New Password</Label>
              <Input value={newPw} onChange={e => setNewPw(e.target.value)} type="password" placeholder="Min. 6 characters" required minLength={6} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetUserId(null)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Reset Password
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
