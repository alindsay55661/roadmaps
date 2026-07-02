import { useEffect, useMemo } from 'react'
import { Form, Link, redirect, useLoaderData, useNavigation, useSearchParams } from 'react-router'
import { sendEmail, teamInviteEmail } from 'email'
import { toast } from 'sonner'

import { Button } from '~/components/ui/button'
import { PendingInviteRow } from '../components/admin/pending-invite-row'
import { getSystemAgent } from '../data/agents.server'
import {
  isTeamScopedInvite,
  loadTeamPendingInvites,
  resendTeamInvite,
  revokeScopedInvite,
} from '../data/pending-invites.server'
import { requireTeamAdminOrAppAdmin, requireTeamMemberOrAppAdmin } from '../data/team-auth.server'
import { userContext } from '../middleware/auth'
import { getInviteExpiresAt } from '../utils/invite-expiry'
import { compareEmails } from '../utils/sort-by-email'
import type { Route } from './+types/teams.$teamId'

export const loader = async ({ params, context }: Route.LoaderArgs) => {
  const user = context.get(userContext)
  const env = context.cloudflare.env
  const team = await requireTeamMemberOrAppAdmin({ env, teamId: params.teamId!, user })

  const data = await team.getTeamData()
  const system = await getSystemAgent(env)

  if (!data.ok) throw new Response('Not found', { status: 404 })

  const role = await team.getMemberRole(user.email)
  const pendingInvites = await loadTeamPendingInvites(system, params.teamId!)

  return {
    ...data.body,
    isAdmin: role === 'admin',
    isAppAdmin: user.role === 'app_admin',
    pendingInvites,
  }
}

export const action = async ({ request, context, params }: Route.ActionArgs) => {
  const user = context.get(userContext)

  const env = context.cloudflare.env

  const formData = await request.formData()

  const intent = String(formData.get('intent'))

  const teamId = params.teamId!

  const system = await getSystemAgent(env)

  if (intent === 'invite') {
    const team = await requireTeamAdminOrAppAdmin({ env, teamId, user })
    const email = String(formData.get('email'))

    const existing = await system.getUserByEmail(email)

    if (existing.ok && existing.body) {
      await team.addMember({ email })
      throw redirect(`/teams/${teamId}?added=${encodeURIComponent(email)}`)
    }

    const token = crypto.randomUUID()
    const expiresAt = getInviteExpiresAt()

    await system.createInvite({
      token,
      email,
      invitedBy: user.email,
      teamId,
      source: 'team',
      expiresAt,
    })

    const appUrl = env.APP_URL || new URL(request.url).origin
    const inviteUrl = `${appUrl}/invite/${token}`
    const teamName = String(formData.get('teamName') ?? 'team')
    const emailContent = teamInviteEmail({
      inviteUrl,
      teamName,
      invitedByEmail: user.email,
    })

    await sendEmail(
      {
        to: email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      },
      env,
    )

    throw redirect(`/teams/${teamId}`)
  }

  if (intent === 'resend-invite') {
    await requireTeamAdminOrAppAdmin({ env, teamId, user })
    await resendTeamInvite({
      system,
      token: String(formData.get('token')),
      teamId,
      invitedByEmail: user.email,
      teamName: String(formData.get('teamName') ?? 'team'),
      env,
      requestUrl: request.url,
    })
    throw redirect(`/teams/${teamId}`)
  }

  if (intent === 'revoke-invite') {
    await requireTeamAdminOrAppAdmin({ env, teamId, user })
    await revokeScopedInvite({
      system,
      token: String(formData.get('token')),
      isAllowed: (invite) => isTeamScopedInvite(invite, teamId),
    })
    throw redirect(`/teams/${teamId}`)
  }

  if (intent === 'remove') {
    const team = await requireTeamAdminOrAppAdmin({ env, teamId, user })
    const email = String(formData.get('email'))
    const result = await team.removeMember(email)
    if (!result.ok) throw new Response(result.errors[0] ?? 'Failed to remove member', { status: 400 })
    throw redirect(`/teams/${teamId}?removed=${encodeURIComponent(email)}`)
  }

  if (intent === 'promote-member' || intent === 'demote-member') {
    if (user.role !== 'app_admin') throw new Response('Forbidden', { status: 403 })
    const team = await requireTeamAdminOrAppAdmin({ env, teamId, user })
    const email = String(formData.get('email'))
    const role = intent === 'promote-member' ? 'admin' : 'member'
    const result = await team.setMemberRole(email, role)
    if (!result.ok) throw new Response(result.errors[0] ?? 'Failed to update member role', { status: 400 })
    throw redirect(`/teams/${teamId}?updated=${encodeURIComponent(email)}`)
  }

  throw redirect(`/teams/${teamId}`)
}

