import type { Connection, ConnectionContext } from 'agents'
import { sharedMigrations } from 'utils'
import { Lock, migrateAgent } from 'utils/agents'
import { dataSuccess } from 'utils/data'
import { BaseWebSocketAgent, type ChannelDefinition, TestChannelHandler } from 'websockets/server'

import {
  getDotVotesChannelName,
  getDotVotingSettingsChannelName,
  getGeneralChannelName,
  getItemsChannelName,
  getPropertyVotesChannelName,
  getSharingChannelName,
  getTimelineChannelName,
  getVotingPropertiesChannelName,
} from './shared/channels'
import { DotVotesChannelHandler } from './shared/channels/dot-votes'
import { DotVotingSettingsChannelHandler } from './shared/channels/dot-voting-settings'
import { GeneralChannelHandler } from './shared/channels/general'
import { ItemsChannelHandler } from './shared/channels/items'
import { PropertyVotesChannelHandler } from './shared/channels/property-votes'
import { SharingChannelHandler } from './shared/channels/sharing'
import { TimelineChannelHandler } from './shared/channels/timeline'
import { VotingPropertiesChannelHandler } from './shared/channels/voting-properties'
import * as dotVotesHandlers from './shared/handlers/dot-votes'
import * as dotVotingSettingsHandlers from './shared/handlers/dot-voting-settings'
import * as itemsHandlers from './shared/handlers/items'
import * as propertyVotesHandlers from './shared/handlers/property-votes'
import * as sessionLifecycleHandlers from './shared/handlers/session-lifecycle'
import * as sessionOwnershipHandlers from './shared/handlers/session-ownership'
import * as sessionRenameHandlers from './shared/handlers/session-rename'
import * as sharingHandlers from './shared/handlers/sharing'
import * as timelineHandlers from './shared/handlers/timeline'
import * as timelineSettingsHandlers from './shared/handlers/timeline-settings'
import * as votingPropertiesHandlers from './shared/handlers/voting-properties'
import {
  buildAccessContext,
  canAccessSession,
  getSessionLastEditedAt,
  initializeSession,
  type SessionAgentEnv,
  shareSession,
  unshareSession,
} from './shared/session-handlers'
import {
  dotVotesMigration,
  dotVotesMigrationV2,
  itemsMigration,
  propertyVotingMigration,
} from './shared/session-migrations'
import { buildSessionInitialState } from './shared/session-on-connect'
import type { SessionPrivateState, SessionPublicState } from './shared/session-schemas'
import { DEFAULT_DOT_VOTING_DOTS_PER_VOTER } from './shared/session-schemas'
import type { SessionType, SharePermission } from './shared/types'

const timelineMigrations = {
  1: `
    CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, updated_at INTEGER NOT NULL);
    ${itemsMigration}
    INSERT OR IGNORE INTO schema_version (version, updated_at) VALUES (1, UNIXEPOCH());
  `,
}

const dotMigrations = {
  1: `
    CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, updated_at INTEGER NOT NULL);
    ${itemsMigration}
    ${dotVotesMigration}
    INSERT OR IGNORE INTO schema_version (version, updated_at) VALUES (1, UNIXEPOCH());
  `,
  2: `
    ${dotVotesMigrationV2}
    UPDATE schema_version SET version = 2, updated_at = UNIXEPOCH() WHERE version = 1;
    INSERT OR IGNORE INTO schema_version (version, updated_at) VALUES (2, UNIXEPOCH());
  `,
}

const propertyMigrations = {
  1: `
    CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, updated_at INTEGER NOT NULL);
    ${itemsMigration}
    ${propertyVotingMigration}
    INSERT OR IGNORE INTO schema_version (version, updated_at) VALUES (1, UNIXEPOCH());
  `,
}

const SHARED_CHANNEL_DEFINITIONS = [
  { nameFn: getGeneralChannelName, Handler: GeneralChannelHandler },
  { nameFn: getItemsChannelName, Handler: ItemsChannelHandler },
  { nameFn: getSharingChannelName, Handler: SharingChannelHandler },
] as const

const TIMELINE_CHANNEL_DEFINITIONS = [
  ...SHARED_CHANNEL_DEFINITIONS,
  { nameFn: getTimelineChannelName, Handler: TimelineChannelHandler },
] as const

const DOT_VOTING_CHANNEL_DEFINITIONS = [
  ...SHARED_CHANNEL_DEFINITIONS,
  { nameFn: getDotVotesChannelName, Handler: DotVotesChannelHandler },
  {
    nameFn: getDotVotingSettingsChannelName,
    Handler: DotVotingSettingsChannelHandler,
  },
] as const

