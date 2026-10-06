import { settingsPageOrRedirect } from "@/lib/auth-guard"
import { getPractice } from "@/app/actions/practice"
import { PracticeEditor } from "@/components/practice-editor"

export const dynamic = "force-dynamic"

export default async function PracticePage() {
  await settingsPageOrRedirect("practice")
  const practice = await getPractice()
  return (
    <div className="max-w-5xl">
      <PracticeEditor initial={practice} />
    </div>
  )
}
