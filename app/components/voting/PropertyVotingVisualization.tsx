import { useEffect, useRef, useState } from 'react'
import { PROPERTY_VOTE_LABELS, PROPERTY_VOTE_VALUES, type PropertyVoteValue } from 'roadmaps-agents/schemas'

import { FloatingTooltip } from '~/components/roadmap/FloatingTooltip'

const TICK_VALUES = [
  PROPERTY_VOTE_VALUES.MINIMUM,
  PROPERTY_VOTE_VALUES.LOW,
  PROPERTY_VOTE_VALUES.MEDIUM,
  PROPERTY_VOTE_VALUES.HIGH,
  PROPERTY_VOTE_VALUES.MAXIMUM,
] as const

const X_DOMAIN_MIN = -0.5
const X_DOMAIN_MAX = 4.5
const X_DOMAIN_RANGE = X_DOMAIN_MAX - X_DOMAIN_MIN
const STEP_DOMAIN = 1
const MAX_CLUSTER_SPAN_DOMAIN = STEP_DOMAIN / 2
const DOT_DIAMETER_PX = 12
const DOT_BASE_OFFSET_PX = 6
const MIN_DOT_OVERLAP = 0.25
const ALTERNATE_DOT_DROP_PX = 3
const MIN_VOTES_FOR_ALTERNATE_DROP = 3

interface PropertyVoteData {
  value: PropertyVoteValue
  username: string
}

interface ProcessedPropertyVoteData extends PropertyVoteData {
  xOffsetPx: number
  dropOffsetPx: number
}

interface PropertyVotingVisualizationProps {
  votes: PropertyVoteData[]
  propertyName?: string
  showClusterBounds?: boolean
}

function maxClusterSpanPx(containerWidth: number) {
  return containerWidth * (MAX_CLUSTER_SPAN_DOMAIN / X_DOMAIN_RANGE)
}

function valueToPercent(value: number) {
  return ((value - X_DOMAIN_MIN) / X_DOMAIN_RANGE) * 100
}

function voteZoneStyle(value: PropertyVoteValue) {
  return {
    left: `${valueToPercent(value - STEP_DOMAIN / 2)}%`,
    width: `${(STEP_DOMAIN / X_DOMAIN_RANGE) * 100}%`,
  }
}

function groupVotesByValue(votes: PropertyVoteData[]) {
  const valueGroups = new Map<PropertyVoteValue, PropertyVoteData[]>()

  votes.forEach((vote) => {
    const votesAtValue = valueGroups.get(vote.value)
    if (votesAtValue) {
      votesAtValue.push(vote)
    } else {
      valueGroups.set(vote.value, [vote])
    }
  })

  return valueGroups
}

function sortedUsernamesAtValue(votesAtValue: PropertyVoteData[]) {
  return Array.from(new Set(votesAtValue.map((vote) => vote.username))).sort((a, b) => a.localeCompare(b))
}

function usePlotWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const updateWidth = () => {
      setWidth(element.getBoundingClientRect().width)
    }

    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, width }
}

function resolveClusterLayout(voteCount: number, maxSpanPx: number) {
  if (voteCount <= 1) {
    return { centerSpanPx: 0 }
  }

  const centerSpanToFillBox = Math.max(0, maxSpanPx - DOT_DIAMETER_PX)
  const spacingIfFillBox = centerSpanToFillBox / (voteCount - 1)
  const minCenterSpacingPx = DOT_DIAMETER_PX * (1 - MIN_DOT_OVERLAP)

  // Fill the bounds when that spacing respects the minimum overlap floor; otherwise
  // keep minimum overlap spacing (cluster stays compact, with whitespace in the box).
  const centerSpacingPx = spacingIfFillBox > minCenterSpacingPx ? minCenterSpacingPx : spacingIfFillBox

  let centerSpanPx = (voteCount - 1) * centerSpacingPx

  if (maxSpanPx > 0 && DOT_DIAMETER_PX + centerSpanPx > maxSpanPx) {
    centerSpanPx = centerSpanToFillBox
  }

  return { centerSpanPx }
}

function dropOffsetPxForIndex(index: number, voteCount: number) {
  if (voteCount < MIN_VOTES_FOR_ALTERNATE_DROP) return 0
  return index % 2 === 1 ? ALTERNATE_DOT_DROP_PX : 0
}

function layoutPropertyVotes(votes: PropertyVoteData[], containerWidth: number): ProcessedPropertyVoteData[] {
  const maxSpanPx = maxClusterSpanPx(containerWidth)
  const valueGroups = groupVotesByValue(votes)
  const processedVotes: ProcessedPropertyVoteData[] = []

  valueGroups.forEach((votesAtValue) => {
    const sortedVotes = [...votesAtValue].sort((a, b) => a.username.localeCompare(b.username))
    const voteCount = sortedVotes.length

    if (voteCount === 1) {
      processedVotes.push({ ...sortedVotes[0]!, xOffsetPx: 0, dropOffsetPx: 0 })
      return
    }

    const { centerSpanPx } = resolveClusterLayout(voteCount, maxSpanPx)
    const centerSpacingPx = centerSpanPx / (voteCount - 1)

    sortedVotes.forEach((vote, index) => {
      processedVotes.push({
        ...vote,
        xOffsetPx: -centerSpanPx / 2 + index * centerSpacingPx,
        dropOffsetPx: dropOffsetPxForIndex(index, voteCount),
      })
    })
  })

  return processedVotes
}

