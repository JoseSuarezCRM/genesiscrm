"use client"

import { useState } from "react"
import { FileText, X, Loader2, CheckCircle2 } from "lucide-react"

interface Item {
  id: string
  title: string
  description: string | null
  fileUrl: string
  fileName: string
}

interface Category {
  id: string
  name: string
  items: Item[]
}

interface Props {
  categories: Category[]
}

export default function ResourcesCatalog({ categories }: Props) {
  const [activeCategory, setActiveCategory] = useState<string>(categories[0]?.id ?? "")
  const [orderItem, setOrderItem] = useState<Item | null>(null)

  const currentCategory = categories.find((c) => c.id === activeCategory)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Genesis Ortho</h1>
            <p className="text-sm text-slate-500">Marketing Materials Order Form</p>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {categories.length === 0 ? (
          <div className="text-center py-24 text-slate-400">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No materials available yet.</p>
          </div>
        ) : (
          <>
            {/* Category tabs */}
            <div className="flex gap-2 mb-8 flex-wrap">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    activeCategory === cat.id
                      ? "bg-slate-900 text-white"
                      : "bg-white border border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-900"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Items grid */}
            {currentCategory && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {currentCategory.items.map((item) => (
                  <ItemCard key={item.id} item={item} onOrder={() => setOrderItem(item)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Order modal */}
      {orderItem && (
        <OrderModal item={orderItem} onClose={() => setOrderItem(null)} />
      )}
    </div>
  )
}

function ItemCard({ item, onOrder }: { item: Item; onOrder: () => void }) {
  const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(item.fileUrl)

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-slate-400 hover:shadow-sm transition-all group">
      <div className="aspect-[4/3] bg-slate-100 flex items-center justify-center overflow-hidden">
        {isImage ? (
          <img src={item.fileUrl} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <FileText className="h-10 w-10 text-slate-300" />
        )}
      </div>
      <div className="p-3">
        <p className="font-semibold text-slate-800 text-sm truncate">{item.title}</p>
        {item.description && <p className="text-xs text-slate-500 mt-0.5 truncate">{item.description}</p>}
        <button
          onClick={onOrder}
          className="mt-3 w-full h-8 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition-colors"
        >
          Order this
        </button>
      </div>
    </div>
  )
}

function OrderModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [quantity, setQuantity] = useState(25)
  const [address, setAddress] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")

  async function submit() {
    if (!name.trim() || !email.trim() || !address.trim() || quantity < 1) {
      setError("Please fill in all fields.")
      return
    }
    setError("")
    setLoading(true)
    try {
      const res = await fetch("/api/resources/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, name, email, quantity, address }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setSuccess(true)
    } catch (err: any) {
      setError(err.message ?? "Something went wrong.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {success ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">Order Submitted!</h2>
            <p className="text-sm text-slate-500 mb-6">We&apos;ve received your order and will be in touch soon.</p>
            <button onClick={onClose} className="h-10 px-6 text-sm font-medium bg-slate-900 text-white rounded-xl hover:bg-slate-700 transition-colors">Done</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="font-bold text-slate-900">Place an Order</h2>
                <p className="text-sm text-slate-500">{item.title}</p>
              </div>
              <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Full Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Email *</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jane@example.com"
                    className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Quantity *</label>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Shipping Address *</label>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={"123 Main St\nChicago, IL 60601"}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 resize-none"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                onClick={submit}
                disabled={loading}
                className="w-full h-10 text-sm font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Order"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
