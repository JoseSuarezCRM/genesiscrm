import Link from "next/link"
import { PhoneIncoming } from "lucide-react"

/** The intake's non-form states: not set up yet, a key conflict, a missing call. */
export function OnCallMessage({ title, body, back }: { title: string; body: string; back?: boolean }) {
  return (
    <div className="flex min-h-full items-start justify-center bg-zinc-50 px-4 py-16">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 text-center">
        <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100">
          <PhoneIncoming className="h-5 w-5 text-zinc-500" />
        </span>
        <h1 className="text-base font-semibold text-zinc-900">{title}</h1>
        <p className="mt-1.5 text-sm text-zinc-600">{body}</p>
        {back && (
          <Link href="/on-call" className="mt-4 inline-flex h-9 items-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800">
            New call
          </Link>
        )}
      </div>
    </div>
  )
}
