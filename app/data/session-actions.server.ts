import { redirect } from 'react-router'
import { sendEmail, sessionShareEmail, sessionShareInviteEmail } from 'email'
import type { TimelineSessionAgent } from 'roadmaps-agents'
import type { SessionPublicState, SessionType } from 'roadmaps-agents/schemas'

import type { RequiredEnvVars } from '../../env-required'
import type { SessionUser } from '../auth/session.server'
import { generateDescriptionFromContent } from '../utils/ai-provider'
import { sessionPath } from '../utils/sessions'
import {
  getSessionAgent,
  getSystemAgent,
  getTeamAgent,
  getTimelineSessionAgent,
  getUserAgent,
} from './agents.server'
import {
  fetchLinearIssuesForImport,
  fetchLinearMetadata,
  importLinearIssuesToSession,
} from './linear-import.server'
import { requireSessionAccessTier, type SessionAccessTier } from './session-access.server'

function getIntentAccessTier(intent: string): SessionAccessTier {
  if (
    intent === 'share' ||
    intent === 'unshare' ||
    intent === 'rename-session' ||
    intent === 'delete-session' ||
    intent === 'move-to-team' ||
    intent === 'move-to-drafts' ||
    intent === 'transfer-ownership'
  ) {
    return 'owner'
  }

  if (
    intent === 'fetch-linear-metadata' ||
    intent === 'fetch-linear-issues' ||
    intent === 'import-linear-issues' ||
    intent === 'generate-ai-description' ||
    intent === 'update-timeline-settings'
  ) {
    return 'edit'
  }

  return 'read'
}

type HandleSessionActionArgs = {
  env: RequiredEnvVars
  user: SessionUser
  uuid: string
  sessionType: SessionType
  formData: FormData
  requestUrl?: string
}

type DeleteSessionForUserArgs = {
  env: RequiredEnvVars
  user: SessionUser
  uuid: string
  sessionType: SessionType
}

export async function deleteSessionForUser({ env, user, uuid, sessionType }: DeleteSessionForUserArgs) {
  const agent = await getSessionAgent(env, sessionType, uuid)
  await requireSessionAccessTier({ agent, userId: user.email, tier: 'owner' })

  const result = await agent.deleteSession({ actorEmail: user.email })
  if (!result.ok) {
    throw new Response(result.errors[0] ?? 'Failed to delete session', {
      status: 400,
    })
  }
}

async function sendSessionShareNotification({
  env,
  appUrl,
  actorEmail,
  shareEmail,
  sessionName,
  sessionType,
  uuid,
}: {
  env: RequiredEnvVars
  appUrl: string
  actorEmail: string
  shareEmail: string
  sessionName: string
  sessionType: SessionType
  uuid: string
}) {
  const system = await getSystemAgent(env)
  const existing = await system.getUserByEmail(shareEmail)

  if (existing.ok && existing.body) {
    const sessionUrl = `${appUrl}${sessionPath(sessionType, uuid)}`
    const emailContent = sessionShareEmail({ actorEmail, sessionName, sessionUrl })
    const result = await sendEmail(
      {
        to: shareEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      },
      env,
    )
    if (!result.ok) {
      console.error('[session-share] Failed to send notification:', result.errors)
    }
    return
  }

  const token = crypto.randomUUID()
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7

  await system.createInvite({
    token,
    email: shareEmail,
    invitedBy: actorEmail,
    teamId: null,
    expiresAt,
  })

  const inviteUrl = `${appUrl}/invite/${token}`
  const emailContent = sessionShareInviteEmail({ actorEmail, sessionName, inviteUrl })
  const result = await sendEmail(
    {
      to: shareEmail,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    },
    env,
  )
  if (!result.ok) {
    console.error('[session-share] Failed to send invite:', result.errors)
  }
}

