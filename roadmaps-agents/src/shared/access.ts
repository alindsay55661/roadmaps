import type { SharePermission } from './types'

export type AccessContext = {
  userId: string
  isOwner: boolean
  isAppAdmin: boolean
  isTeamAdmin: boolean
  isTeamMember: boolean
  ownerStatus: 'active' | 'deactivated' | 'deleted'
  sharePermission?: SharePermission
}

export function isUnassignedOwner(ctx: AccessContext) {
  return ctx.ownerStatus === 'deactivated' || ctx.ownerStatus === 'deleted'
}

export function canManageAsAppAdmin(ctx: AccessContext) {
  return ctx.isAppAdmin && isUnassignedOwner(ctx)
}

export function canAccessSession(ctx: AccessContext) {
  return ctx.isOwner || ctx.isTeamMember || ctx.isTeamAdmin || !!ctx.sharePermission || canManageAsAppAdmin(ctx)
}

export function canEditSession(ctx: AccessContext) {
  return ctx.isOwner || ctx.isTeamAdmin || ctx.sharePermission === 'write' || canManageAsAppAdmin(ctx)
}

export function canVote(ctx: AccessContext) {
  if (!canAccessSession(ctx)) return false
  if (canEditSession(ctx)) return true
  return !!ctx.sharePermission || ctx.isTeamMember
}

export function canManageSharing(ctx: AccessContext) {
  return ctx.isOwner || canManageAsAppAdmin(ctx)
}
