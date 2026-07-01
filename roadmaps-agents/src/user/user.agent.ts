import { Connection } from 'agents'
import { sharedMigrations } from 'utils'
import { Lock, migrateAgent } from 'utils/agents'
import { type DataResult, dataSuccess } from 'utils/data'
import { BaseWebSocketAgent } from 'websockets/server'

import type { SessionType, SharePermission } from '../shared/types'
import { USER_SCHEMA_VERSION, userMigrations } from './migrations'
import type { HomeContextKey, UserAccountRevokeReason, UserPrivateState } from './user-schemas'
import { resolveHomeContext, USER_ACCOUNT_EVENTS, userSettingsKeys } from './user-schemas'

export type UserAgentEnv = {
  TEAM_AGENT: DurableObjectNamespace
}

type UserState = { email: string }

export class UserAgent extends BaseWebSocketAgent<UserAgentEnv, UserState, UserPrivateState> {
  private migrationLock = new Lock()

  constructor(state: DurableObjectState, env: UserAgentEnv) {
    super(state, env, { autoBroadcastConnectedUsers: false })
    this.ctx.blockConcurrencyWhile(async () => {
      await migrateAgent.call(this, {
        migrations: sharedMigrations,
        latestVersion: 1,
        schemaTable: 'shared_schema_version',
      })
      await migrateAgent.call(this, {
        migrations: userMigrations,
        latestVersion: USER_SCHEMA_VERSION,
        schemaTable: 'schema_version',
      })
    })
  }

  protected getDefaultPrivateState(): UserPrivateState {
    return { settings: {} }
  }

  getTeamIds() {
    return this.ctx.storage.sql
      .exec(`SELECT team_id FROM team_ids ORDER BY joined_at ASC`)
      .toArray()
      .map((row) => row.team_id as string)
  }

  async getHomeContext() {
    const settings = this.getPrivateState().settings ?? {}

    return dataSuccess(
      resolveHomeContext({
        storedContext: settings[userSettingsKeys.homeContext],
        storedTeamId: settings[userSettingsKeys.homeTeamId] || null,
        teamIds: this.getTeamIds(),
      }),
    )
  }

  async setHomeContext({ context, teamId }: { context: HomeContextKey; teamId?: string | null }) {
    const settings = this.getPrivateState().settings ?? {}
    const resolved = resolveHomeContext({
      storedContext: context,
      storedTeamId: teamId ?? null,
      teamIds: this.getTeamIds(),
    })

    this.setPrivateStatePartial({
      settings: {
        ...settings,
        [userSettingsKeys.homeContext]: resolved.context,
        [userSettingsKeys.homeTeamId]: resolved.teamId ?? '',
      },
    })

    return dataSuccess(resolved)
  }

  get context() {
    return {
      migrationLock: this.migrationLock,
      sql: this.ctx.storage.sql,
      storage: this.ctx.storage,
    }
  }

  async initializeUser(email: string) {
    await this.setState({ email })
  }

  async addPersonalSession({
    uuid,
    sessionType,
    name,
  }: {
    uuid: string
    sessionType: SessionType
    name: string
  }): Promise<DataResult<void>> {
    const now = Math.floor(Date.now() / 1000)
    this.ctx.storage.sql.exec(
      `INSERT INTO personal_sessions (uuid, session_type, name, created_at) VALUES (?, ?, ?, ?)`,
      uuid,
      sessionType,
      name,
      now,
    )
    await this.broadcast(JSON.stringify({ type: 'sessions:updated' }))
    return dataSuccess()
  }

  async removePersonalSession(uuid: string): Promise<DataResult<void>> {
    this.ctx.storage.sql.exec(`DELETE FROM personal_sessions WHERE uuid = ?`, uuid)
    await this.broadcast(JSON.stringify({ type: 'sessions:updated' }))
    return dataSuccess()
  }

  async updatePersonalSessionName({ uuid, name }: { uuid: string; name: string }): Promise<DataResult<void>> {
    this.ctx.storage.sql.exec(`UPDATE personal_sessions SET name = ? WHERE uuid = ?`, name, uuid)
    await this.broadcast(JSON.stringify({ type: 'sessions:updated' }))
    return dataSuccess()
  }