export async function handleSessionAction({
  env,
  user,
  uuid,
  sessionType,
  formData,
  requestUrl,
}: HandleSessionActionArgs) {
  const intent = String(formData.get('intent'))
  const agent = await getSessionAgent(env, sessionType, uuid)

  await requireSessionAccessTier({
    agent,
    userId: user.email,
    tier: getIntentAccessTier(intent),
  })

  if (intent === 'share') {
    const shareEmail = String(formData.get('email'))
    const permission = (formData.get('permission') as 'read' | 'write') ?? 'read'

    const result = await agent.share({
      email: shareEmail,
      permission,
      actorEmail: user.email,
    })
    if (!result.ok) {
      throw new Response(result.errors[0] ?? 'Failed to share session', {
        status: 400,
      })
    }

    const session = (await agent.state) as SessionPublicState
    const appUrl = env.APP_URL || (requestUrl ? new URL(requestUrl).origin : '')

    if (appUrl) {
      try {
        await sendSessionShareNotification({
          env,
          appUrl,
          actorEmail: user.email,
          shareEmail,
          sessionName: session.name,
          sessionType,
          uuid,
        })
      } catch (error) {
        console.error('[session-share] Failed to send notification:', error)
      }
    } else {
      console.warn('[session-share] APP_URL not set — skipping share notification email')
    }

    return null
  }

  if (intent === 'unshare') {
    const result = await agent.unshare({
      email: String(formData.get('email')),
      actorEmail: user.email,
    })
    if (!result.ok) {
      throw new Response(result.errors[0] ?? 'Failed to remove share', {
        status: 400,
      })
    }
    return null
  }

  if (intent === 'fetch-linear-metadata') {
    return fetchLinearMetadata(env)
  }

  if (intent === 'fetch-linear-issues') {
    return fetchLinearIssuesForImport(env, {
      projectId: formData.get('projectId')?.toString(),
      label: formData.get('label')?.toString(),
      startDate: formData.get('startDate')?.toString(),
      endDate: formData.get('endDate')?.toString(),
      searchQuery: formData.get('searchQuery')?.toString(),
    })
  }

  if (intent === 'import-linear-issues') {
    const issuesJson = formData.get('issues')?.toString()
    if (!issuesJson) return { ok: false, error: 'No issues provided' }

    return importLinearIssuesToSession({
      env,
      agent,
      userEmail: user.email,
      issuesJson,
      collapseSubIssues: formData.get('collapseSubIssues') === 'true',
      importOption: formData.get('importOption')?.toString() === 'overwrite' ? 'overwrite' : 'skip',
      summarize: formData.get('summarize') === 'true',
    })
  }

  if (intent === 'generate-ai-description') {
    try {
      const itemUuid = formData.get('itemUuid')?.toString()

      if (!itemUuid) {
        return {
          ok: false,
          error: 'Item UUID is required',
        }
      }

      if (!env.AI_PROVIDER) {
        return { ok: false, error: 'AI is not configured' }
      }

      const itemsResult = await (
        agent as {
          getAllItems: () => ReturnType<TimelineSessionAgent['getAllItems']>
        }
      ).getAllItems()
      const item = itemsResult.ok ? itemsResult.body.find((i) => i.uuid === itemUuid) : null

      if (!item) {
        return { ok: false, error: 'Item not found' }
      }

      const externalContent = item.externalContent?.trim()
      if (!externalContent) {
        return { ok: false, error: 'Item has no external content to summarize' }
      }

      const description = await generateDescriptionFromContent({
        env,
        content: externalContent,
      })

      if (!description) {
        return { ok: false, error: 'AI returned no description' }
      }

      const result = await (
        agent as {
          updateItem: (args: {
            itemUuid: string
            title: string
            description?: string | null
            externalId?: string | null
            estimate?: number | null
            externalContent?: string | null
            labels?: { text: string; color: string }[]
            userId: string
          }) => ReturnType<TimelineSessionAgent['updateItem']>
        }
      ).updateItem({
        itemUuid,
        title: item.title,
        description,
        externalId: item.externalId,
        estimate: item.estimate,
        externalContent: item.externalContent,
        labels: item.labels,
        userId: user.email,
      })

      if (!result.ok) {
        return { ok: false, error: result.errors[0] ?? 'Failed to update item' }
      }

      return { ok: true }
    } catch (error) {
      console.error('[AI] Error generating description:', error)
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to generate description',
      }
    }
  }

  if (intent === 'move-to-team') {
    const teamId = String(formData.get('teamId'))
    const session = (await agent.state) as {
      ownerEmail: string
      teamId: string | null
      name: string
    }

    const team = await getTeamAgent(env, teamId)
    const isMember = await team.isMember(user.email)
    if (!isMember && user.role !== 'app_admin') throw new Response('Forbidden', { status: 403 })

    if (session.teamId && session.teamId !== teamId) {
      const previousTeam = await getTeamAgent(env, session.teamId)
      await previousTeam.removeTeamSession(uuid)
    }

    await agent.setTeam(teamId)

    await team.addTeamSession({
      uuid,
      sessionType,
      name: String(formData.get('name') ?? session.name ?? 'Session'),
      ownerEmail: session.ownerEmail,
    })

    await getUserAgent(env, session.ownerEmail).then((ua) => ua.removePersonalSession(uuid))
    return null
  }

  if (intent === 'move-to-drafts') {
    const session = (await agent.state) as {
      ownerEmail: string
      teamId: string | null
      name: string
    }

    if (session.teamId) {
      const team = await getTeamAgent(env, session.teamId)
      await team.removeTeamSession(uuid)
    }

    await agent.setTeam(null)

    await getUserAgent(env, session.ownerEmail).then((ua) =>
      ua.addPersonalSession({
        uuid,
        sessionType,
        name: String(formData.get('name') ?? session.name ?? 'Session'),
      }),
    )
    return null
  }

  if (intent === 'rename-session') {
    const name = String(formData.get('name') ?? '').trim()
    if (!name) throw new Response('Name required', { status: 400 })

    const result = await agent.updateSessionName({
      name,
      actorEmail: user.email,
    })
    if (!result.ok) {
      throw new Response(result.errors[0] ?? 'Failed to rename session', {
        status: 400,
      })
    }

    return null
  }

  if (intent === 'transfer-ownership') {
    const newOwnerEmail = String(formData.get('newOwnerEmail') ?? '').trim()
    if (!newOwnerEmail) throw new Response('New owner email is required', { status: 400 })

    const result = await agent.transferSessionOwnership({
      actorEmail: user.email,
      newOwnerEmail,
    })
    if (!result.ok) {
      throw new Response(result.errors[0] ?? 'Failed to transfer ownership', {
        status: 400,
      })
    }

    return null
  }

  if (intent === 'delete-session') {
    await deleteSessionForUser({ env, user, uuid, sessionType })
    return redirect('/')
  }

  if (intent === 'update-timeline-settings' && sessionType === 'timeline') {
    const timelineAgent = await getTimelineSessionAgent(env, uuid)
    const cycleLengthWeeksStr = formData.get('cycleLengthWeeks')?.toString()
    const cooldownWeeksStr = formData.get('cooldownWeeks')?.toString()
    const startDate = formData.get('startDate')?.toString()
    const cycleStartNumberStr = formData.get('cycleStartNumber')?.toString()

    const updates: {
      cycleLengthWeeks?: number
      cooldownWeeks?: number
      startDate?: string
      cycleStartNumber?: number
    } = {}

    if (cycleLengthWeeksStr) {
      const val = parseInt(cycleLengthWeeksStr, 10)
      if (isNaN(val) || val < 1) return { ok: false, error: 'Cycle length must be at least 1' }
      updates.cycleLengthWeeks = val
    }
    if (cooldownWeeksStr !== undefined && cooldownWeeksStr !== '') {
      const val = parseInt(cooldownWeeksStr, 10)
      if (isNaN(val) || val < 0) return { ok: false, error: 'Cooldown must be 0 or greater' }
      updates.cooldownWeeks = val
    }
    if (startDate) updates.startDate = startDate
    if (cycleStartNumberStr) {
      const val = parseInt(cycleStartNumberStr, 10)
      if (isNaN(val) || val < 1) return { ok: false, error: 'Cycle start number must be at least 1' }
      updates.cycleStartNumber = val
    }

    return (
      timelineAgent as {
        updateTimelineSettings: (args: typeof updates & { userId: string }) => unknown
      }
    ).updateTimelineSettings({
      userId: user.email,
      ...updates,
    })
  }

  return null
}
