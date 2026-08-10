// Registry key ("PROVIDER", "CO:<key>", …) → permission object key. Plain module
// so route handlers and "use server" actions can both import it.
export function recordPermKey(recordType: string): string {
  if (recordType.startsWith("CO:")) return recordType
  return ({ REFERRAL: "REFERRALS", PROVIDER: "PROVIDERS", PRACTICE: "PRACTICES", LOCATION: "LOCATIONS", SURGERY: "SURGERY", ACTIVITY: "ACTIVITIES", TASK: "TASKS" } as Record<string, string>)[recordType] ?? recordType
}
