import { Form, Link, redirect, useLoaderData } from 'react-router'

import { requireAdmin } from '../auth/session.server'
import { getTeamAgent } from '../data/agents.server'
import { backfillTeamRegistry, listRegisteredTeams } from '../data/team-registry.server'
import type { Route } from './+types/admin.teams'

export const loader = async ({ request, context }: Route.LoaderArgs) => {
  await requireAdmin(request, context.cloudflare.env)

  const registry = await listRegisteredTeams(context.cloudflare.env)
  const teams = await Promise.all(
    registry.map(async (record) => {
      const team = await getTeamAgent(context.cloudflare.env, record.teamId)
      const data = await team.getTeamData()
      const adminCount = await team.getAdminCount()
      return {
        ...record,
        name: data.ok ? String(data.body.name) : record.name,
        createdBy: data.ok ? String(data.body.createdBy) : record.createdBy,
        memberCount: data.ok ? data.body.members.length : 0,
        adminCount,
        sessionCount: data.ok ? data.body.sessions.length : 0,
        members: data.ok ? data.body.members : [],
        orphaned: adminCount === 0,
      }
    }),
  )

  return { teams }
}

export const action = async ({ request, context }: Route.ActionArgs) => {
  const admin = await requireAdmin(request, context.cloudflare.env)
  const env = context.cloudflare.env
  const formData = await request.formData()
  const intent = String(formData.get('intent'))

  if (intent === 'refresh-registry') {
    await backfillTeamRegistry(env)
    throw redirect('/admin/teams')
  }

  const teamId = String(formData.get('teamId'))
  const team = await getTeamAgent(env, teamId)

  if (intent === 'claim-admin') {
    const result = await team.addMember({ email: admin.email, role: 'admin' })
    if (!result.ok) throw new Response(result.errors[0] ?? 'Failed to claim team admin', { status: 400 })
  }

  if (intent === 'promote-member' || intent === 'demote-member') {
    const email = String(formData.get('email'))
    const role = intent === 'promote-member' ? 'admin' : 'member'
    const result = await team.setMemberRole(email, role)
    if (!result.ok) throw new Response(result.errors[0] ?? 'Failed to update member role', { status: 400 })
  }

  throw redirect('/admin/teams')
}

export default function AdminTeamsPage() {
  const { teams } = useLoaderData<typeof loader>()

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Teams</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            View all registered teams and claim orphaned teams.
          </p>
        </div>

        <Form method="post">
          <input type="hidden" name="intent" value="refresh-registry" />
          <button type="submit" className="btn btn-secondary">
            Refresh team registry
          </button>
        </Form>
      </div>

      <ul className="grid gap-3">
        {teams.map((team) => (
          <li key={team.teamId} className="list-row grid gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">
                    <Link
                      to={`/teams/${team.teamId}`}
                      className="text-primary hover:text-blue-700 hover:underline"
                    >
                      {team.name}
                    </Link>
                  </h3>
                  {team.orphaned && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      no team admin
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  Created by {team.createdBy} · {team.memberCount} members · {team.adminCount} admins ·{' '}
                  {team.sessionCount} sessions
                </p>
              </div>

              {team.orphaned && (
                <div className="flex flex-wrap gap-2">
                  <Form method="post">
                    <input type="hidden" name="intent" value="claim-admin" />
                    <input type="hidden" name="teamId" value={team.teamId} />
                    <button type="submit" className="link-muted">
                      Claim admin
                    </button>
                  </Form>
                </div>
              )}
            </div>

            {team.members.length > 0 && (
              <div className="grid gap-2 border-t pt-3">
                {team.members.map((member) => (
                  <div key={String(member.email)} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      {String(member.email)}{' '}
                      <span className="text-muted-foreground text-xs">({String(member.role)})</span>
                    </span>

                    <Form method="post">
                      <input type="hidden" name="teamId" value={team.teamId} />
                      <input type="hidden" name="email" value={String(member.email)} />
                      <input
                        type="hidden"
                        name="intent"
                        value={member.role === 'admin' ? 'demote-member' : 'promote-member'}
                      />
                      <button type="submit" className="link-muted">
                        {member.role === 'admin' ? 'Make member' : 'Make admin'}
                      </button>
                    </Form>
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
