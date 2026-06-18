import { Link, useLoaderData } from 'react-router'

import { getAuthenticatedUser } from '~/auth/get-authenticated-user.server'
import { SessionItemsBulkDialog } from '~/components/items/SessionItemsBulkDialog'
import { SessionConnectionProvider } from '~/components/session/SessionConnectionContext'
import { SessionDetailProvider, useSessionDetail } from '~/components/session/SessionDetailContext'
import { SessionSettingsButton } from '~/components/session/SessionSettingsButton'
import { SessionShell } from '~/components/session/SessionShell'
import { InteractivePropertyVoting } from '~/components/voting/InteractivePropertyVoting'
import { handleSessionAction } from '~/data/session-actions.server'
import { loadSessionContext } from '~/data/session-loader.server'
import { useItems, usePropertyVotes, useVotingProperties } from '~/hooks'
import type { Route } from './+types/property-voting.$uuid'

export const loader = async ({ params, context, request }: Route.LoaderArgs) => {
  const user = await getAuthenticatedUser({
    context,
    request,
    env: context.cloudflare.env,
  })
  return loadSessionContext({
    env: context.cloudflare.env,
    user,
    uuid: params.uuid!,
    sessionType: 'property_voting',
  })
}

export const action = async ({ request, context, params }: Route.ActionArgs) => {
  const user = await getAuthenticatedUser({
    context,
    request,
    env: context.cloudflare.env,
  })
  const formData = await request.formData()
  return handleSessionAction({
    env: context.cloudflare.env,
    user,
    uuid: params.uuid!,
    sessionType: 'property_voting',
    formData,
    requestUrl: request.url,
  })
}

function PropertyVotingContent() {
  const loaderData = useLoaderData<typeof loader>()
  const { isConnected, connectedUsers, sessionUuid, userEmail, sessionName, isOwner, canEdit } =
    useSessionDetail()

  const { items, createItem, updateItem, deleteItem } = useItems({
    sessionUuid,
    userEmail,
    initialItems: loaderData.items,
  })

  const { votingProperties } = useVotingProperties({
    sessionUuid,
    userEmail,
    initialVotingProperties: loaderData.votingProperties,
  })

  const { castPropertyVote, removePropertyVote, getCompletePropertyStats, completePropertyStats } =
    usePropertyVotes({
      sessionUuid,
    })

  function handleBulkCreate(titles: string[]) {
    titles.forEach((title) => {
      if (title.trim()) createItem({ title: title.trim() })
    })
  }

  return (
    <SessionShell
      sessionType="property_voting"
      sessionName={sessionName ?? loaderData.session.name}
      isOwner={isOwner}
      isConnected={isConnected}
      teamId={loaderData.session.teamId}
      currentTeamName={loaderData.currentTeamName}
      teams={loaderData.teams}
      headerActions={
        canEdit ? (
          <>
            <SessionItemsBulkDialog
              items={items}
              linearEnabled={loaderData.linearEnabled}
              aiEnabled={loaderData.aiEnabled}
              onBulkCreate={handleBulkCreate}
            />
            <SessionSettingsButton sessionType="property_voting" uuid={loaderData.uuid} />
          </>
        ) : undefined
      }
      help={{
        title: 'Alignment Voting',
        description: 'Rate different aspects of each issue to see where stakeholders align.',
      }}
    >
      {items.length === 0 ? (
        <div className="mx-auto max-w-[720px] rounded-lg border border-gray-200 bg-gray-50 p-6 text-center text-gray-500">
          <p>No items available for voting.</p>
          {canEdit && (
            <p className="mt-2 text-sm">
              Use <strong>Add items</strong> to import from Linear or paste multiple titles.
            </p>
          )}
        </div>
      ) : votingProperties.length === 0 ? (
        <div className="mx-auto max-w-[720px] rounded-lg border border-gray-200 bg-gray-50 p-6 text-center text-gray-500">
          <p>No voting properties yet.</p>
          {canEdit && (
            <p className="mt-1 text-sm">
              <Link to={`/property-voting/${loaderData.uuid}/settings`} className="text-primary underline">
                Add properties in settings
              </Link>
            </p>
          )}
        </div>
      ) : (
        <div className="mx-auto max-w-[720px]">
          <InteractivePropertyVoting
            items={items}
            votingProperties={votingProperties}
            userEmail={userEmail}
            isConnected={isConnected}
            connectedUsers={connectedUsers}
            completePropertyStats={completePropertyStats}
            onPropertyVote={castPropertyVote}
            onRemovePropertyVote={removePropertyVote}
            onGetCompletePropertyStats={getCompletePropertyStats}
            canEdit={canEdit}
            onCreateItem={createItem}
            onUpdateItem={updateItem}
            onDeleteItem={deleteItem}
          />
        </div>
      )}
    </SessionShell>
  )
}

export default function PropertyVotingSessionPage() {
  const data = useLoaderData<typeof loader>()

  return (
    <SessionConnectionProvider sessionType="property_voting" uuid={data.uuid}>
      <SessionDetailProvider
        key={data.uuid}
        userEmail={data.user.email}
        session={data.session}
        sessionType="property_voting"
        initialSessionName={data.session.name}
        canEdit={data.canEdit}
        canVote={data.canVote}
        isOwner={data.isOwner}
        initialSharingInfo={data.sharingInfo}
      >
        <PropertyVotingContent />
      </SessionDetailProvider>
    </SessionConnectionProvider>
  )
}
