import type { RequiredEnvVars } from '../../env-required'
import { getSystemAgent, getTeamAgent, getUserAgent } from './agents.server'

export function getMaxAppAdmins(env: RequiredEnvVars) {
  const value = Number(env.MAX_APP_ADMINS ?? 5)
  return Number.isFinite(value) && value > 0 ? value : 5
}

async function requireUserRecord(env: RequiredEnvVars, email: string) {
  const system = await getSystemAgent(env)
  const user = await system.getUserByEmail(email)
  if (!user.ok || !user.body) throw new Response('User not found', { status: 404 })
  return user.body
}

async function assertCanRemoveAdminRole({
  env,
  email,
}: {
  env: RequiredEnvVars
  email: string
}) {
  const user = await requireUserRecord(env, email)
  if (user.role !== 'app_admin' || user.status !== 'active') return

  const system = await getSystemAgent(env)
  const count = await system.countAppAdmins()
  if (!count.ok || count.body <= 1) {
    throw new Response('Cannot remove the last active app admin', { status: 400 })
  }
}

export async function promoteUserToAdmin({ env, email }: { env: RequiredEnvVars; email: string }) {
  const system = await getSystemAgent(env)
  const user = await requireUserRecord(env, email)
  if (user.role === 'app_admin') return

  const count = await system.countAppAdmins()
  if (!count.ok) throw new Response('Failed to count app admins', { status: 500 })
  if (count.body >= getMaxAppAdmins(env)) {
    throw new Response(`Cannot have more than ${getMaxAppAdmins(env)} app admins`, { status: 400 })
  }

  const result = await system.updateUserRole(email, 'app_admin')
  if (!result.ok) throw new Response(result.errors[0] ?? 'Failed to promote user', { status: 400 })
}

export async function demoteUserFromAdmin({ env, email }: { env: RequiredEnvVars; email: string }) {
  await assertCanRemoveAdminRole({ env, email })
  const system = await getSystemAgent(env)
  const result = await system.updateUserRole(email, 'user')
  if (!result.ok) throw new Response(result.errors[0] ?? 'Failed to remove admin role', { status: 400 })
}

export async function deactivateUser({ env, email }: { env: RequiredEnvVars; email: string }) {
  await assertCanRemoveAdminRole({ env, email })
  const system = await getSystemAgent(env)
  await system.setUserStatus(email, 'deactivated')

  const userAgent = await getUserAgent(env, email)
  await userAgent.revokeAccess({ reason: 'deactivated' })
}

export async function activateUser({ env, email }: { env: RequiredEnvVars; email: string }) {
  const system = await getSystemAgent(env)
  const user = await requireUserRecord(env, email)
  if (user.status === 'active') return

  if (user.role === 'app_admin') {
    const count = await system.countAppAdmins()
    if (!count.ok) throw new Response('Failed to count app admins', { status: 500 })
    if (count.body >= getMaxAppAdmins(env)) {
      throw new Response(`Cannot have more than ${getMaxAppAdmins(env)} app admins`, { status: 400 })
    }
  }

  const result = await system.setUserStatus(email, 'active')
  if (!result.ok) throw new Response(result.errors[0] ?? 'Failed to activate user', { status: 400 })
}

export async function deleteUserCompletely({ env, email }: { env: RequiredEnvVars; email: string }) {
  await assertCanRemoveAdminRole({ env, email })
  const userAgent = await getUserAgent(env, email)
  await userAgent.revokeAccess({ reason: 'deleted' })

  const dashboard = await userAgent.getDashboard()
  const teamIds = dashboard.ok ? dashboard.body.teamIds : []

  await Promise.all(
    teamIds.map(async (teamId) => {
      const team = await getTeamAgent(env, teamId)
      await team.removeMember(email)
    }),
  )

  const system = await getSystemAgent(env)
  await system.recordRemovedUser(email)
  await system.deleteUser(email)
}
