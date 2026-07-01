import { sharedMigrations } from 'utils'
import { Lock, migrateAgent } from 'utils/agents'
import { dataError, type DataResult, dataSuccess } from 'utils/data'
import { BaseWebSocketAgent } from 'websockets/server'

import type { SessionType, TeamMemberRole } from '../shared/types'
import type { SystemAgent } from '../system/system.agent'
import type { UserAgent } from '../user/user.agent'
import { TEAM_SCHEMA_VERSION, teamMigrations } from './migrations'

export type TeamAgentEnv = {
  SYSTEM_AGENT: DurableObjectNamespace
  USER_AGENT: DurableObjectNamespace
}

type TeamState = { teamId: string; name: string; createdBy: string }

export class TeamAgent extends BaseWebSocketAgent<TeamAgentEnv, TeamState> {
  private migrationLock = new Lock()

  constructor(state: DurableObjectState, env: TeamAgentEnv) {
    super(state, env, { autoBroadcastConnectedUsers: false })
    this.ctx.blockConcurrencyWhile(async () => {
      await migrateAgent.call(this, {
        migrations: sharedMigrations,
        latestVersion: 1,
        schemaTable: 'shared_schema_version',
      })
      await migrateAgent.call(this, {
        migrations: teamMigrations,
        latestVersion: TEAM_SCHEMA_VERSION,
        schemaTable: 'schema_version',
      })
    })
  }

  protected getDefaultPrivateState() {
    return {}
  }

  get context() {
    return {
      migrationLock: this.migrationLock,
      sql: this.ctx.storage.sql,
      storage: this.ctx.storage,
    }
  }

  async initializeTeam({
    teamId,
    name,
    createdBy,
  }: {
    teamId: string
    name: string
    createdBy: string
  }): Promise<DataResult<void>> {
    const now = Math.floor(Date.now() / 1000)
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO team_meta (id, name, created_by, created_at) VALUES (1, ?, ?, ?)`,
      name,
      createdBy,
      now,
    )
    this.ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO team_members (email, role, joined_at) VALUES (?, 'admin', ?)`,
      createdBy,
      now,
    )
    await this.setState({ teamId, name, createdBy })

    const systemAgent = this.env.SYSTEM_AGENT.get(
      this.env.SYSTEM_AGENT.idFromName('system'),
    ) as unknown as SystemAgent
    await systemAgent.registerTeam({ teamId, name, createdBy, createdAt: now })

    const userAgent = this.env.USER_AGENT.get(
      this.env.USER_AGENT.idFromName(createdBy),
    ) as unknown as UserAgent
    await userAgent.addTeamId(teamId)

