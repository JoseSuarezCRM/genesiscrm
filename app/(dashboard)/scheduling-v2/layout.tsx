import { redirect } from "next/navigation"
import { Montserrat, Open_Sans, IBM_Plex_Mono } from "next/font/google"
import { auth } from "@/lib/auth"
import { getSchedulingState } from "@/app/actions/scheduling-state"
import { SchedulingProvider } from "@/components/scheduling-v2/store"
import { PlannerToastHost } from "@/components/scheduling-v2/toast"
import PlannerSidebar from "@/components/scheduling-v2/sidebar"
import PlannerHeader from "@/components/scheduling-v2/header"
import "./planner.css"

// The Operations Planner keeps the standalone dashboard's own layout — its
// nested sidebar and main column — inside the CRM shell. `.gosm10` is the scope
// every rule in planner.css hangs off; without it the section renders unstyled.
//
// The dashboard's three typefaces are self-hosted through next/font and reach
// planner.css as CSS variables, so the section keeps its own look without the
// CRM's Inter leaking in — or a render-blocking Google Fonts request.

const montserrat = Montserrat({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-montserrat" })
const openSans = Open_Sans({ subsets: ["latin"], weight: ["300", "400", "600", "700"], variable: "--font-open-sans" })
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" })

export default async function SchedulingV2Layout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  const user = session?.user as any
  const perms = user?.permissions as string[] | undefined
  const allowed =
    user?.role === "ADMIN" ||
    perms?.includes("MANAGE_SCHEDULING") ||
    perms?.includes("NAV_SCHEDULING")
  if (!allowed) redirect("/")

  const initialState = await getSchedulingState()

  return (
    <SchedulingProvider initialState={initialState}>
      <PlannerToastHost>
        <div
          className={`gosm10 ${montserrat.variable} ${openSans.variable} ${plexMono.variable}`}
          style={{ height: "100%", background: "var(--bg)" }}
        >
          <div className="app-layout">
            <PlannerSidebar />
            <div className="main-content">
              <PlannerHeader />
              {children}
            </div>
          </div>
        </div>
      </PlannerToastHost>
    </SchedulingProvider>
  )
}
