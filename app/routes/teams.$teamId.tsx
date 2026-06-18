import { useEffect, useState } from 'react'
import { Form, Link, redirect, useLoaderData, useSearchParams } from 'react-router'
import { sendEmail, teamInviteEmail } from 'email'
import { toast } from 'sonner'

import { getSystemAgent } from '../data/agents.server'
import { requireTeamAdmin, requireTeamMember } from '../data/team-auth.server'
import { userContext } from '../middleware/auth'
import type { Route } from './+types/teams.$teamId'

export const loader = async ({ params, context }: Route.LoaderArgs) => {
  const user = context.get(userContext)
  const env = context.cloudflare.env
  const team = await requireTeamMember({ env, teamId: params.teamId!, userId: user.email })

  const data = await team.getTeamData()

  if (!data.ok) throw new Response('Not found', { status: 404 })

  const role = await team.getMemberRole(user.email)

  return {
    ...data.body,
    isAdmin: role === 'admin',
  }
}

export const action = async ({ request, context, params }: Route.ActionArgs) => {
  const user = context.get(userContext)

  const env = context.cloudflare.env

  const formData = await request.formData()

  const intent = String(formData.get('intent'))

  const teamId = params.teamId!

  if (intent === 'invite') {
    const team = await requireTeamAdmin({ env, teamId, userId: user.email })
    const email = String(formData.get('email'))

    const system = await getSystemAgent(env)

    const existing = await system.getUserByEmail(email)

    if (existing.ok && existing.body) {
      await team.addMember({ email })
      throw redirect(`/teams/${teamId}?added=${encodeURIComponent(email)}`)
    }

    const token = crypto.randomUUID()

    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7

    await system.createInvite({
      token,
      email,
      invitedBy: user.email,
      teamId,
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

    throw redirect(`/teams/${teamId}?invited=${encodeURIComponent(email)}`)
  }

  if (intent === 'remove') {
    const team = await requireTeamAdmin({ env, teamId, userId: user.email })
    const email = String(formData.get('email'))
    await team.removeMember(email)
    throw redirect(`/teams/${teamId}?removed=${encodeURIComponent(email)}`)
  }

  throw redirect(`/teams/${teamId}`)
}

function useTeamActionFeedback() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [inviteFormKey, setInviteFormKey] = useState(0)

  useEffect(() => {
    const invited = searchParams.get('invited')
    const added = searchParams.get('added')
    const removed = searchParams.get('removed')

    if (!invited && !added && !removed) return

    if (invited) toast.success(`Invite sent to ${invited}`)
    if (added) toast.success(`${added} was added to the team`)
    if (removed) toast.success(`${removed} was removed from the team`)

    if (invited || added) setInviteFormKey((key) => key + 1)

    setSearchParams(
      (prev) => {
        prev.delete('invited')
        prev.delete('added')
        prev.delete('removed')
        return prev
      },
      { replace: true },
    )
  }, [searchParams, setSearchParams])

  return inviteFormKey
}

export default function TeamDetailPage() {
  const team = useLoaderData<typeof loader>()

  const inviteFormKey = useTeamActionFeedback()

  return (
    <div className="page-narrow">
      <Link to={`/?context=team&teamId=${team.teamId}`} className="link-back">
        ← {String(team.name)}
      </Link>

      <h1 className="mt-4 mb-6 text-2xl font-semibold">{String(team.name)}</h1>

      <h2 className="mb-3 font-medium">Members</h2>

      <ul className="mb-8 grid gap-2">
        {team.members.map((member) => (
          <li key={String(member.email)} className="list-row flex items-center justify-between py-2">
            <span>
              {String(member.email)}{' '}
              <span className="text-muted-foreground text-xs">({String(member.role)})</span>
            </span>

            {team.isAdmin && member.role !== 'admin' && (
              <Form method="post">
                <input type="hidden" name="intent" value="remove" />

                <input type="hidden" name="email" value={String(member.email)} />

                <button type="submit" className="link-muted">
                  Remove
                </button>
              </Form>
            )}
          </li>
        ))}
      </ul>

      {team.isAdmin && (
        <Form key={inviteFormKey} method="post" className="flex gap-2">
          <input type="hidden" name="intent" value="invite" />

          <input type="hidden" name="teamName" value={String(team.name)} />

          <input name="email" type="email" required placeholder="Invite by email" className="field flex-1" />

          <button type="submit" className="btn btn-primary">
            Invite
          </button>
        </Form>
      )}
    </div>
  )
}
