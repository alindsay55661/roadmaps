import { Form, Link, redirect, useLoaderData } from 'react-router'
import type { SessionType } from 'roadmaps-agents/schemas'

import { requireAdmin } from '../auth/session.server'
import { getSystemAgent, getTeamAgent, getUserAgent } from '../data/agents.server'
import { deleteSessionForUser, handleSessionAction } from '../data/session-actions.server'
import { enrichAndSortSessionList, type SessionListEntry } from '../data/session-list.server'
import { listRegisteredTeams } from '../data/team-registry.server'
import { sessionPath } from '../utils/sessions'
import type { Route } from './+types/admin.unassigned'

export const loader = async ({ request, context }: Route.LoaderArgs) => {
  await requireAdmin(request, context.cloudflare.env)
  const env = context.cloudflare.env
  const system = await getSystemAgent(env)

  const users = await system.listUsers()
  const deactivatedUsers = users.ok ? users.body.filter((user) => user.status === 'deactivated') : []
  const removedUsers = await system.listRemovedUsers()
  const removedOwnerEmails = removedUsers.ok ? removedUsers.body.map((user) => user.email) : []
  const owners = [
    ...deactivatedUsers.map((user) => ({ email: user.email, status: user.status })),
    ...removedOwnerEmails
      .filter((email) => !deactivatedUsers.some((user) => user.email === email))
      .map((email) => ({ email, status: 'deleted' as const })),
  ]

  const groups = await Promise.all(
    owners.map(async (owner) => {
      const userAgent = await getUserAgent(env, owner.email)
      const dashboard = await userAgent.getDashboard()
      const sessions: SessionListEntry[] = dashboard.ok
        ? dashboard.body.personal.map((session) => ({
            uuid: String(session.uuid),
            sessionType: session.sessionType as SessionType,
            name: String(session.name),
            ownerEmail: owner.email,
            createdAt: typeof session.createdAt === 'number' ? session.createdAt : undefined,
          }))
        : []

      return {
        ownerEmail: owner.email,
        status: owner.status,
        sessions: await enrichAndSortSessionList({ env, sessions }),
      }
    }),
  )

  const teamRecords = await listRegisteredTeams(env)
  const teams = await Promise.all(
    teamRecords.map(async (record) => {
      const team = await getTeamAgent(env, record.teamId)
      const data = await team.getTeamData()
      return {
        id: record.teamId,
        name: data.ok ? String(data.body.name) : record.name,
      }
    }),
  )

  return {
    groups: groups.filter((group) => group.sessions.length > 0),
    teams,
  }
}

export const action = async ({ request, context }: Route.ActionArgs) => {
  const admin = await requireAdmin(request, context.cloudflare.env)
  const env = context.cloudflare.env
  const formData = await request.formData()
  const intent = String(formData.get('intent'))
  const uuid = String(formData.get('uuid'))
  const sessionType = String(formData.get('sessionType')) as SessionType

  if (intent === 'delete-session') {
    await deleteSessionForUser({ env, user: admin, uuid, sessionType })
    throw redirect('/admin/unassigned')
  }

  if (intent === 'move-to-team' || intent === 'transfer-ownership') {
    await handleSessionAction({
      env,
      user: admin,
      uuid,
      sessionType,
      formData,
      requestUrl: request.url,
    })
    throw redirect('/admin/unassigned')
  }

  throw redirect('/admin/unassigned')
}

export default function AdminUnassignedPage() {
  const { groups, teams } = useLoaderData<typeof loader>()

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-xl font-semibold">Unassigned Content</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Draft sessions owned by deactivated users. Active users' drafts are not shown here.
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="list-row text-muted-foreground text-sm">No unassigned drafts found.</div>
      ) : (
        groups.map((group) => (
          <section key={group.ownerEmail} className="grid gap-3">
            <div>
              <h3 className="font-medium">{group.ownerEmail}</h3>
              <p className="text-muted-foreground text-xs">{group.status}</p>
            </div>

            <ul className="grid gap-2">
              {group.sessions.map((session) => (
                <li key={session.uuid} className="list-row grid gap-3">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <Link to={sessionPath(session.sessionType, session.uuid)} className="font-medium hover:underline">
                        {session.name}
                      </Link>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {session.sessionType} · owner {session.ownerEmail}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Form method="post">
                        <input type="hidden" name="intent" value="delete-session" />
                        <input type="hidden" name="uuid" value={session.uuid} />
                        <input type="hidden" name="sessionType" value={session.sessionType} />
                        <button type="submit" className="text-sm text-red-600 hover:text-red-700">
                          Delete
                        </button>
                      </Form>
                    </div>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2">
                    <Form method="post" className="flex gap-2">
                      <input type="hidden" name="intent" value="move-to-team" />
                      <input type="hidden" name="uuid" value={session.uuid} />
                      <input type="hidden" name="sessionType" value={session.sessionType} />
                      <input type="hidden" name="name" value={session.name} />
                      <select name="teamId" className="field flex-1" required>
                        <option value="">Move to team...</option>
                        {teams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="btn btn-secondary">
                        Move
                      </button>
                    </Form>

                    <Form method="post" className="flex gap-2">
                      <input type="hidden" name="intent" value="transfer-ownership" />
                      <input type="hidden" name="uuid" value={session.uuid} />
                      <input type="hidden" name="sessionType" value={session.sessionType} />
                      <input name="newOwnerEmail" type="email" required placeholder="New owner email" className="field flex-1" />
                      <button type="submit" className="btn btn-secondary">
                        Transfer
                      </button>
                    </Form>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