const PROPERTY_VOTING_CHANNEL_DEFINITIONS = [
  ...SHARED_CHANNEL_DEFINITIONS,
  { nameFn: getPropertyVotesChannelName, Handler: PropertyVotesChannelHandler },
  {
    nameFn: getVotingPropertiesChannelName,
    Handler: VotingPropertiesChannelHandler,
  },
] as const

abstract class BaseSessionAgent extends BaseWebSocketAgent<
  SessionAgentEnv,
  SessionPublicState,
  SessionPrivateState
> {
  protected migrationLock = new Lock()

  protected getDefaultPrivateState(): SessionPrivateState {
    return {
      sharedWith: {},
      timelineCycleLengthWeeks: 6,
      timelineCooldownWeeks: 2,
      timelineStartDate: null,
      timelineCycleStartNumber: 19,
      dotVotingDotsPerVoter: DEFAULT_DOT_VOTING_DOTS_PER_VOTER,
    }
  }

  protected async runMigrations(migrations: Record<number, string>, latestVersion: number) {
    await migrateAgent.call(this, {
      migrations: sharedMigrations,
      latestVersion: 1,
      schemaTable: 'shared_schema_version',
    })
    await migrateAgent.call(this, {
      migrations,
      latestVersion,
      schemaTable: 'schema_version',
    })
  }

  get context() {
    return {
      migrationLock: this.migrationLock,
      sql: this.ctx.storage.sql,
      storage: this.ctx.storage,
    }
  }

  async userHasAccess(email: string) {
    const access = await buildAccessContext(this as never, email)
    return canAccessSession(access)
  }

  async initSession(args: Parameters<typeof initializeSession>[1]) {
    return initializeSession(this as never, args)
  }

  async share(args: { email: string; permission: SharePermission; actorEmail: string }) {
    return shareSession(this as never, args)
  }

  async unshare(args: { email: string; actorEmail: string }) {
    return unshareSession(this as never, args)
  }

  async setTeam(teamId: string | null) {
    await this.setState({ ...this.state, teamId })
    return dataSuccess()
  }

  async deleteSession({ actorEmail }: { actorEmail: string }) {
    return sessionLifecycleHandlers.destroySession.call(this as never, {
      email: actorEmail,
    })
  }

  async updateSessionName({ name, actorEmail }: { name: string; actorEmail: string }) {
    return sessionRenameHandlers.renameSession.call(this as never, {
      name,
      actorEmail,
    })
  }

  async transferSessionOwnership({
    actorEmail,
    newOwnerEmail,
  }: {
    actorEmail: string
    newOwnerEmail: string
  }) {
    return sessionOwnershipHandlers.transferOwnership.call(this as never, {
      actorEmail,
      newOwnerEmail,
    })
  }

  async getLastEditedAt() {
    return dataSuccess(getSessionLastEditedAt(this as never))
  }

  /** Session UUID from public state, or DO room name before state is loaded. */
  protected getSessionUuid(): string | null {
    if (this.state?.uuid) return this.state.uuid
    try {
      return this.name || null
    } catch {
      return null
    }
  }

  protected registerChannels(): void {
    if (!this.channelRouter.getRegisteredChannels().includes('test')) {
      this.channelRouter.register('test', new TestChannelHandler())
    }

    const sessionUuid = this.getSessionUuid()
    if (!sessionUuid || !this.wsOptions.channelDefinitions) return

    for (const { nameFn, Handler } of this.wsOptions.channelDefinitions) {
      const channelName = nameFn(sessionUuid)
      if (!this.channelRouter.getRegisteredChannels().includes(channelName)) {
        this.channelRouter.register(channelName, new Handler(this))
      }
    }
  }

  async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {
    await super.onConnect(connection, ctx)

    this.registerChannels()

    const connectionData = this.getConnectionData(connection)
    if (!connectionData) {
      console.error('[SessionAgent] No connection data found after onConnect')
      return
    }

    if (!this.state?.uuid) {
      const sessionName = this.getSessionUuid() ?? 'unknown'
      console.error(`[SessionAgent] Session not initialized (name=${sessionName}, id=${this.ctx.id.toString()})`)
      this.safeSend(
        connection,
        JSON.stringify({
          type: 'error',
          message: 'Session not initialized',
        }),
      )
      connection.close(1011, 'Session not initialized')
      return
    }

    const hasAccess = await this.userHasAccess(connectionData.userId)
    if (!hasAccess) {
      this.safeSend(
        connection,
        JSON.stringify({
          type: 'error',
          message: 'Forbidden',
        }),
      )
      connection.close(1008, 'Forbidden')
      return
    }

    const initialData = await buildSessionInitialState(this as never, connectionData.userId)

    this.safeSend(
      connection,
      JSON.stringify({
        type: 'initial-state',
        data: initialData,
      }),
    )
  }
}

