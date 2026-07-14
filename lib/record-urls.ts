// Detail/list URLs per object registry key. Pure (no "use server"), so client
// components can import it.

const LIST_URL: Record<string, string> = {
  PROVIDER: "/referring-doctors",
  PRACTICE: "/referring-doctors",
  LOCATION: "/locations",
  SURGERY: "/surgery",
  REFERRAL: "/referrals",
}

export function listUrlFor(entityType: string): string {
  if (entityType.startsWith("CO:")) return `/objects/${entityType.slice(3)}`
  return LIST_URL[entityType] ?? "/"
}