function generateUserColors(count: number) {
  const colors: string[] = []

  for (let i = 0; i < count; i++) {
    const goldenRatio = 0.618033988749
    const hue = (i * goldenRatio * 360) % 360
    colors.push(`hsl(${hue}, 70%, 55%)`)
  }

  return colors
}

function buildColorByUser(usernames: string[]) {
  const colors = generateUserColors(usernames.length)
  return new Map(usernames.map((username, index) => [username, colors[index]!]))
}

export function PropertyVotingVisualization({
  votes,
  propertyName = '',
  showClusterBounds = false,
}: PropertyVotingVisualizationProps) {
  const { ref: plotRef, width: plotWidth } = usePlotWidth()

  if (votes.length === 0) {
    return (
      <div className="flex h-[60px] w-full items-center justify-center rounded border border-gray-200 bg-gray-50">
        <span className="text-xs text-gray-500">No votes yet</span>
      </div>
    )
  }

  const processedVotes = layoutPropertyVotes(votes, plotWidth)
  const votesByValue = groupVotesByValue(votes)
  const uniqueUsernames = Array.from(new Set(votes.map((vote) => vote.username)))
  const colorByUser = buildColorByUser(uniqueUsernames)
  const clusterValues = Array.from(new Set(votes.map((vote) => vote.value)))
  const clusterSpanPx = maxClusterSpanPx(plotWidth)

  return (
    <div className="rounded border border-gray-200 bg-white p-2">
      <div
        className="w-full"
        role="img"
        aria-label={propertyName ? `Vote distribution for ${propertyName}` : 'Vote distribution'}
      >
        <div ref={plotRef} className="relative w-full">
          <div className="relative h-5 w-full">
            <div className="absolute inset-x-0 bottom-0 border-b border-gray-900" />

            {showClusterBounds &&
              clusterSpanPx > 0 &&
              clusterValues.map((value) => (
                <div
                  key={`cluster-bound-${value}`}
                  className="pointer-events-none absolute bottom-0 border border-dashed border-gray-400"
                  style={{
                    left: `calc(${valueToPercent(value)}% - ${clusterSpanPx / 2}px)`,
                    width: `${clusterSpanPx}px`,
                    height: `${DOT_BASE_OFFSET_PX + DOT_DIAMETER_PX}px`,
                  }}
                  aria-hidden
                />
              ))}

            {TICK_VALUES.map((value) => (
              <div
                key={`tick-${value}`}
                className="pointer-events-none absolute bottom-0 bg-gray-300"
                style={{
                  left: `${valueToPercent(value)}%`,
                  width: '1px',
                  height: '6px',
                  transform: 'translateX(-50%) translateY(100%)',
                }}
              />
            ))}

            {processedVotes.map((vote) => (
              <div
                key={`${vote.username}-${vote.value}`}
                className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 rounded-full opacity-80 ring-1 ring-white"
                style={{
                  left: `calc(${valueToPercent(vote.value)}% + ${vote.xOffsetPx}px)`,
                  bottom: `${DOT_BASE_OFFSET_PX - vote.dropOffsetPx}px`,
                  backgroundColor: colorByUser.get(vote.username),
                }}
              />
            ))}
          </div>

          <div className="relative mt-1.5 h-3 w-full">
            {TICK_VALUES.map((value) => (
              <span
                key={value}
                className="pointer-events-none absolute top-0 -translate-x-1/2 text-[10px] text-gray-500"
                style={{ left: `${valueToPercent(value)}%` }}
              >
                {PROPERTY_VOTE_LABELS[value]}
              </span>
            ))}
          </div>

          <div className="absolute inset-0">
            {TICK_VALUES.map((value) => {
              const votesAtValue = votesByValue.get(value) ?? []
              const usernames = sortedUsernamesAtValue(votesAtValue)
              const label = PROPERTY_VOTE_LABELS[value]

              return (
                <FloatingTooltip
                  key={`vote-zone-${value}`}
                  enabled={usernames.length > 0}
                  placement="top"
                  maxWidth={280}
                  className="text-left"
                  content={
                    <div>
                      <div className="font-medium capitalize">
                        {label} - {usernames.length} vote{usernames.length === 1 ? '' : 's'}
                      </div>
                      {usernames.map((username) => (
                        <div key={username}>{username}</div>
                      ))}
                    </div>
                  }
                >
                  <div
                    className={usernames.length > 0 ? 'absolute inset-y-0 cursor-default' : 'absolute inset-y-0'}
                    style={voteZoneStyle(value)}
                    aria-label={usernames.length > 0 ? `${label}: ${usernames.join(', ')}` : `${label}: no votes`}
                  />
                </FloatingTooltip>
              )
            })}
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap justify-center gap-1">
        {uniqueUsernames.map((username) => {
          const userVoteCount = votes.filter((vote) => vote.username === username).length
          return (
            <div key={username} className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: colorByUser.get(username) }} />
              <span className="text-xs text-gray-600">
                {username.length > 8 ? `${username.slice(0, 8)}...` : username}
                {userVoteCount > 1 && ` (${userVoteCount})`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function transformPropertyVoteToData(vote: { value: number; username: string }): PropertyVoteData {
  return {
    value: vote.value as PropertyVoteValue,
    username: vote.username,
  }
}
