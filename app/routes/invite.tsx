import { redirect, useActionData, useLoaderData } from 'react-router'
import { hashPassword, validatePassword } from 'utils/password'

import { PasswordFormFields } from '~/components/auth/password-form-fields'
import { createUserSession } from '../auth/session.server'
import { getSystemAgent, getTeamAgent, getUserAgent } from '../data/agents.server'
import { getMaxAppAdmins } from '../data/user-admin.server'
import type { Route } from './+types/invite'

export const loader = async ({ params, context }: Route.LoaderArgs) => {
  const system = await getSystemAgent(context.cloudflare.env)

  const invite = await system.getInvite(params.token!)

  if (!invite.ok) return { error: invite.errors.join(', ') }

  return {
    email: invite.body.email,
    teamId: invite.body.teamId,
    token: params.token,
  }
}

export const action = async ({ request, context, params }: Route.ActionArgs) => {
  const env = context.cloudflare.env

  const formData = await request.formData()
  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  const validation = validatePassword({ password, confirm })
  if (!validation.ok) return { error: validation.error }

  const system = await getSystemAgent(env)

  const invite = await system.consumeInvite(params.token!)

  if (!invite.ok) return { error: invite.errors.join(', ') }

  const existing = await system.getUserByEmail(invite.body.email)

  if (!existing.ok) return { error: 'Failed to check user' }

  const inviteRole = invite.body.role === 'app_admin' ? 'app_admin' : 'user'

  if (!existing.body) {
    if (inviteRole === 'app_admin') {
      const count = await system.countAppAdmins()
      if (!count.ok) return { error: 'Failed to count app admins' }
      if (count.body >= getMaxAppAdmins(env)) return { error: `Cannot have more than ${getMaxAppAdmins(env)} app admins` }
    }

    const passwordHash = await hashPassword(password)

    const created = await system.createUser({
      email: invite.body.email,
      passwordHash,
      role: inviteRole,
    })

    if (!created.ok) return { error: created.errors.join(', ') }
  } else if (!invite.body.teamId && inviteRole === 'app_admin' && existing.body.role !== 'app_admin') {
    const count = await system.countAppAdmins()
    if (!count.ok) return { error: 'Failed to count app admins' }
    if (count.body >= getMaxAppAdmins(env)) return { error: `Cannot have more than ${getMaxAppAdmins(env)} app admins` }

    const updated = await system.updateUserRole(invite.body.email, 'app_admin')
    if (!updated.ok) return { error: updated.errors.join(', ') }
  }

  await Promise.all([
    invite.body.teamId
      ? (async () => {
          const team = await getTeamAgent(env, invite.body.teamId!)
          await team.addMember({ email: invite.body.email })
        })()
      : Promise.resolve(),
    (async () => {
      const userAgent = await getUserAgent(env, invite.body.email)
      await userAgent.initializeUser(invite.body.email)
    })(),
  ])

  const sessionUser = await system.getUserByEmail(invite.body.email)
  if (!sessionUser.ok || !sessionUser.body) return { error: 'Failed to load user' }

  const cookie = await createUserSession({
    request,
    env,
    user: {
      email: sessionUser.body.email,
      role: sessionUser.body.role,
      mustChangePassword: sessionUser.body.mustChangePassword,
    },
  })

  throw redirect('/', { headers: { 'Set-Cookie': cookie } })
}

export default function InvitePage() {
  const data = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()

  if ('error' in data && data.error) return <div className="page text-muted-foreground">{data.error}</div>

  return (
    <div className="auth-shell">
      <div className="card auth-card">
        <h1 className="mb-4 text-2xl font-semibold">Create your account</h1>

        <p className="text-muted-foreground mb-4 text-sm">{data.email}</p>

        <PasswordFormFields actionError={actionData?.error} submitLabel="Create account" />
      </div>
    </div>
  )
}
