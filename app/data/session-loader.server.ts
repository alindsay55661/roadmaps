import type {
  DotVotingSettings,
  RoadmapItem,
  RoadmapTimelineSettings,
  SessionPublicState,
  SessionType,
  SharePermission,
  SharingInfo,
  VotingProperty,
} from 'roadmaps-agents/schemas'

import type { RequiredEnvVars } from '../../env-required'
import { type AccessContext, canEditSession, canManageSharing, canVote } from '../../roadmaps-agents/src/shared/access'
import type { SessionUser } from '../auth/session.server'
import {
  getDotVotingSessionAgent,
  getPropertyVotingSessionAgent,
  getSessionAgent,
  getSystemAgent,
  getTeamAgent,
  getTimelineSessionAgent,
  getUserAgent,
} from './agents.server'

type LoadSessionContextArgs = {
  env: RequiredEnvVars
  user: SessionUser
  uuid: string
  sessionType: SessionType
}

export type SessionLoaderData = {
  uuid: string
  sessionType: SessionType
  session: SessionPublicState
  items: RoadmapItem[]
  teams: Array<{ id: string; name: string }>
  currentTeamName: string | null
  linearEnabled: boolean
  aiEnabled: boolean
  sharingInfo: SharingInfo
  timelineSettings: RoadmapTimelineSettings | null
  dotVotingSettings: DotVotingSettings | null
  votingProperties: VotingProperty[]
  canEdit: boolean
  canVote: boolean
  isOwner: boolean
  user: SessionUser
}

async function buildAccessContextFromAgent({
  env,
  session,
  email,
  userRole,
}: {
  env: RequiredEnvVars
  session: SessionPublicState
  email: string
  userRole: SessionUser['role']
}): Promise<AccessContext> {
  let isTeamMember = false
  let isTeamAdmin = false
  let sharePermission: SharePermission | undefined
  let ownerStatus: AccessContext['ownerStatus'] = 'deleted'

  if (session.teamId) {
    const team = await getTeamAgent(env, session.teamId)
    isTeamMember = await team.isMember(email)
    const role = await team.getMemberRole(email)
    isTeamAdmin = role === 'admin'
  }

  const userAgent = await getUserAgent(env, email)
  const dashboard = await userAgent.getDashboard()
  if (dashboard.ok) {
    const shared = dashboard.body.shared.find((entry) => entry.uuid === session.uuid)
    if (shared?.permission === 'read' || shared?.permission === 'write') {
      sharePermission = shared.permission
    }
  }

  const system = await getSystemAgent(env)
  const owner = await system.getUserByEmail(session.ownerEmail)
  if (owner.ok && owner.body) ownerStatus = owner.body.status

  return {
    userId: email,
    isOwner: session.ownerEmail === email,
    isAppAdmin: userRole === 'app_admin',
    isTeamAdmin,
    isTeamMember,
    ownerStatus,
    sharePermission,
  }
}

export async function loadSessionContext({
  env,
  user,
  uuid,
  sessionType,
}: LoadSessionContextArgs): Promise<SessionLoaderData> {
  const agent = await getSessionAgent(env, sessionType, uuid)
  type SessionAgentLike = {
    userHasAccess: (email: string) => Promise<boolean>
    state: unknown
    getAllItems: () => Promise<{ ok: boolean; body?: RoadmapItem[] }>
    getSharingInfo: (args?: { userId?: string }) => Promise<{ ok: boolean; body?: SharingInfo }>
  }
  const sessionAgent = agent as unknown as SessionAgentLike

  const hasAccess = await sessionAgent.userHasAccess(user.email)
  if (!hasAccess) throw new Response('Forbidden', { status: 403 })

  const session = (await sessionAgent.state) as SessionPublicState
  if (!session?.uuid || !session.ownerEmail) {
    throw new Response('Session not found', { status: 404 })
  }

  const itemsResult = await sessionAgent.getAllItems()
  const items = itemsResult.ok ? (itemsResult.body as RoadmapItem[]) : []

  const access = await buildAccessContextFromAgent({
    env,
    session,
    email: user.email,
    userRole: user.role,
  })

  const userAgent = await getUserAgent(env, user.email)
  const dashboard = await userAgent.getDashboard()
  const teams = dashboard.ok
    ? await Promise.all(
        dashboard.body.teamIds.map(async (id) => {
          const team = await getTeamAgent(env, id)
          const teamData = await team.getTeamData()
          return {
            id,
            name: teamData.ok && teamData.body.name ? String(teamData.body.name) : id,
          }
        }),
      )
    : []

  const linearEnabled = Boolean(env.LINEAR_API_KEY)

  const sharingResult = await sessionAgent.getSharingInfo({
    userId: user.email,
  })
  const sharingInfo: SharingInfo =
    sharingResult.ok && sharingResult.body
      ? sharingResult.body
      : { ownerEmail: session.ownerEmail, sharedWith: [] }

  const timelineSettingsResult =
    sessionType === 'timeline'
      ? await (
          (await getTimelineSessionAgent(env, uuid)) as {
            getTimelineSettings: (args: {
              userId: string
            }) => Promise<{ ok: boolean; body?: RoadmapTimelineSettings }>
          }
        ).getTimelineSettings({ userId: user.email })
      : null
  const timelineSettings = timelineSettingsResult?.ok ? (timelineSettingsResult.body ?? null) : null

  const dotVotingSettingsResult =
    sessionType === 'dot_voting'
      ? await (
          (await getDotVotingSessionAgent(env, uuid)) as {
            getDotVotingSettings: (args: { userId: string }) => Promise<{ ok: boolean; body?: DotVotingSettings }>
          }
        ).getDotVotingSettings({ userId: user.email })
      : null
  const dotVotingSettings = dotVotingSettingsResult?.ok ? (dotVotingSettingsResult.body ?? null) : null

  const votingPropertiesResult =
    sessionType === 'property_voting'
      ? await (
          (await getPropertyVotingSessionAgent(env, uuid)) as {
            getAllVotingProperties: () => Promise<{
              ok: boolean
              body?: VotingProperty[]
            }>
          }
        ).getAllVotingProperties()
      : null
  const votingProperties = votingPropertiesResult?.ok ? (votingPropertiesResult.body ?? []) : []

  let currentTeamName: string | null = null
  if (session.teamId) {
    const team = await getTeamAgent(env, session.teamId)
    const teamData = await team.getTeamData()
    currentTeamName = teamData.ok && teamData.body.name ? String(teamData.body.name) : session.teamId
  }

  return {
    uuid,
    sessionType,
    session,
    items,
    teams,
    currentTeamName,
    linearEnabled,
    aiEnabled: Boolean(env.AI_PROVIDER),
    sharingInfo,
    timelineSettings,
    dotVotingSettings,
    votingProperties,
    canEdit: canEditSession(access),
    canVote: canVote(access),
    isOwner: canManageSharing(access),
    user,
  }
}
