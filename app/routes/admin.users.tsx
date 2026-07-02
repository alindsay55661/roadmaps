import { useMemo } from 'react'
import { Form, redirect, useLoaderData, useNavigation } from 'react-router'
import { platformInviteEmail, sendEmail } from 'email'
import type { ComponentProps } from 'react'

import { FloatingTooltip } from '~/components/roadmap/FloatingTooltip'
import { Button } from '~/components/ui/button'
import { requireAdmin } from '../auth/session.server'
import { DeleteUserButton } from '../components/admin/delete-user-button'
import { PendingInviteRow } from '../components/admin/pending-invite-row'
import { getSystemAgent } from '../data/agents.server'
import {
  isAdminScopedInvite,
  loadAdminPendingInvites,
  resendPlatformInvite,
  revokeScopedInvite,
} from '../data/pending-invites.server'
import {
  activateUser,
  deactivateUser,
  deleteUserCompletely,
  demoteUserFromAdmin,
  getMaxAppAdmins,
  promoteUserToAdmin,
} from '../data/user-admin.server'
import { getInviteExpiresAt } from '../utils/invite-expiry'
import { compareEmails } from '../utils/sort-by-email'
import type { Route } from './+types/admin.users'

type AdminActionButtonProps = ComponentProps<typeof Button> & {
  disabledReason?: string
}

function AdminActionButton({ disabledReason, disabled, ...props }: AdminActionButtonProps) {
  const button = <Button disabled={disabled} {...props} />

  if (!disabled || !disabledReason) return button

  return (
    <FloatingTooltip content={disabledReason} placement="top" maxWidth={260}>
      <span className="inline-flex" tabIndex={0}>
        {button}
      </span>
    </FloatingTooltip>
  )
}

export const loader = async ({ request, context }: Route.LoaderArgs) => {
  const admin = await requireAdmin(request, context.cloudflare.env)

  const system = await getSystemAgent(context.cloudflare.env)

  const users = await system.listUsers()
  const adminCount = await system.countAppAdmins()
  const pendingInvites = await loadAdminPendingInvites(system)

  return {
    currentUserEmail: admin.email,
    users: users.ok ? users.body : [],
    activeAdminCount: adminCount.ok ? adminCount.body : 0,
    maxAppAdmins: getMaxAppAdmins(context.cloudflare.env),
    pendingInvites,
  }
}

export const action = async ({ request, context }: Route.ActionArgs) => {
  const admin = await requireAdmin(request, context.cloudflare.env)

  const env = context.cloudflare.env

  const formData = await request.formData()

  const intent = String(formData.get('intent'))

  const system = await getSystemAgent(env)

  if (intent === 'invite') {
    const email = String(formData.get('email'))
    const role = formData.get('role') === 'app_admin' ? 'app_admin' : 'user'

    if (role === 'app_admin') {
      const count = await system.countAppAdmins()
      if (!count.ok) throw new Response('Failed to count app admins', { status: 500 })
      if (count.body >= getMaxAppAdmins(env)) {
        throw new Response(`Cannot have more than ${getMaxAppAdmins(env)} app admins`, { status: 400 })
      }
    }

    const token = crypto.randomUUID()
    const expiresAt = getInviteExpiresAt()

    await system.createInvite({
      token,
      email,
      invitedBy: admin.email,
      role,
      source: 'admin',
      expiresAt,
    })

    const appUrl = env.APP_URL || new URL(request.url).origin
    const inviteUrl = `${appUrl}/invite/${token}`
    const emailContent = platformInviteEmail({ inviteUrl, invitedByEmail: admin.email })

    await sendEmail(
      {
        to: email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      },
      env,
    )
  }

  if (intent === 'resend-invite') {
    await resendPlatformInvite({
      system,
      token: String(formData.get('token')),
      invitedByEmail: admin.email,
      env,
      requestUrl: request.url,
    })
  }

  if (intent === 'revoke-invite') {
    await revokeScopedInvite({
      system,
      token: String(formData.get('token')),
      isAllowed: isAdminScopedInvite,
    })
  }

  if (intent === 'deactivate') {
    await deactivateUser({ env, email: String(formData.get('email')) })
  }

  if (intent === 'promote-admin') {
    await promoteUserToAdmin({ env, email: String(formData.get('email')) })
  }

  if (intent === 'demote-admin') {
    await demoteUserFromAdmin({ env, email: String(formData.get('email')) })
  }

  if (intent === 'activate') {
    await activateUser({ env, email: String(formData.get('email')) })
  }

  if (intent === 'delete') {
    if (formData.get('confirm') !== 'true') throw redirect('/admin/users')

    await deleteUserCompletely({ env, email: String(formData.get('email')) })
  }

  throw redirect('/admin/users')
}

