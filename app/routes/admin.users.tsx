import { Form, Link, redirect, useLoaderData } from 'react-router'
import { platformInviteEmail, sendEmail } from 'email'

import { requireAdmin } from '../auth/session.server'
import { DeleteUserButton } from '../components/admin/delete-user-button'
import { getSystemAgent } from '../data/agents.server'
import { deactivateUser, deleteUserCompletely } from '../data/user-admin.server'
import type { Route } from './+types/admin.users'

export const loader = async ({ request, context }: Route.LoaderArgs) => {
  await requireAdmin(request, context.cloudflare.env)

  const system = await getSystemAgent(context.cloudflare.env)

  const users = await system.listUsers()

  return { users: users.ok ? users.body : [] }
}

export const action = async ({ request, context }: Route.ActionArgs) => {
  const admin = await requireAdmin(request, context.cloudflare.env)

  const env = context.cloudflare.env

  const formData = await request.formData()

  const intent = String(formData.get('intent'))

  const system = await getSystemAgent(env)

  if (intent === 'invite') {
    const email = String(formData.get('email'))

    const token = crypto.randomUUID()

    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7

    await system.createInvite({
      token,
      email,
      invitedBy: admin.email,
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

  if (intent === 'deactivate') {
    await deactivateUser({ env, email: String(formData.get('email')) })
  }

  if (intent === 'activate') {
    await system.setUserStatus(String(formData.get('email')), 'active')
  }

  if (intent === 'delete') {
    if (formData.get('confirm') !== 'true') throw redirect('/admin/users')

    await deleteUserCompletely({ env, email: String(formData.get('email')) })
  }

  throw redirect('/admin/users')
}

export default function AdminUsersPage() {
  const { users } = useLoaderData<typeof loader>()

  return (
    <div className="page max-w-3xl">
      <Link to="/" className="link-back">
        ← Home
      </Link>

      <h1 className="mt-4 mb-6 text-2xl font-semibold">User Administration</h1>

      <Form method="post" className="mb-8 flex gap-2">
        <input type="hidden" name="intent" value="invite" />

        <input name="email" type="email" required placeholder="Invite email" className="field flex-1" />

        <button type="submit" className="btn btn-primary">
          Invite
        </button>
      </Form>

      <ul className="grid gap-2">
        {users.map((user) => (
          <li key={user.email} className="list-row flex items-center justify-between">
            <div>
              <div className="font-medium">{user.email}</div>

              <div className="text-muted-foreground text-xs">
                {user.role} · {user.status}
              </div>
            </div>

            <div className="flex gap-2">
              <Form method="post">
                <input type="hidden" name="email" value={user.email} />

                <input type="hidden" name="intent" value={user.status === 'active' ? 'deactivate' : 'activate'} />

                <button type="submit" className="link-muted">
                  {user.status === 'active' ? 'Deactivate' : 'Activate'}
                </button>
              </Form>

              <DeleteUserButton email={user.email} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