export class TimelineSessionAgent extends BaseSessionAgent {
  constructor(state: DurableObjectState, env: SessionAgentEnv) {
    super(state, env, {
      autoBroadcastConnectedUsers: true,
      channelDefinitions: TIMELINE_CHANNEL_DEFINITIONS as unknown as ChannelDefinition<unknown>[],
      getStateIdentifier: (agentState) => (agentState as SessionPublicState)?.uuid,
    })
    this.ctx.blockConcurrencyWhile(async () => {
      await this.runMigrations(timelineMigrations, 1)
    })
  }

  async initializeSession(args: {
    uuid: string
    name: string
    sessionType: SessionType
    ownerEmail: string
    teamId?: string | null
  }) {
    return this.initSession(args)
  }
}

export class DotVotingSessionAgent extends BaseSessionAgent {
  constructor(state: DurableObjectState, env: SessionAgentEnv) {
    super(state, env, {
      autoBroadcastConnectedUsers: true,
      channelDefinitions: DOT_VOTING_CHANNEL_DEFINITIONS as unknown as ChannelDefinition<unknown>[],
      getStateIdentifier: (agentState) => (agentState as SessionPublicState)?.uuid,
    })
    this.ctx.blockConcurrencyWhile(async () => {
      await this.runMigrations(dotMigrations, 2)
    })
  }

  async initializeSession(args: {
    uuid: string
    name: string
    sessionType: SessionType
    ownerEmail: string
    teamId?: string | null
  }) {
    return this.initSession(args)
  }
}

export class PropertyVotingSessionAgent extends BaseSessionAgent {
  constructor(state: DurableObjectState, env: SessionAgentEnv) {
    super(state, env, {
      autoBroadcastConnectedUsers: true,
      channelDefinitions: PROPERTY_VOTING_CHANNEL_DEFINITIONS as unknown as ChannelDefinition<unknown>[],
      getStateIdentifier: (agentState) => (agentState as SessionPublicState)?.uuid,
    })
    this.ctx.blockConcurrencyWhile(async () => {
      await this.runMigrations(propertyMigrations, 1)
    })
  }

  async initializeSession(args: {
    uuid: string
    name: string
    sessionType: SessionType
    ownerEmail: string
    teamId?: string | null
  }) {
    return this.initSession(args)
  }
}

declare module './session-agents' {
  interface TimelineSessionAgent {
    createItem: typeof itemsHandlers.createItem
    updateItem: typeof itemsHandlers.updateItem
    deleteItem: typeof itemsHandlers.deleteItem
    getItem: typeof itemsHandlers.getItem
    getAllItems: typeof itemsHandlers.getAllItems
    reorderItems: typeof itemsHandlers.reorderItems
    setRoadmapStatus: typeof timelineHandlers.setRoadmapStatus
    reorderTimelineItems: typeof timelineHandlers.reorderTimelineItems
    getItemsByStatus: typeof timelineHandlers.getItemsByStatus
    getAllItemsByStatus: typeof timelineHandlers.getAllItemsByStatus
    getTimelineSettings: typeof timelineSettingsHandlers.getTimelineSettings
    updateTimelineSettings: typeof timelineSettingsHandlers.updateTimelineSettings
    shareWith: typeof sharingHandlers.shareWith
    removeShare: typeof sharingHandlers.removeShare
    getSharingInfo: typeof sharingHandlers.getSharingInfo
    checkAccess: typeof sharingHandlers.checkAccess
    transferSessionOwnership(args: {
      actorEmail: string
      newOwnerEmail: string
    }): ReturnType<typeof sessionOwnershipHandlers.transferOwnership>
  }

