"use client"

import { useState, useTransition } from "react"
import { Role } from "@prisma/client"
import { createUser, updateUserRole, deleteUser, resetPassword } from "@/app/actions/users"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Trash2, Loader2, KeyRound, ShieldCheck, User } from "lucide-react"

type UserRow = {
  id: string
  name: string | null
  email: string
  role: Role
  createdAt: Date
  _count: { referrals: number }
}

interface Props {
  users: UserRow[]
  currentUserId: string
}

export default function UserManager({ users, currentUserId }: Props) {
  const [isPending, startTransition] = useTransition()
  const [addOpen, setAddOpen] = useState(false)
  const [resetUserId, setResetUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Add user form state
  const [newName, setNewName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newRole, setNewRole] = useState<Role>(Role.STAFF)
  const [addErrors, setAddErrors] = useState<Record<string, string[]>>({})

  // Reset password state
  const [newPw, setNewPw] = useState("")

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault()
    setAddErrors({})
    startTransition(async () => {
      const result = await createUser({
        name: newName,
        email: newEmail,
        password: newPassword,
        role: newRole,
      })
      if (result?.error) {
        setAddErrors(result.error as Record<string, string[]>)
      } else {
        setAddOpen(false)
        setNewName("")
        setNewEmail("")
        setNewPassword("")
        setNewRole(Role.STAFF)
        setSuccess("User created successfully.")
        setTimeout(() => setSuccess(null), 4000)
      }
    })
  }

  async function handleRoleChange(userId: string, role: Role) {
    startTransition(async () => {
      const result = await updateUserRole(userId, role)
      if (result?.error) setError(typeof result.error === "string" ? result.error : "Error")
    })
  }

  async function handleDelete(userId: string) {
    startTransition(async () => {
      const result = await deleteUser(userId)
      if (result?.error) setError(typeof result.error === "string" ? result.error : "Error")
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
        setResetUserId(null)
        setNewPw("")
        setSuccess("Password reset successfully.")
        setTimeout(() => setSuccess(null), 4000)
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">
              {error}
              <button className="ml-2 underline" onClick={() => setError(null)}>
                Dismiss
              </button>
            </p>
          )}
          {success && (
            <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-md">
              {success}
            </p>
          )}
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Full Name *</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Jane Smith"
                  required
                />
                {addErrors.name && (
                  <p className="text-xs text-red-600">{addErrors.name[0]}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  type="email"
                  placeholder="jane@genesisortho.com"
                  required
                />
                {addErrors.email && (
                  <p className="text-xs text-red-600">{addErrors.email[0]}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Password *</Label>
                <Input
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  type="password"
                  placeholder="Min. 6 characters"
                  required
                />
                {addErrors.password && (
                  <p className="text-xs text-red-600">{addErrors.password[0]}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select
                  value={newRole}
                  onValueChange={(v) => setNewRole(v as Role)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={Role.STAFF}>Staff</SelectItem>
                    <SelectItem value={Role.ADMIN}>Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAddOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create User
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <th className="text-left px-6 py-3 font-semibold">Name</th>
              <th className="text-left px-6 py-3 font-semibold">Email</th>
              <th className="text-left px-6 py-3 font-semibold">Role</th>
              <th className="text-left px-6 py-3 font-semibold">Referrals</th>
              <th className="text-right px-6 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b hover:bg-slate-50 transition-colors">
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-7 h-7 bg-blue-100 rounded-full text-xs font-semibold text-blue-700">
                      {(u.name || u.email).charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-slate-900">
                      {u.name ?? "—"}
                      {u.id === currentUserId && (
                        <span className="ml-1 text-xs text-slate-400">(you)</span>
                      )}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-3 text-slate-600">{u.email}</td>
                <td className="px-6 py-3">
                  <Select
                    value={u.role}
                    onValueChange={(v) => handleRoleChange(u.id, v as Role)}
                    disabled={u.id === currentUserId || isPending}
                  >
                    <SelectTrigger className="w-28 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={Role.STAFF}>Staff</SelectItem>
                      <SelectItem value={Role.ADMIN}>Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-6 py-3 text-slate-600">{u._count.referrals}</td>
                <td className="px-6 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      title="Reset password"
                      onClick={() => {
                        setResetUserId(u.id)
                        setNewPw("")
                      }}
                    >
                      <KeyRound className="h-4 w-4" />
                    </Button>
                    {u.id !== currentUserId && (
                      <Button
                        size="icon"
                        variant="ghost"
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
            ))}
          </tbody>
        </table>
      </div>

      {/* Reset Password Dialog */}
      <Dialog
        open={!!resetUserId}
        onOpenChange={(o) => !o && setResetUserId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label>New Password</Label>
              <Input
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                type="password"
                placeholder="Min. 6 characters"
                required
                minLength={6}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setResetUserId(null)}
              >
                Cancel
              </Button>
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