  async updateSharedSessionName({ uuid, name }: { uuid: string; name: string }): Promise<DataResult<void>> {
    this.ctx.storage.sql.exec(`UPDATE shared_sessions SET name = ? WHERE uuid = ?`, name, uuid)
    await this.broadcast(JSON.stringify({ type: 'sessions:updated' }))
    return dataSuccess()
  }

  async updateSharedSessionOwner({
    uuid,
    ownerEmail,
  }: {
    uuid: string
    ownerEmail: string
  }): Promise<DataResult<void>> {
    this.ctx.storage.sql.exec(`UPDATE shared_sessions SET owner_email = ? WHERE uuid = ?`, ownerEmail, uuid)
    await this.broadcast(JSON.stringify({ type: 'sessions:updated' }))
    return dataSuccess()
  }

  async addSharedSession({
    uuid,
    sessionType,
    name,
    ownerEmail,
    permission,
  }: {
    uuid: string
    sessionType: SessionType
    name: string
    ownerEmail: string
    permission: SharePermission
  }): Promise<DataResult<void>> {
    const now = Math.floor(Date.now() / 1000)
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO shared_sessions (uuid, session_type, name, owner_email, permission, shared_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      uuid,
      sessionType,
      name,
      ownerEmail,
      permission,
      now,
    )
    await this.broadcast(JSON.stringify({ type: 'sessions:updated' }))
    return dataSuccess()
  }

  async removeSharedSession(uuid: string): Promise<DataResult<void>> {
    this.ctx.storage.sql.exec(`DELETE FROM shared_sessions WHERE uuid = ?`, uuid)
    await this.broadcast(JSON.stringify({ type: 'sessions:updated' }))
    return dataSuccess()
  }

  async addTeamId(teamId: string): Promise<DataResult<void>> {
    const now = Math.floor(Date.now() / 1000)
    this.ctx.storage.sql.exec(`INSERT OR IGNORE INTO team_ids (team_id, joined_at) VALUES (?, ?)`, teamId, now)
    await this.broadcast(JSON.stringify({ type: 'teams:updated' }))
    return dataSuccess()
  }

  async removeTeamId(teamId: string): Promise<DataResult<void>> {
    this.ctx.storage.sql.exec(`DELETE FROM team_ids WHERE team_id = ?`, teamId)
    await this.broadcast(JSON.stringify({ type: 'teams:updated' }))
    return dataSuccess()
  }

  async revokeAccess({ reason }: { reason: UserAccountRevokeReason }): Promise<DataResult<void>> {
    const message = JSON.stringify({
      type: USER_ACCOUNT_EVENTS.REVOKED,
      reason,
    })

    await this.broadcastToAll(message)

    for (const connection of this.ctx.getWebSockets()) {
      try {
        if (connection.readyState !== WebSocket.OPEN) continue
      } catch {
        continue
      }

      ;(connection as Connection).close(1008, 'Account revoked')
    }

    return dataSuccess()
  }

  async getDashboard() {
    const personal = this.ctx.storage.sql
      .exec(`SELECT * FROM personal_sessions ORDER BY created_at DESC`)
      .toArray()
    const shared = this.ctx.storage.sql.exec(`SELECT * FROM shared_sessions ORDER BY shared_at DESC`).toArray()
    const teams = this.ctx.storage.sql.exec(`SELECT team_id FROM team_ids ORDER BY joined_at ASC`).toArray()

    return dataSuccess({
      personal: personal.map((row) => ({
        uuid: row.uuid,
        sessionType: row.session_type,
        name: row.name,
        ownerEmail: this.state.email,
        createdAt: row.created_at,
      })),
      shared: shared.map((row) => ({
        uuid: row.uuid,
        sessionType: row.session_type,
        name: row.name,
        ownerEmail: row.owner_email,
        permission: row.permission,
        sharedAt: row.shared_at,
      })),
      teamIds: teams.map((row) => row.team_id as string),
    })
  }
}
