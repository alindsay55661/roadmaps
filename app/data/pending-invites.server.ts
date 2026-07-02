import { platformInviteEmail, sendEmail, teamInviteEmail } from 'email'
import type { InviteRecord } from 'roadmaps-agents'

import type { RequiredEnvVars } from '../../env-required'
import { getInviteExpiresAt } from '../utils/invite-expiry'
import type { getSystemAgent } from './agents.server'

type SystemAgent = Awaited<ReturnType<typeof getSystemAgent>>

export async function loadAdminPendingInvites(system: SystemAgent) {
  const result = await system.listPendingInvites({
    sources: ['admin', 'legacy'],
    platformOnly: true,
  })
  return result.ok ? result.body : []
}

export async function loadTeamPendingInvites(system: SystemAgent, teamId: string) {
  const result = await system.listPendingInvites({
    sources: ['team'],
    teamId,
  })
  return result.ok ? result.body : []
}

export function isAdminScopedInvite(invite: InviteRecord) {
  return invite.teamId === null && (invite.source === 'admin' || invite.source === 'legacy')
}

export function isTeamScopedInvite(invite: InviteRecord, teamId: string) {
  return invite.source === 'team' && invite.teamId === teamId
}

export async function resendPlatformInvite({
  system,
  token,
  invitedByEmail,
  env,
  requestUrl,
}: {
  system: SystemAgent
  token: string
  invitedByEmail: string
  env: RequiredEnvVars
  requestUrl: string
}) {
  const inviteResult = await system.getPendingInviteByToken(token)
  if (!inviteResult.ok) throw new Response('Failed to load invite', { status: 500 })
  if (!inviteResult.body || !isAdminScopedInvite(inviteResult.body)) {
    throw new Response('Invite not found', { status: 404 })
  }

  const expiresAt = getInviteExpiresAt()
  const reset = await system.resetInviteExpiry(token, expiresAt)
  if (!reset.ok) throw new Response(reset.errors[0] ?? 'Failed to update invite', { status: 400 })

  const appUrl = env.APP_URL || new URL(requestUrl).origin
  const inviteUrl = `${appUrl}/invite/${token}`
  const emailContent = platformInviteEmail({ inviteUrl, invitedByEmail })

  await sendEmail(
    {
      to: inviteResult.body.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    },
    env,
  )
}

export async function resendTeamInvite({
  system,
  token,
  teamId,
  invitedByEmail,
  teamName,
  env,
  requestUrl,
}: {
  system: SystemAgent
  token: string
  teamId: string
  invitedByEmail: string
  teamName: string
  env: RequiredEnvVars
  requestUrl: string
}) {
  const inviteResult = await system.getPendingInviteByToken(token)
  if (!inviteResult.ok) throw new Response('Failed to load invite', { status: 500 })
  if (!inviteResult.body || !isTeamScopedInvite(inviteResult.body, teamId)) {
    throw new Response('Invite not found', { status: 404 })
  }

  const expiresAt = getInviteExpiresAt()
  const reset = await system.resetInviteExpiry(token, expiresAt)
  if (!reset.ok) throw new Response(reset.errors[0] ?? 'Failed to update invite', { status: 400 })

  const appUrl = env.APP_URL || new URL(requestUrl).origin
  const inviteUrl = `${appUrl}/invite/${token}`
  const emailContent = teamInviteEmail({
    inviteUrl,
    teamName,
    invitedByEmail,
  })

  await sendEmail(
    {
      to: inviteResult.body.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    },
    env,
  )
}

export async function revokeScopedInvite({
  system,
  token,
  isAllowed,
}: {
  system: SystemAgent
  token: string
  isAllowed: (invite: InviteRecord) => boolean
}) {
  const inviteResult = await system.getPendingInviteByToken(token)
  if (!inviteResult.ok) throw new Response('Failed to load invite', { status: 500 })
  if (!inviteResult.body || !isAllowed(inviteResult.body)) {
    throw new Response('Invite not found', { status: 404 })
  }

  const revoked = await system.revokeInvite(token)
  if (!revoked.ok) throw new Response(revoked.errors[0] ?? 'Failed to revoke invite', { status: 400 })
}
