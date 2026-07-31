// The scope catalog for our public API (/api/v1) — client-safe (no server imports),
// so both the auth layer and the key-management UI can use it.

export const API_SCOPES = [
  { key: "referrals:read", label: "Read referrals", group: "Referrals", description: "List and fetch referrals" },
  { key: "referrals:write", label: "Create & update referrals", group: "Referrals", description: "Create new referrals and update existing ones" },
] as const

export type ApiScope = (typeof API_SCOPES)[number]["key"]
export const API_SCOPE_KEYS = API_SCOPES.map((s) => s.key) as string[]
