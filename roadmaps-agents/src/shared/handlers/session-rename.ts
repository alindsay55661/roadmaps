import { dataError, dataSuccess } from 'utils/data'

import type { TeamAgent } from '../../team/team.agent'
import type { UserAgent } from '../../user/user.agent'
import { GENERAL_EVENTS, getGeneralChannelName } from '../channels'
import { buildAccessContext, canManageSharing, type SessionAgent } from '../session-handlers'

export async function renameSession(
  this: SessionAgent,
  { name, actorEmail }: { name: string; actorEmail: string },
) {
  const trimmedName = name.trim()
  if (!trimmedName) return dataError('Name is required')

  const access = await buildAccessContext(this, actorEmail)
  if (!canManageSharing(access))
    return dataError('Only the owner can rename this session')

  const state = this.state
  const uuid = state.uuid
  if (state.name === trimmedName) return dataSuccess()

  await this.setState({ ...state, name: trimmedName })

  const ownerAgent = this.env.USER_AGENT.get(
    this.env.USER_AGENT.idFromName(state.ownerEmail),
  ) as unknown as UserAgent

  if (state.teamId) {
    const teamAgent = this.env.TEAM_AGENT.get(
      this.env.TEAM_AGENT.idFromName(state.teamId),
    ) as unknown as TeamAgent
    await teamAgent.updateTeamSessionName({ uuid, name: trimmedName })
  } else {
    await ownerAgent.updatePersonalSessionName({ uuid, name: trimmedName })
  }

  const ps = this.getPrivateState()
  for (const shareEmail of Object.keys(ps.sharedWith)) {
    const userAgent = this.env.USER_AGENT.get(
      this.env.USER_AGENT.idFromName(shareEmail),
    ) as unknown as UserAgent
    await userAgent.updateSharedSessionName({ uuid, name: trimmedName })
  }

  this.broadcastToChannel(
    getGeneralChannelName(uuid),
    GENERAL_EVENTS.NAME_UPDATED,
    { name: trimmedName },
  )

  return dataSuccess()
}
