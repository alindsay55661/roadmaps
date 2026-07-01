import { dataError, dataSuccess } from 'utils/data'

import type { TeamAgent } from '../../team/team.agent'
import type { UserAgent } from '../../user/user.agent'
import { buildAccessContext, canManageSharing, type SessionAgent } from '../session-handlers'

export async function destroySession(
  this: SessionAgent,
  { email }: { email: string },
) {
  const access = await buildAccessContext(this, email)
  if (!canManageSharing(access))
    return dataError('Only the owner can delete this session')

  const state = this.state
  const ps = this.getPrivateState()
  const uuid = state.uuid

  for (const shareEmail of Object.keys(ps.sharedWith)) {
    const userAgent = this.env.USER_AGENT.get(
      this.env.USER_AGENT.idFromName(shareEmail),
    ) as unknown as UserAgent
    await userAgent.removeSharedSession(uuid)
  }

  if (state.teamId) {
    const teamAgent = this.env.TEAM_AGENT.get(
      this.env.TEAM_AGENT.idFromName(state.teamId),
    ) as unknown as TeamAgent
    await teamAgent.removeTeamSession(uuid)
  }

  const ownerAgent = this.env.USER_AGENT.get(
    this.env.USER_AGENT.idFromName(state.ownerEmail),
  ) as unknown as UserAgent
  await ownerAgent.removePersonalSession(uuid)

  await this.ctx.storage.deleteAll()

  return dataSuccess()
}
