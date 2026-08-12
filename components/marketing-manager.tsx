"use client"

import { useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, Upload, Loader2, FileText, Check, Pencil, X, Package, Settings } from "lucide-react"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import {
  createCategory, renameCategory, deleteCategory,
  createMarketingItem, deleteMarketingItem,
  saveMarketingConfig,
  markOrderReviewed, deleteMarketingOrder,
} from "@/app/actions/marketing"

interface Item {
  id: string
  title: string
  description: string | null
  fileUrl: string
  fileName: string
  createdAt: string
}

interface Category {
  id: string
  name: string
  order: number
  items: Item[]
}

interface Order {
  id: string
  name: string
  email: string
  quantity: number
  address: string
  status: string
  createdAt: string
  item: { title: string; fileName: string; fileUrl: string; category: { name: string } }
}

interface Props {
  categories: Category[]
  orders: Order[]
  notifyEmail: string
}

const TABS = ["materials", "orders"] as const
type Tab = typeof TABS[number]

export default function MarketingManager({ categories: initialCategories, orders: initialOrders, notifyEmail: initialEmail }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>("materials")
  const [isPending, startTransition] = useTransition()

  // Config
  const [notifyEmail, setNotifyEmail] = useState(initialEmail)
  const [emailSaved, setEmailSaved] = useState(false)

  // New category
  const [newCatName, setNewCatName] = useState("")
  const [addingCat, setAddingCat] = useState(false)

  // Rename
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")

  // Upload state per category
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [uploadTitle, setUploadTitle] = useState<Record<string, string>>({})
  const [uploadDesc, setUploadDesc] = useState<Record<string, string>>({})
  const [showUpload, setShowUpload] = useState<Record<string, boolean>>({})
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  function refresh() { router.refresh() }

  function saveEmail() {
    startTransition(async () => {
      await saveMarketingConfig(notifyEmail)
      setEmailSaved(true)
      setTimeout(() => setEmailSaved(false), 2000)
    })
  }

  function addCategory() {
    if (!newCatName.trim()) return
    startTransition(async () => {
      await createCategory(newCatName)
      setNewCatName("")
      setAddingCat(false)
      refresh()
    })
  }

  function startRename(cat: Category) {
    setRenamingId(cat.id)
    setRenameValue(cat.name)
  }

  function applyRename(id: string) {
    if (!renameValue.trim()) return
    startTransition(async () => {
      await renameCategory(id, renameValue)
      setRenamingId(null)
      refresh()
    })
  }

  async function deleteCat(id: string) {
    if (!(await confirmDialog("Delete this category and all its items?"))) return
    startTransition(async () => {
      await deleteCategory(id)
      refresh()
    })
  }

  async function handleFileUpload(catId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const title = uploadTitle[catId]?.trim()
    if (!title) { alert("Enter a title first."); return }

    setUploading((p) => ({ ...p, [catId]: true }))
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/settings/marketing/upload", { method: "POST", body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      await createMarketingItem({
        categoryId: catId,
        title,
        description: uploadDesc[catId]?.trim() || undefined,
        fileUrl: json.url,
        fileName: json.fileName,
      })
      setUploadTitle((p) => ({ ...p, [catId]: "" }))
      setUploadDesc((p) => ({ ...p, [catId]: "" }))
      setShowUpload((p) => ({ ...p, [catId]: false }))
      if (fileRefs.current[catId]) fileRefs.current[catId]!.value = ""
      refresh()
    } catch (err: any) {
      alert(err.message ?? "Upload failed")
    } finally {
      setUploading((p) => ({ ...p, [catId]: false }))
    }
  }

  async function deleteItem(id: string) {
    if (!(await confirmDialog("Delete this item?"))) return
    startTransition(async () => {
      await deleteMarketingItem(id)
      refresh()
    })
  }

  function markReviewed(id: string) {
    startTransition(async () => {
      await markOrderReviewed(id)
      refresh()
    })
  }

  async function deleteOrder(id: string) {
    if (!(await confirmDialog("Delete this order?"))) return
    startTransition(async () => {
      await deleteMarketingOrder(id)
      refresh()
    })
  }

  function isImage(url: string) { return /\.(png|jpg|jpeg|gif|webp)$/i.test(url) }
  function fmt(d: string) { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) }

  const pendingOrders = initialOrders.filter((o) => o.status === "PENDING").length

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-zinc-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors -mb-px ${
              tab === t ? "border-blue-600 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {t}
            {t === "orders" && pendingOrders > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                {pendingOrders}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── MATERIALS TAB ── */}
      {tab === "materials" && (
        <div className="space-y-6">
          {/* Notification email */}
          <div className="bg-white border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Settings className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-700">Notification Settings</h2>
            </div>
            <div className="flex items-center gap-3 max-w-md">
              <input
                type="email"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                placeholder="orders@yourdomain.com"
                className="flex-1 h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400"
              />
              <button
                onClick={saveEmail}
                disabled={isPending}
                className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
              >
                {emailSaved ? <><Check className="h-3.5 w-3.5" /> Saved</> : "Save"}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-400">Orders will be emailed to this address.</p>
          </div>

          {/* Categories */}
          {initialCategories.map((cat) => (
            <div key={cat.id} className="bg-white border rounded-xl overflow-hidden">
              {/* Category header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-100 bg-zinc-50">
                {renamingId === cat.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") applyRename(cat.id); if (e.key === "Escape") setRenamingId(null) }}
                      className="flex-1 h-8 px-2 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-zinc-500 max-w-xs"
                    />
                    <button onClick={() => applyRename(cat.id)} disabled={isPending} className="text-xs px-3 h-8 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">Save</button>
                    <button onClick={() => setRenamingId(null)} className="h-8 w-8 flex items-center justify-center text-zinc-400 hover:text-zinc-700 rounded-lg"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-800">{cat.name}</h3>
                    <span className="text-xs text-slate-400">{cat.items.length} item{cat.items.length !== 1 ? "s" : ""}</span>
                  </div>
                )}
                <div className="flex items-center gap-1 ml-4">
                  <button onClick={() => startRename(cat)} className="h-7 w-7 flex items-center justify-center text-zinc-400 hover:text-zinc-700 rounded-lg transition-colors" title="Rename">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => deleteCat(cat.id)} className="h-7 w-7 flex items-center justify-center text-zinc-400 hover:text-red-500 rounded-lg transition-colors" title="Delete category">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="p-5">
                {/* Items grid */}
                {cat.items.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-4">
                    {cat.items.map((item) => (
                      <div key={item.id} className="group relative border rounded-xl overflow-hidden bg-slate-50 hover:border-zinc-300 transition-colors">
                        <div className="aspect-square flex items-center justify-center bg-slate-100">
                          {isImage(item.fileUrl) ? (
                            <img src={item.fileUrl} alt={item.title} className="w-full h-full object-cover" />
                          ) : (
                            <FileText className="h-8 w-8 text-slate-400" />
                          )}
                        </div>
                        <div className="p-2">
                          <p className="text-xs font-medium text-slate-700 truncate">{item.title}</p>
                          {item.description && <p className="text-[10px] text-slate-400 truncate">{item.description}</p>}
                        </div>
                        <button
                          onClick={() => deleteItem(item.id)}
                          className="absolute top-1.5 right-1.5 h-6 w-6 flex items-center justify-center bg-white/90 hover:bg-red-50 text-zinc-400 hover:text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload form */}
                {showUpload[cat.id] ? (
                  <div className="border border-dashed border-zinc-300 rounded-xl p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Title (required)"
                        value={uploadTitle[cat.id] ?? ""}
                        onChange={(e) => setUploadTitle((p) => ({ ...p, [cat.id]: e.target.value }))}
                        className="h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400"
                      />
                      <input
                        type="text"
                        placeholder="Description (optional)"
                        value={uploadDesc[cat.id] ?? ""}
                        onChange={(e) => setUploadDesc((p) => ({ ...p, [cat.id]: e.target.value }))}
                        className="h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <label className={`flex items-center gap-2 h-9 px-4 text-sm font-medium rounded-lg border cursor-pointer transition-colors ${uploadTitle[cat.id]?.trim() ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700" : "bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed"}`}>
                        {uploading[cat.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        Choose file
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.webp,.gif"
                          className="hidden"
                          disabled={!uploadTitle[cat.id]?.trim() || uploading[cat.id]}
                          ref={(el) => { fileRefs.current[cat.id] = el }}
                          onChange={(e) => handleFileUpload(cat.id, e)}
                        />
                      </label>
                      <button onClick={() => setShowUpload((p) => ({ ...p, [cat.id]: false }))} className="text-sm text-zinc-400 hover:text-zinc-700 transition-colors">Cancel</button>
                    </div>
                    <p className="text-xs text-slate-400">Accepts PDF, JPG, PNG, WebP, GIF — max 20 MB</p>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowUpload((p) => ({ ...p, [cat.id]: true }))}
                    className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Add item
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Add category */}
          {addingCat ? (
            <div className="flex items-center gap-3">
              <input
                autoFocus
                type="text"
                placeholder="Category name"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addCategory(); if (e.key === "Escape") setAddingCat(false) }}
                className="h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 w-64"
              />
              <button onClick={addCategory} disabled={isPending || !newCatName.trim()} className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">Add</button>
              <button onClick={() => setAddingCat(false)} className="text-sm text-zinc-400 hover:text-zinc-700 transition-colors">Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setAddingCat(true)}
              className="flex items-center gap-2 h-9 px-4 text-sm font-medium border border-dashed border-zinc-300 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 rounded-xl transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add category
            </button>
          )}
        </div>
      )}

      {/* ── ORDERS TAB ── */}
      {tab === "orders" && (
        <div className="bg-white border rounded-xl overflow-hidden">
          {initialOrders.length === 0 ? (
            <div className="py-16 text-center">
              <Package className="h-8 w-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-400">No orders yet.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-semibold">Item</th>
                  <th className="text-left px-4 py-3 font-semibold">Name</th>
                  <th className="text-left px-4 py-3 font-semibold">Email</th>
                  <th className="text-left px-4 py-3 font-semibold">Qty</th>
                  <th className="text-left px-4 py-3 font-semibold">Ship to</th>
                  <th className="text-left px-4 py-3 font-semibold">Date</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {initialOrders.map((o) => (
                  <tr key={o.id} className={`border-b transition-colors ${o.status === "PENDING" ? "bg-amber-50/40" : "hover:bg-slate-50"}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{o.item.title}</p>
                      <p className="text-xs text-slate-400">{o.item.category.name}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{o.name}</td>
                    <td className="px-4 py-3 text-slate-600">{o.email}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{o.quantity}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-[180px]">
                      <span className="whitespace-pre-wrap text-xs">{o.address}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmt(o.createdAt)}</td>
                    <td className="px-4 py-3">
                      {o.status === "PENDING" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Pending</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Reviewed</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {o.status === "PENDING" && (
                          <button
                            onClick={() => markReviewed(o.id)}
                            disabled={isPending}
                            className="h-7 px-2.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            title="Mark reviewed"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                        )}
                        <a href={o.item.fileUrl} target="_blank" rel="noreferrer"
                          className="h-7 px-2.5 flex items-center text-xs font-medium border border-zinc-200 text-zinc-600 rounded-lg hover:border-zinc-400 transition-colors">
                          <FileText className="h-3 w-3" />
                        </a>
                        <button
                          onClick={() => deleteOrder(o.id)}
                          disabled={isPending}
                          className="h-7 w-7 flex items-center justify-center text-zinc-300 hover:text-red-500 rounded-lg transition-colors"
                          title="Delete order"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
