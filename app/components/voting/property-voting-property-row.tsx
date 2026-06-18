import type { PropertyVoteValue, VotingProperty } from 'roadmaps-agents/schemas'

import { Button } from '~/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { PropertyVotingVisualization, transformPropertyVoteToData } from './PropertyVotingVisualization'
import type { usePropertyVoteHelpers } from './use-property-vote-helpers'

type PropertyVotingPropertyRowProps = {
  itemUuid: string
  property: VotingProperty
  isConnected: boolean
  voteHelpers: ReturnType<typeof usePropertyVoteHelpers>
  onRemovePropertyVote: (propertyUuid: string, itemUuid: string) => void
}

export function PropertyVotingPropertyRow({
  itemUuid,
  property,
  isConnected,
  voteHelpers,
  onRemovePropertyVote,
}: PropertyVotingPropertyRowProps) {
  const {
    voteOptions,
    getEffectiveVoteForItemProperty,
    hasUserVoted,
    getItemPropertyStats,
    getAlignmentScore,
    canChangeVote,
    getVoteChangeRestrictionReason,
    handlePropertyVote,
    setOptimisticVote,
    clearOptimisticVote,
  } = voteHelpers

  const effectiveVote = getEffectiveVoteForItemProperty(itemUuid, property.uuid)
  const itemStats = getItemPropertyStats(itemUuid, property.uuid)
  const canChange = canChangeVote(itemUuid, property.uuid)
  const isVotingDisabled = !isConnected || !canChange
  const restrictionReason = getVoteChangeRestrictionReason(itemUuid, property.uuid)
  const alignment = getAlignmentScore(itemUuid, property.uuid)

  return (
    <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="font-medium text-gray-800">{property.name}</div>
        </div>

        <div className="flex items-center gap-4 text-xs text-gray-600">
          {hasUserVoted(itemUuid, property.uuid) && (
            <div className="flex items-center gap-4">
              <div>
                Votes: {itemStats?.totalVotes || 0}
                {itemStats && itemStats.totalVotes > 0 && (
                  <span className="ml-2">Avg: {itemStats.average.toFixed(1)}</span>
                )}
              </div>
              {alignment && (
                <div
                  className={`rounded-md px-2 py-1 text-xs font-medium ${
                    alignment.score === 'aligned' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {alignment.score}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
        <div className="order-2 flex items-center justify-center gap-2 sm:order-1 sm:justify-start">
          <div className="flex flex-col gap-2">
            <ToggleGroup
              type="single"
              size="sm"
              value={effectiveVote?.toString() || ''}
              onValueChange={(value) => {
                if (value && canChange) {
                  const numericValue = parseInt(value) as PropertyVoteValue
                  setOptimisticVote(itemUuid, property.uuid, numericValue)
                  handlePropertyVote(itemUuid, property.uuid, numericValue)
                }
              }}
              disabled={isVotingDisabled}
              className="flex gap-1"
            >
              {voteOptions.map((option) => {
                const toggleItem = (
                  <ToggleGroupItem
                    key={option.value}
                    value={option.value.toString()}
                    className={`flex-none px-2 py-1 text-xs capitalize ${
                      isVotingDisabled && canChange === false ? 'cursor-not-allowed opacity-50' : ''
                    }`}
                  >
                    {option.label}
                  </ToggleGroupItem>
                )

                if (restrictionReason) {
                  return (
                    <Tooltip key={option.value}>
                      <TooltipTrigger asChild>
                        <div className="inline-block">{toggleItem}</div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="z-50 max-w-xs">
                        <p className="text-sm">{restrictionReason}</p>
                      </TooltipContent>
                    </Tooltip>
                  )
                }

                return toggleItem
              })}
            </ToggleGroup>

            {effectiveVote !== null && (
              <PropertyVoteClearButton
                canChange={canChange}
                isClearDisabled={!isConnected || !canChange}
                restrictionReason={restrictionReason}
                onClear={() => {
                  if (canChange) {
                    clearOptimisticVote(itemUuid, property.uuid)
                    onRemovePropertyVote(property.uuid, itemUuid)
                  }
                }}
              />
            )}
          </div>
        </div>

        {hasUserVoted(itemUuid, property.uuid) && itemStats && itemStats.votes.length > 0 && (
          <div className="order-1 w-full min-w-0 sm:order-2">
            <PropertyVotingVisualization votes={itemStats.votes.map(transformPropertyVoteToData)} />
          </div>
        )}
      </div>
    </div>
  )
}

type PropertyVoteClearButtonProps = {
  canChange: boolean
  isClearDisabled: boolean
  restrictionReason: string | null
  onClear: () => void
}

function PropertyVoteClearButton({
  canChange,
  isClearDisabled,
  restrictionReason,
  onClear,
}: PropertyVoteClearButtonProps) {
  const clearButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={onClear}
      disabled={isClearDisabled}
      className={`w-full px-2 py-1 text-xs ${
        isClearDisabled && canChange === false ? 'cursor-not-allowed opacity-50' : ''
      }`}
    >
      Clear
    </Button>
  )

  if (restrictionReason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-block">{clearButton}</div>
        </TooltipTrigger>
        <TooltipContent side="top" className="z-50 max-w-xs">
          <p className="text-sm">{restrictionReason}</p>
        </TooltipContent>
      </Tooltip>
    )
  }

  return clearButton
}
