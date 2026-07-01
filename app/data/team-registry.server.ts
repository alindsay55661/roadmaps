import type { RequiredEnvVars } from '../../env-required'
import { getSystemAgent, getTeamAgent, getUserAgent } from './agents.server'

export async function backfillTeamRegistry(env: RequiredEnvVars) {
  const system = await getSystemAgent(env)
  const users = await system.listUsers()
  if (!users.ok) return

  const teamIds = new Set<string>()
  await Promise.all(
    users.body.map(async (user) => {
      const userAgent = await getUserAgent(env, user.email)
      const dashboard = await userAgent.getDashboard()
      if (!dashboard.ok) return
      for (const teamId of dashboard.body.teamIds) teamIds.add(teamId)
    }),
  )

  await Promise.all(
    Array.from(teamIds).map(async (teamId) => {
      const team = await getTeamAgent(env, teamId)
      const teamData = await team.getTeamData()
      if (!teamData.ok) return
      await system.registerTeam({
        teamId,
        name: String(teamData.body.name ?? teamId),
        createdBy: String(teamData.body.createdBy ?? 'unknown'),
        createdAt: typeof teamData.body.sessions[0]?.createdAt === 'number' ? teamData.body.sessions[0].createdAt : undefined,
      })
    }),
  )
}

export async function listRegisteredTeams(env: RequiredEnvVars) {
  const system = await getSystemAgent(env)
  let registry = await system.listTeams()
  if (registry.ok && registry.body.length > 0) return registry.body

  await backfillTeamRegistry(env)
  registry = await system.listTeams()
  return registry.ok ? registry.body : []
}
