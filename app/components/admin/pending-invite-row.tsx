import { useState } from 'react'
import { Form, useNavigation } from 'react-router'
import type { InviteRecord } from 'roadmaps-agents'

import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { formatInviteExpiry, isInviteExpired } from '~/utils/invite-expiry'

type PendingInviteRowProps = {
  invite: InviteRecord
  showRole?: boolean
  teamName?: string
}

function ResendInviteButton({ token, teamName }: { token: string; teamName?: string }) {
  const navigation = useNavigation()
  const isSubmitting =
    navigation.state === 'submitting' &&
    navigation.formData?.get('intent') === 'resend-invite' &&
    navigation.formData?.get('token') === token

  return (
    <Form method="post" className="inline-flex">
      <input type="hidden" name="intent" value="resend-invite" />
      <input type="hidden" name="token" value={token} />
      {teamName ? <input type="hidden" name="teamName" value={teamName} /> : null}
      <Button type="submit" variant="outline" size="sm" disabled={isSubmitting}>
        {isSubmitting ? 'Sending…' : 'Resend'}
      </Button>
    </Form>
  )
}

function RevokeInviteButton({ token, email }: { token: string; email: string }) {
  const [open, setOpen] = useState(false)
  const navigation = useNavigation()
  const isSubmitting =
    navigation.state === 'submitting' &&
    navigation.formData?.get('intent') === 'revoke-invite' &&
    navigation.formData?.get('token') === token

  return (
    <>
      <Button type="button" variant="destructive" size="sm" disabled={isSubmitting} onClick={() => setOpen(true)}>
        {isSubmitting ? 'Revoking…' : 'Revoke'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke invitation?</DialogTitle>
            <DialogDescription>
              Cancel the pending invitation for <span className="text-foreground font-medium">{email}</span>. They
              will no longer be able to use the invite link.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>

            <Form method="post" onSubmit={() => setOpen(false)}>
              <input type="hidden" name="intent" value="revoke-invite" />
              <input type="hidden" name="token" value={token} />
              <Button type="submit" variant="destructive">
                Revoke invitation
              </Button>
            </Form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function PendingInviteRow({ invite, showRole = false, teamName }: PendingInviteRowProps) {
  const expired = isInviteExpired(invite.expiresAt)

  return (
    <li className="list-row text-muted-foreground flex items-center justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-normal">{invite.email}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">
            pending
          </span>
          {showRole && invite.role === 'app_admin' && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
              app admin
            </span>
          )}
          {expired && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal">expired</span>}
        </div>

        <div className="text-xs opacity-80">
          Invited by {invite.invitedBy} · {formatInviteExpiry(invite.expiresAt)}
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <ResendInviteButton token={invite.token} teamName={teamName} />
        <RevokeInviteButton token={invite.token} email={invite.email} />
      </div>
    </li>
  )
}
