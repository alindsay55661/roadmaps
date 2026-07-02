import { migration as initial } from './001-initial'
import { migration as userInviteRole } from './002-user-invite-role'
import { migration as teamRegistry } from './003-team-registry'
import { migration as removedUsers } from './004-removed-users'
import { migration as inviteSource } from './005-invite-source'

export const systemMigrations = {
  1: initial,
  2: userInviteRole,
  3: teamRegistry,
  4: removedUsers,
  5: inviteSource,
}
export const SYSTEM_SCHEMA_VERSION = 5