export default function AdminUsersPage() {
  const { users, currentUserEmail, activeAdminCount, maxAppAdmins, pendingInvites } =
    useLoaderData<typeof loader>()
  const navigation = useNavigation()
  const isInviting = navigation.state === 'submitting' && navigation.formData?.get('intent') === 'invite'

  const listItems = useMemo(
    () =>
      [
        ...pendingInvites.map((invite) => ({ kind: 'invite' as const, invite })),
        ...users.map((user) => ({ kind: 'user' as const, user })),
      ].sort((a, b) =>
        compareEmails(
          a.kind === 'invite' ? a.invite.email : a.user.email,
          b.kind === 'invite' ? b.invite.email : b.user.email,
        ),
      ),
    [pendingInvites, users],
  )

  return (
    <div className="max-w-3xl">
      <h2 className="mb-2 text-xl font-semibold">Users</h2>
      <p className="text-muted-foreground mb-6 text-sm">
        Manage users and assign up to {maxAppAdmins} named app admin seats.
      </p>

      <Form method="post" className="mb-8 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
        <input type="hidden" name="intent" value="invite" />

        <input name="email" type="email" required placeholder="Invite email" className="field flex-1" />

        <label className="text-muted-foreground flex shrink-0 items-center gap-2 text-sm">
          <input type="checkbox" name="role" value="app_admin" />
          Invite as app admin
        </label>

        <Button type="submit" className="shrink-0" disabled={isInviting}>
          {isInviting ? 'Sending…' : 'Invite'}
        </Button>
      </Form>

      <ul className="grid gap-2">
        {listItems.map((item) => {
          if (item.kind === 'invite') {
            return <PendingInviteRow key={item.invite.token} invite={item.invite} showRole />
          }

          const user = item.user
          const isActiveAppAdmin = user.role === 'app_admin' && user.status === 'active'
          const isLastActiveAppAdmin = isActiveAppAdmin && activeAdminCount <= 1
          const removeAdminDisabledReason = isLastActiveAppAdmin
            ? "You can't remove admin rights from the last active app admin. Promote another user to app admin first."
            : undefined
          const makeAdminDisabledReason =
            activeAdminCount >= maxAppAdmins
              ? `You've reached the maximum of ${maxAppAdmins} active app admins. Remove an admin before promoting another user.`
              : undefined
          const deactivateDisabledReason = isLastActiveAppAdmin
            ? "You can't deactivate the last active app admin. Promote another user to app admin first."
            : undefined
          const activateAdminDisabledReason =
            user.status !== 'active' && user.role === 'app_admin' && activeAdminCount >= maxAppAdmins
              ? `You've reached the maximum of ${maxAppAdmins} active app admins. Deactivate another app admin before activating this user.`
              : undefined
          const statusChangeDisabledReason =
            user.status === 'active' ? deactivateDisabledReason : activateAdminDisabledReason

          return (
            <li key={user.email} className="list-row flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 font-medium">
                  <span>{user.email}</span>
                  {user.email === currentUserEmail && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal">You</span>
                  )}
                  {user.role === 'app_admin' && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      app admin
                    </span>
                  )}
                </div>

                <div className="text-muted-foreground text-xs">
                  {user.role} · {user.status}
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                {user.role === 'app_admin' ? (
                  <Form method="post">
                    <input type="hidden" name="email" value={user.email} />
                    <input type="hidden" name="intent" value="demote-admin" />
                    <AdminActionButton
                      type="submit"
                      variant="outline"
                      size="sm"
                      disabled={isLastActiveAppAdmin}
                      disabledReason={removeAdminDisabledReason}
                    >
                      Remove admin
                    </AdminActionButton>
                  </Form>
                ) : (
                  <Form method="post">
                    <input type="hidden" name="email" value={user.email} />
                    <input type="hidden" name="intent" value="promote-admin" />
                    <AdminActionButton
                      type="submit"
                      variant="outline"
                      size="sm"
                      disabled={activeAdminCount >= maxAppAdmins}
                      disabledReason={makeAdminDisabledReason}
                    >
                      Make admin
                    </AdminActionButton>
                  </Form>
                )}

                <Form method="post">
                  <input type="hidden" name="email" value={user.email} />

                  <input
                    type="hidden"
                    name="intent"
                    value={user.status === 'active' ? 'deactivate' : 'activate'}
                  />

                  <AdminActionButton
                    type="submit"
                    variant="outline"
                    size="sm"
                    disabled={isLastActiveAppAdmin || !!activateAdminDisabledReason}
                    disabledReason={statusChangeDisabledReason}
                  >
                    {user.status === 'active' ? 'Deactivate' : 'Activate'}
                  </AdminActionButton>
                </Form>

                <DeleteUserButton
                  email={user.email}
                  disabled={isLastActiveAppAdmin}
                  disabledReason="You can't delete the last active app admin. Promote another user to app admin first."
                />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