  interface DotVotingSessionAgent {
    createItem: typeof itemsHandlers.createItem
    updateItem: typeof itemsHandlers.updateItem
    deleteItem: typeof itemsHandlers.deleteItem
    getItem: typeof itemsHandlers.getItem
    getAllItems: typeof itemsHandlers.getAllItems
    reorderItems: typeof itemsHandlers.reorderItems
    castDotVote: typeof dotVotesHandlers.castDotVote
    removeDotVote: typeof dotVotesHandlers.removeDotVote
    getDotVoteStats: typeof dotVotesHandlers.getDotVoteStats
    getCompleteDotStats: typeof dotVotesHandlers.getCompleteDotStats
    getDotVotes: typeof dotVotesHandlers.getDotVotes
    getDotVotingSettings: typeof dotVotingSettingsHandlers.getDotVotingSettings
    setDotVotingSettings: typeof dotVotingSettingsHandlers.setDotVotingSettings
    resetDotVotes: typeof dotVotingSettingsHandlers.resetDotVotes
    shareWith: typeof sharingHandlers.shareWith
    removeShare: typeof sharingHandlers.removeShare
    getSharingInfo: typeof sharingHandlers.getSharingInfo
    checkAccess: typeof sharingHandlers.checkAccess
    transferSessionOwnership(args: {
      actorEmail: string
      newOwnerEmail: string
    }): ReturnType<typeof sessionOwnershipHandlers.transferOwnership>
  }

  interface PropertyVotingSessionAgent {
    createItem: typeof itemsHandlers.createItem
    updateItem: typeof itemsHandlers.updateItem
    deleteItem: typeof itemsHandlers.deleteItem
    getItem: typeof itemsHandlers.getItem
    getAllItems: typeof itemsHandlers.getAllItems
    reorderItems: typeof itemsHandlers.reorderItems
    castPropertyVote: typeof propertyVotesHandlers.castPropertyVote
    removePropertyVote: typeof propertyVotesHandlers.removePropertyVote
    getPropertyVoteStats: typeof propertyVotesHandlers.getPropertyVoteStats
    getCompletePropertyStats: typeof propertyVotesHandlers.getCompletePropertyStats
    getPropertyVotes: typeof propertyVotesHandlers.getPropertyVotes
    createVotingProperty: typeof votingPropertiesHandlers.createVotingProperty
    updateVotingProperty: typeof votingPropertiesHandlers.updateVotingProperty
    deleteVotingProperty: typeof votingPropertiesHandlers.deleteVotingProperty
    getVotingProperty: typeof votingPropertiesHandlers.getVotingProperty
    getAllVotingProperties: typeof votingPropertiesHandlers.getAllVotingProperties
    reorderVotingProperties: typeof votingPropertiesHandlers.reorderVotingProperties
    shareWith: typeof sharingHandlers.shareWith
    removeShare: typeof sharingHandlers.removeShare
    getSharingInfo: typeof sharingHandlers.getSharingInfo
    checkAccess: typeof sharingHandlers.checkAccess
    transferSessionOwnership(args: {
      actorEmail: string
      newOwnerEmail: string
    }): ReturnType<typeof sessionOwnershipHandlers.transferOwnership>
  }
}

function bindSharedHandlers(agentClass: typeof TimelineSessionAgent) {
  BaseWebSocketAgent.bindHandlersToPrototype(agentClass, itemsHandlers)
  BaseWebSocketAgent.bindHandlersToPrototype(agentClass, sharingHandlers)
}

bindSharedHandlers(TimelineSessionAgent)

BaseWebSocketAgent.bindHandlersToPrototype(DotVotingSessionAgent, itemsHandlers)
BaseWebSocketAgent.bindHandlersToPrototype(DotVotingSessionAgent, sharingHandlers)

BaseWebSocketAgent.bindHandlersToPrototype(PropertyVotingSessionAgent, itemsHandlers)
BaseWebSocketAgent.bindHandlersToPrototype(PropertyVotingSessionAgent, sharingHandlers)

// Timeline-only handlers
BaseWebSocketAgent.bindHandlersToPrototype(TimelineSessionAgent, timelineHandlers)
BaseWebSocketAgent.bindHandlersToPrototype(TimelineSessionAgent, timelineSettingsHandlers)

BaseWebSocketAgent.bindHandlersToPrototype(DotVotingSessionAgent, dotVotesHandlers)
BaseWebSocketAgent.bindHandlersToPrototype(DotVotingSessionAgent, dotVotingSettingsHandlers)

// Property voting handlers
BaseWebSocketAgent.bindHandlersToPrototype(PropertyVotingSessionAgent, propertyVotesHandlers)
BaseWebSocketAgent.bindHandlersToPrototype(PropertyVotingSessionAgent, votingPropertiesHandlers)