function useTeamActionFeedback() {
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    const added = searchParams.get('added')
    const removed = searchParams.get('removed')
    const updated = searchParams.get('updated')

    if (!added && !removed && !updated) return

    if (added) toast.success(`${added} was added to the team`)
    if (removed) toast.success(`${removed} was removed from the team`)
    if (updated) toast.success(`${updated}'s team role was updated`)

    setSearchParams(
      (prev) => {
        prev.delete('added')
        prev.delete('removed')
        prev.delete('updated')
        return prev
      },
      { replace: true },
    )
  }, [searchParams, setSearchParams])
}

export default function TeamDetailPage() {
  const team = useLoaderData<typeof loader>()
  const navigation = useNavigation()
  const isInviting = navigation.state === 'submitting' && navigation.formData?.get('intent') === 'invite'

  useTeamActionFeedback()

  const memberListItems = useMemo(
    () =>
      [
        ...team.pendingInvites.map((invite) => ({ kind: 'invite' as const, invite })),
        ...team.members.map((member) => ({ kind: 'member' as const, member })),
      ].sort((a, b) =>
        compareEmails(
          a.kind === 'invite' ? a.invite.email : String(a.member.email),
          b.kind === 'invite' ? b.invite.email : String(b.member.email),
        ),
      ),
    [team.pendingInvites, team.members],
  )

  return (
    <div className="page-narrow">
      <Link to={`/?context=team&teamId=${team.teamId}`} className="link-back">
        ← {String(team.name)}
      </Link>

      <h1 className="mt-4 mb-6 text-2xl font-semibold">{String(team.name)}</h1>

      {team.isAppAdmin && (
        <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
          App admin view. You can manage team roles even if you are not a team member.
        </div>
      )}

      <dl className="text-muted-foreground mb-6 grid gap-1 text-sm">
        <div>
          <dt className="inline font-medium">Created by:</dt> <dd className="inline">{String(team.createdBy)}</dd>
        </div>
      </dl>

      {(team.isAdmin || team.isAppAdmin) && (
        <Form
          method="post"
          className="mb-8 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center"
        >
          <input type="hidden" name="intent" value="invite" />

          <input type="hidden" name="teamName" value={String(team.name)} />

          <input name="email" type="email" required placeholder="Invite by email" className="field flex-1" />

          <Button type="submit" className="shrink-0" disabled={isInviting}>
            {isInviting ? 'Sending…' : 'Invite'}
          </Button>
        </Form>
      )}

      <h2 className="mb-3 font-medium">Members</h2>

      <ul className="mb-8 grid gap-2">
        {memberListItems.map((item) => {
          if (item.kind === 'invite') {
            return <PendingInviteRow key={item.invite.token} invite={item.invite} teamName={String(team.name)} />
          }

          const member = item.member

          return (
            <li key={String(member.email)} className="list-row flex items-center justify-between py-2">
              <span>
                {String(member.email)}{' '}
                <span className="text-muted-foreground text-xs">({String(member.role)})</span>
              </span>

              <div className="flex gap-2">
                {team.isAppAdmin &&
                  (member.role === 'admin' ? (
                    <Form method="post">
                      <input type="hidden" name="intent" value="demote-member" />
                      <input type="hidden" name="email" value={String(member.email)} />
                      <button type="submit" className="link-muted">
                        Make member
                      </button>
                    </Form>
                  ) : (
                    <Form method="post">
                      <input type="hidden" name="intent" value="promote-member" />
                      <input type="hidden" name="email" value={String(member.email)} />
                      <button type="submit" className="link-muted">
                        Make admin
                      </button>
                    </Form>
                  ))}

                {(team.isAdmin || team.isAppAdmin) && member.role !== 'admin' && (
                  <Form method="post">
                    <input type="hidden" name="intent" value="remove" />

                    <input type="hidden" name="email" value={String(member.email)} />

                    <button type="submit" className="link-muted">
                      Remove
                    </button>
                  </Form>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
