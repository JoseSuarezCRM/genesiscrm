"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { Loader2, Check } from "lucide-react"
import { acceptInvite } from "@/app/actions/users"

export default function AcceptInviteForm({ token, name, minLength }: { token: string; name: string; minLength: number }) {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (password !== confirm) { setError("Passwords don't match."); return }
    setLoading(true)
    const res = await acceptInvite(token, password) as { success?: boolean; error?: string; email?: string }
    if (res?.error) {
      setError(res.error)
      setLoading(false)
      return
    }
    // Auto sign-in with the freshly set password, then land on the dashboard.
    const signInRes = await signIn("credentials", { email: res.email, password, redirect: false })
    if (signInRes?.error) {
      router.push("/login")
    } else {
      router.push("/")
      router.refresh()
    }
  }

  const inputCls = "w-full h-10 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      {name && <p className="text-sm text-slate-600">Welcome, <span className="font-medium text-slate-900">{name}</span>.</p>}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">New password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus placeholder="••••••••" className={inputCls} />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Confirm password</label>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required placeholder="••••••••" className={inputCls} />
      </div>
      <p className="text-xs text-slate-400">
        At least {minLength} characters, with upper &amp; lower case, a number, and a special character.
      </p>
      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>}
      <button type="submit" disabled={loading}
        className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Activate account
      </button>
    </form>
  )
}