    return dataSuccess()
  }

  async addMember({
    email,
    role = 'member',
  }: {
    email: string
    role?: TeamMemberRole
  }): Promise<DataResult<void>> {
    const now = Math.floor(Date.now() / 1000)
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO team_members (email, role, joined_at) VALUES (?, ?, ?)`,
      email,
      role,
      now,
    )

    const userAgent = this.env.USER_AGENT.get(
      this.env.USER_AGENT.idFromName(email),
    ) as unknown as UserAgent
    await userAgent.addTeamId(this.state.teamId)
    await this.broadcast(JSON.stringify({ type: 'team:updated' }))
    return dataSuccess()
  }

  async removeMember(email: string): Promise<DataResult<void>> {
    const role = await this.getMemberRole(email)
    if (role === 'admin') {
      const adminCount = await this.getAdminCount()
      if (adminCount <= 1) return dataError('Cannot remove the last team admin')
    }

    this.ctx.storage.sql.exec(`DELETE FROM team_members WHERE email = ?`, email)
    const userAgent = this.env.USER_AGENT.get(
      this.env.USER_AGENT.idFromName(email),
    ) as unknown as UserAgent
    await userAgent.removeTeamId(this.state.teamId)
    await this.broadcast(JSON.stringify({ type: 'team:updated' }))
    return dataSuccess()
  }

  async getMemberRole(email: string): Promise<TeamMemberRole | null> {
    const row = this.ctx.storage.sql
      .exec(`SELECT role FROM team_members WHERE email = ?`, email)
      .one()
    return (row?.role as TeamMemberRole) ?? null
  }

  async getAdminCount(): Promise<number> {
    const row = this.ctx.storage.sql
      .exec(`SELECT COUNT(*) as c FROM team_members WHERE role = 'admin'`)
      .one() as { c: number }
    return row.c
  }

  async hasAdmin(): Promise<boolean> {
    return (await this.getAdminCount()) > 0
  }

  async setMemberRole(email: string, role: TeamMemberRole): Promise<DataResult<void>> {
    const existing = await this.getMemberRole(email)
    if (!existing) return dataError('Team member not found')
    if (existing === role) return dataSuccess()
    if (existing === 'admin' && role !== 'admin') {
      const adminCount = await this.getAdminCount()
      if (adminCount <= 1) return dataError('Cannot remove the last team admin')
    }

    this.ctx.storage.sql.exec(`UPDATE team_members SET role = ? WHERE email = ?`, role, email)
    await this.broadcast(JSON.stringify({ type: 'team:updated' }))
    return dataSuccess()
  }

  async isMember(email: string) {
    const row = this.ctx.storage.sql
      .exec(`SELECT 1 FROM team_members WHERE email = ?`, email)
      .one()
    return !!row
  }

  async addTeamSession({
    uuid,
    sessionType,
    name,
    ownerEmail,
  }: {
    uuid: string
    sessionType: SessionType
    name: string
    ownerEmail: string
  }): Promise<DataResult<void>> {
    const now = Math.floor(Date.now() / 1000)
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO team_sessions (uuid, session_type, name, owner_email, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      uuid,
      sessionType,
      name,
      ownerEmail,
      now,
    )
    await this.broadcast(JSON.stringify({ type: 'team:updated' }))
    return dataSuccess()
  }

  async removeTeamSession(uuid: string): Promise<DataResult<void>> {
    this.ctx.storage.sql.exec(`DELETE FROM team_sessions WHERE uuid = ?`, uuid)
    await this.broadcast(JSON.stringify({ type: 'team:updated' }))
    return dataSuccess()
  }

  async updateTeamSessionName({
    uuid,
    name,
  }: {
    uuid: string
    name: string
  }): Promise<DataResult<void>> {
    this.ctx.storage.sql.exec(
      `UPDATE team_sessions SET name = ? WHERE uuid = ?`,
      name,
      uuid,
    )
    await this.broadcast(JSON.stringify({ type: 'team:updated' }))
    return dataSuccess()
  }

  async updateTeamSessionOwner({
    uuid,
    ownerEmail,
  }: {
    uuid: string
    ownerEmail: string
  }): Promise<DataResult<void>> {
    this.ctx.storage.sql.exec(
      `UPDATE team_sessions SET owner_email = ? WHERE uuid = ?`,
      ownerEmail,
      uuid,
    )
    await this.broadcast(JSON.stringify({ type: 'team:updated' }))
    return dataSuccess()
  }

  async getTeamData() {
    const meta = this.ctx.storage.sql
      .exec(`SELECT * FROM team_meta WHERE id = 1`)
      .one()
    const members = this.ctx.storage.sql
      .exec(`SELECT * FROM team_members ORDER BY joined_at ASC`)
      .toArray()
    const sessions = this.ctx.storage.sql
      .exec(`SELECT * FROM team_sessions ORDER BY created_at DESC`)
      .toArray()

    return dataSuccess({
      teamId: this.state.teamId,
      name: meta?.name ?? this.state.name,
      createdBy: meta?.created_by ?? this.state.createdBy,
      members: members.map((row) => ({
        email: row.email,
        role: row.role,
        joinedAt: row.joined_at,
      })),
      sessions: sessions.map((row) => ({
        uuid: row.uuid,
        sessionType: row.session_type,
        name: row.name,
        ownerEmail: row.owner_email,
        createdAt: row.created_at,
      })),
    })
  }
}
