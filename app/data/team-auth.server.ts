import type { RequiredEnvVars } from '../../env-required'
import type { SessionUser } from '../auth/session.server'
import { getTeamAgent } from './agents.server'

export async function requireTeamMember({
  env,
  teamId,
  userId,
}: {
  env: RequiredEnvVars
  teamId: string
  userId: string
}) {
  const team = await getTeamAgent(env, teamId)
  const isMember = await team.isMember(userId)
  if (!isMember) throw new Response('Forbidden', { status: 403 })
  return team
}

export async function requireTeamAdmin({
  env,
  teamId,
  userId,
}: {
  env: RequiredEnvVars
  teamId: string
  userId: string
}) {
  const team = await requireTeamMember({ env, teamId, userId })
  const role = await team.getMemberRole(userId)
  if (role !== 'admin') throw new Response('Forbidden', { status: 403 })
  return team
}

export async function requireTeamMemberOrAppAdmin({
  env,
  teamId,
  user,
}: {
  env: RequiredEnvVars
  teamId: string
  user: SessionUser
}) {
  if (user.role === 'app_admin') return getTeamAgent(env, teamId)
  return requireTeamMember({ env, teamId, userId: user.email })
}

export async function requireTeamAdminOrAppAdmin({
  env,
  teamId,
  user,
}: {
  env: RequiredEnvVars
  teamId: string
  user: SessionUser
}) {
  if (user.role === 'app_admin') return getTeamAgent(env, teamId)
  return requireTeamAdmin({ env, teamId, userId: user.email })
}
