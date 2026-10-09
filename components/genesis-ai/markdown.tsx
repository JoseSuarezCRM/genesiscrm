"use client"

import Link from "next/link"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

// Genesis AI's answers: markdown with tables, no raw HTML. Only links into the
// CRM itself ("/referrals/…") are clickable — the model is told to use only the
// links its tools return, and anything else renders as plain text.

const isInternal = (href?: string) => !!href && href.startsWith("/") && !href.startsWith("//")

const components: Components = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-zinc-900">{children}</strong>,
  h1: ({ children }) => <h3 className="mb-1 mt-3 text-sm font-semibold text-zinc-900">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-1 mt-3 text-sm font-semibold text-zinc-900">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-1 mt-3 text-sm font-semibold text-zinc-800">{children}</h4>,
  blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-zinc-200 pl-3 text-zinc-600">{children}</blockquote>,
  hr: () => <hr className="my-3 border-zinc-100" />,
  code: ({ children }) => <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[12px] text-zinc-800">{children}</code>,
  pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-lg bg-zinc-50 p-3 text-[12px]">{children}</pre>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-zinc-200">
      <table className="w-full text-left text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-zinc-50 text-xs font-semibold text-zinc-600">{children}</thead>,
  tr: ({ children }) => <tr className="border-b border-zinc-100 last:border-0">{children}</tr>,
  th: ({ children }) => <th className="whitespace-nowrap px-3 py-1.5">{children}</th>,
  td: ({ children }) => <td className="px-3 py-1.5 align-top text-zinc-700">{children}</td>,
  a: ({ href, children }) =>
    isInternal(href)
      ? <Link href={href!} className="font-medium text-blue-600 hover:underline">{children}</Link>
      : <span>{children}</span>,
  img: () => null,
}

export default function Markdown({ text }: { text: string }) {
  return (
    <div className="text-sm text-zinc-800">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  )
}
