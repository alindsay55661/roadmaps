import { dataError, dataSuccess } from 'utils/data'

import type { SystemAgent } from '../../system/system.agent'
import type { TeamAgent } from '../../team/team.agent'
import type { UserAgent } from '../../user/user.agent'
import { getSharingChannelName, SHARING_EVENTS } from '../channels'
import { buildAccessContext, canManageSharing, type SessionAgent } from '../session-handlers'

export async function transferOwnership(
  this: SessionAgent,
  {
    actorEmail,
    newOwnerEmail,
  }: {
    actorEmail: string
    newOwnerEmail: string
  },
) {
  const access = await buildAccessContext(this, actorEmail)
  if (!canManageSharing(access)) return dataError('Only the owner can transfer this session')

  const systemAgent = this.env.SYSTEM_AGENT.get(
    this.env.SYSTEM_AGENT.idFromName('system'),
  ) as unknown as SystemAgent
  const newOwner = await systemAgent.getUserByEmail(newOwnerEmail)
  if (!newOwner.ok || !newOwner.body || newOwner.body.status !== 'active') {
    return dataError('New owner must be an active user')
  }

  const state = this.state
  if (state.ownerEmail === newOwnerEmail) return dataSuccess()

  const uuid = state.uuid
  const oldOwnerEmail = state.ownerEmail
  await this.setState({ ...state, ownerEmail: newOwnerEmail })

  if (state.teamId) {
    const teamAgent = this.env.TEAM_AGENT.get(
      this.env.TEAM_AGENT.idFromName(state.teamId),
    ) as unknown as TeamAgent
    await teamAgent.updateTeamSessionOwner({ uuid, ownerEmail: newOwnerEmail })
  } else {
    const oldOwnerAgent = this.env.USER_AGENT.get(
      this.env.USER_AGENT.idFromName(oldOwnerEmail),
    ) as unknown as UserAgent
    const newOwnerAgent = this.env.USER_AGENT.get(
      this.env.USER_AGENT.idFromName(newOwnerEmail),
    ) as unknown as UserAgent

    await oldOwnerAgent.removePersonalSession(uuid)
    await newOwnerAgent.removeSharedSession(uuid)
    await newOwnerAgent.addPersonalSession({
      uuid,
      sessionType: state.sessionType,
      name: state.name,
    })
  }

  const ps = this.getPrivateState()
  delete ps.sharedWith[newOwnerEmail]
  await this.setPrivateStatePartial({ sharedWith: ps.sharedWith })

  await Promise.all(
    Object.keys(ps.sharedWith).map(async (shareEmail) => {
      const userAgent = this.env.USER_AGENT.get(
        this.env.USER_AGENT.idFromName(shareEmail),
      ) as unknown as UserAgent
      await userAgent.updateSharedSessionOwner({ uuid, ownerEmail: newOwnerEmail })
    }),
  )

  const sharingInfo = {
    ownerEmail: newOwnerEmail,
    sharedWith: Object.values(ps.sharedWith).map((entry) => ({
      email: entry.email,
      permission: entry.permission,
      sharedAt: entry.sharedAt,
    })),
  }
  this.broadcastToChannel(getSharingChannelName(uuid), SHARING_EVENTS.INFO, sharingInfo)

  return dataSuccess()
}
