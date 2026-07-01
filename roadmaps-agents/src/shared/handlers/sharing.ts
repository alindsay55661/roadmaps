import { dataError, dataSuccess } from 'utils/data'

import type { UserAgent } from '../../user/user.agent'
import { getSharingChannelName, SHARING_EVENTS } from '../channels'
import { disconnectUserConnections } from '../disconnect-user-connections'
import { buildAccessContext, canAccessSession, canEditSession, canManageSharing, type SessionAgent } from '../session-handlers'
import type { SharingInfo } from '../session-schemas'
import type { SharePermission } from '../types'

export async function getSharingInfo(this: SessionAgent, { userId }: { userId?: string } = {}) {
  const sessionState = this.state
  if (!sessionState) return dataError('Session not initialized')

  if (userId) {
    const access = await buildAccessContext(this, userId)
    if (!canAccessSession(access)) {
      return dataError('You do not have permission to view sharing information')
    }
  }

  const ps = this.getPrivateState()
  const sharingInfo: SharingInfo = {
    ownerEmail: sessionState.ownerEmail,
    sharedWith: Object.values(ps.sharedWith).map((entry) => ({
      email: entry.email,
      permission: entry.permission,
      sharedAt: entry.sharedAt,
    })),
  }

  return dataSuccess(sharingInfo)
}

export async function shareWith(
  this: SessionAgent,
  {
    userId,
    shareWithEmail,
    permission = 'read',
  }: {
    userId: string
    shareWithEmail: string
    permission?: SharePermission
  },
) {
  const access = await buildAccessContext(this, userId)
  if (!canManageSharing(access)) return dataError('Only the owner can share this session')

  const ps = this.getPrivateState()
  ps.sharedWith[shareWithEmail] = {
    email: shareWithEmail,
    permission,
    sharedAt: Math.floor(Date.now() / 1000),
  }
  await this.setPrivateStatePartial({ sharedWith: ps.sharedWith })

  const userAgent = this.env.USER_AGENT.get(
    this.env.USER_AGENT.idFromName(shareWithEmail),
  ) as unknown as UserAgent
  await userAgent.addSharedSession({
    uuid: this.state.uuid,
    sessionType: this.state.sessionType,
    name: this.state.name,
    ownerEmail: this.state.ownerEmail,
    permission,
  })

  const sharingInfoResult = await getSharingInfo.call(this)
  if (sharingInfoResult.ok) {
    this.broadcastToChannel(getSharingChannelName(this.state.uuid), SHARING_EVENTS.INFO, sharingInfoResult.body)
  }

  return dataSuccess({
    email: shareWithEmail,
    permission,
    sharedAt: ps.sharedWith[shareWithEmail].sharedAt,
  })
}

export async function removeShare(
  this: SessionAgent,
  { userId, removeEmail }: { userId: string; removeEmail: string },
) {
  const access = await buildAccessContext(this, userId)
  if (!canManageSharing(access)) return dataError('Only the owner can manage sharing')

  const ps = this.getPrivateState()
  delete ps.sharedWith[removeEmail]
  await this.setPrivateStatePartial({ sharedWith: ps.sharedWith })

  const userAgent = this.env.USER_AGENT.get(this.env.USER_AGENT.idFromName(removeEmail)) as unknown as UserAgent
  await userAgent.removeSharedSession(this.state.uuid)

  await disconnectUserConnections(this as never, removeEmail)

  const sharingInfoResult = await getSharingInfo.call(this)
  if (sharingInfoResult.ok) {
    this.broadcastToChannel(getSharingChannelName(this.state.uuid), SHARING_EVENTS.INFO, sharingInfoResult.body)
  }

  return dataSuccess({ email: removeEmail })
}

export async function checkAccess(this: SessionAgent, { userId }: { userId: string }) {
  const access = await buildAccessContext(this, userId)
  return dataSuccess({
    hasAccess: canAccessSession(access),
    canEdit: canEditSession(access),
    isOwner: canManageSharing(access),
    permission: access.sharePermission ?? null,
  })
}
