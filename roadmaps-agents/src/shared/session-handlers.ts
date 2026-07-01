import { dataError, type DataResult, dataSuccess } from 'utils/data'
import type { BaseWebSocketAgent } from 'websockets/server'

import type { SystemAgent } from '../system/system.agent'
import type { TeamAgent } from '../team/team.agent'
import { type AccessContext, canAccessSession, canEditSession, canManageSharing, canVote } from './access'
import type { SessionAgentMethods } from './session-agent-methods'
import type { SessionPrivateState, SessionPublicState } from './session-schemas'
import { DEFAULT_DOT_VOTING_DOTS_PER_VOTER } from './session-schemas'
import type { SessionType, SharePermission } from './types'

export type SessionAgentEnv = {
  SYSTEM_AGENT: DurableObjectNamespace
  USER_AGENT: DurableObjectNamespace
  TEAM_AGENT: DurableObjectNamespace
}

export type SessionAgent = BaseWebSocketAgent<SessionAgentEnv, SessionPublicState, SessionPrivateState> &
  SessionAgentMethods & {
    ctx: DurableObjectState
    env: SessionAgentEnv
    state: SessionPublicState
    getPrivateState(): SessionPrivateState
    setPrivateStatePartial(partial: Partial<SessionPrivateState>): void
    broadcastToChannel(channel: string, event: string, data: unknown): void
    userHasAccess(email: string): Promise<boolean>
  }

export async function buildAccessContext(agent: SessionAgent, userId: string): Promise<AccessContext> {
  const state = agent.state
  if (!state) {
    return {
      userId,
      isOwner: false,
      isAppAdmin: false,
      isTeamAdmin: false,
      isTeamMember: false,
      ownerStatus: 'deleted',
      sharePermission: undefined,
    }
  }

  const ps = agent.getPrivateState()
  const share = ps.sharedWith[userId]

  let isTeamMember = false
  let isTeamAdmin = false
  let isAppAdmin = false
  let ownerStatus: AccessContext['ownerStatus'] = 'active'

  const systemAgent = agent.env.SYSTEM_AGENT.get(
    agent.env.SYSTEM_AGENT.idFromName('system'),
  ) as unknown as SystemAgent

  const [actingUserResult, ownerResult] = await Promise.all([
    systemAgent.getUserByEmail(userId),
    systemAgent.getUserByEmail(state.ownerEmail),
  ])

  if (actingUserResult.ok && actingUserResult.body) {
    isAppAdmin = actingUserResult.body.role === 'app_admin' && actingUserResult.body.status === 'active'
  }

  if (ownerResult.ok) {
    ownerStatus = ownerResult.body?.status ?? 'deleted'
  }

  if (state.teamId) {
    const teamAgent = agent.env.TEAM_AGENT.get(
      agent.env.TEAM_AGENT.idFromName(state.teamId),
    ) as unknown as TeamAgent
    isTeamMember = await teamAgent.isMember(userId)
    const role = await teamAgent.getMemberRole(userId)
    isTeamAdmin = role === 'admin'
  }

  return {
    userId,
    isOwner: state.ownerEmail === userId,
    isAppAdmin,
    isTeamAdmin,
    isTeamMember,
    ownerStatus,
    sharePermission: share?.permission,
  }
}

function maxTimestampFromQuery(agent: SessionAgent, sql: string) {
  try {
    const row = agent.ctx.storage.sql.exec(sql).one()
    const value = row?.ts ?? row?.last_edited
    return typeof value === 'number' ? value : null
  } catch {
    return null
  }
}

export function getSessionLastEditedAt(agent: SessionAgent) {
  const sessionType = agent.state?.sessionType
  const timestamps: number[] = []

  const itemTimestamp = maxTimestampFromQuery(agent, `SELECT MAX(updated_at) as ts FROM roadmap_items`)
  if (itemTimestamp != null) timestamps.push(itemTimestamp)

  if (sessionType === 'dot_voting') {
    const dotVoteTimestamp = maxTimestampFromQuery(agent, `SELECT MAX(updated_at) as ts FROM dot_votes`)
    if (dotVoteTimestamp != null) timestamps.push(dotVoteTimestamp)
  }

  if (sessionType === 'property_voting') {
    const propertyVoteTimestamp = maxTimestampFromQuery(agent, `SELECT MAX(updated_at) as ts FROM property_votes`)
    if (propertyVoteTimestamp != null) timestamps.push(propertyVoteTimestamp)

    const votingPropertyTimestamp = maxTimestampFromQuery(
      agent,
      `SELECT MAX(updated_at) as ts FROM voting_properties`,
    )
    if (votingPropertyTimestamp != null) timestamps.push(votingPropertyTimestamp)
  }

  if (timestamps.length === 0) return null

  return Math.max(...timestamps)
}

export async function initializeSession(
  agent: SessionAgent,
  {
    uuid,
    name,
    sessionType,
    ownerEmail,
    teamId = null,
  }: {
    uuid: string
    name: string
    sessionType: SessionType
    ownerEmail: string
    teamId?: string | null
  },
): Promise<DataResult<void>> {
  agent.setState({ uuid, name, sessionType, ownerEmail, teamId })
  agent.setPrivateStatePartial({
    sharedWith: {},
    timelineCycleLengthWeeks: 6,
    timelineCooldownWeeks: 2,
    timelineStartDate: null,
    timelineCycleStartNumber: 19,
    dotVotingDotsPerVoter: DEFAULT_DOT_VOTING_DOTS_PER_VOTER,
  })

  if (!agent.state?.uuid) {
    return dataError('Failed to persist session state')
  }

  return dataSuccess()
}

export async function shareSession(
  agent: SessionAgent,
  {
    email,
    permission,
    actorEmail,
  }: {
    email: string
    permission: SharePermission
    actorEmail: string
  },
): Promise<DataResult<void>> {
  const result = await agent.shareWith({
    userId: actorEmail,
    shareWithEmail: email,
    permission,
  })
  if (!result.ok) return result
  return dataSuccess()
}

export async function unshareSession(
  agent: SessionAgent,
  { email, actorEmail }: { email: string; actorEmail: string },
): Promise<DataResult<void>> {
  const result = await agent.removeShare({
    userId: actorEmail,
    removeEmail: email,
  })
  if (!result.ok) return result
  return dataSuccess()
}

export { canAccessSession, canEditSession, canVote, canManageSharing }
