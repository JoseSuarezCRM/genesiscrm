import PublicReferralForm from "@/components/public-referral-form"

export const metadata = { title: "Submit a Referral" }

export default function ReferPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Submit a Referral</h1>
          <p className="text-sm text-slate-500 mt-1">
            Please fill out the form below. Our team will follow up with the patient shortly.
          </p>
        </div>
        <PublicReferralForm />
      </div>
    </div>
  )
}
