"use client"

import { useState } from "react"
import { Pencil, Mail } from "lucide-react"
import RecordActionsMenu, { RECORD_ACTION_ITEM } from "@/components/record-actions-menu"
import EditReferralDialog from "@/components/edit-referral-dialog"
import OutreachDialog from "@/components/outreach-dialog"
import type { RecordFieldDef } from "@/lib/record-field-catalog"

// The referral's Actions menu: the shared record menu (View all properties,
// Merge, Delete) plus referral-only Edit and Send Message items, so the detail
// header has a single Actions button like every other object.
export default function ReferralActions({
  referral, practices, pipelines, catalog, values, userMap, canEdit, canDelete, canOutreach,
}: {
  referral: any
  practices: any[]
  pipelines: any[]
  catalog: RecordFieldDef[]
  values: Record<string, any>
  userMap: Record<string, string>
  canEdit: boolean
  canDelete: boolean
  canOutreach: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [messaging, setMessaging] = useState(false)

  return (
    <>
      <RecordActionsMenu
        entityType="REFERRAL"
        recordId={referral.id}
        title={`${referral.patientFirstName} ${referral.patientLastName}`}
        catalog={catalog}
        values={values}
        userMap={userMap}
        canEdit={canEdit}
        canDelete={canDelete}
        cloneable={false}
        extraItems={(close) => (
          <>
            {canEdit && (
              <button className={RECORD_ACTION_ITEM} onClick={() => { close(); setEditing(true) }}>
                <Pencil className="h-4 w-4 text-slate-400" /> Edit
              </button>
            )}
            {canOutreach && (
              <button className={RECORD_ACTION_ITEM} onClick={() => { close(); setMessaging(true) }}>
                <Mail className="h-4 w-4 text-slate-400" /> Send message
              </button>
            )}
          </>
        )}
      />

      <EditReferralDialog referral={referral} practices={practices} pipelines={pipelines} open={editing} onOpenChange={setEditing} hideTrigger />
      {canOutreach && <OutreachDialog referral={referral} open={messaging} onOpenChange={setMessaging} hideTrigger />}
    </>
  )
}
