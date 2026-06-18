import { Link } from 'react-router'
import { PROPERTY_VOTE_VALUES, type PropertyVoteValue } from 'roadmaps-agents/schemas'

import { PropertyVotingVisualization } from '~/components/voting/PropertyVotingVisualization'

const MOBILE_CHART_WIDTH_PX = 320
const DESKTOP_CHART_WIDTH_PX = 720
const MAX_VOTE_COUNT = 10

function buildMockVotes(voteCount: number) {
  return Array.from({ length: voteCount }, (_, index) => ({
    value: PROPERTY_VOTE_VALUES.MEDIUM as PropertyVoteValue,
    username: `voter-${index + 1}@example.com`,
  }))
}

export default function PropertyVotingChartDevPage() {
  const voteCounts = Array.from({ length: MAX_VOTE_COUNT }, (_, index) => index + 1)

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-8">
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-700">
          ← Back to home
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">Alignment chart overlap preview</h1>
        <p className="mt-1 text-sm text-gray-600">
          All votes are on <strong>medium</strong>. Compare mobile ({MOBILE_CHART_WIDTH_PX}px) vs desktop (
          {DESKTOP_CHART_WIDTH_PX}px) widths for 1–{MAX_VOTE_COUNT} voters. Dotted boxes show the maximum cluster
          width (half a step).
        </p>
      </div>

      <div className="grid grid-cols-[7rem_320px_minmax(0,720px)] items-center gap-x-6 gap-y-8">
        <div />
        <div className="text-xs font-medium tracking-wide text-gray-500 uppercase">
          Mobile ({MOBILE_CHART_WIDTH_PX}px)
        </div>
        <div className="text-xs font-medium tracking-wide text-gray-500 uppercase">
          Desktop ({DESKTOP_CHART_WIDTH_PX}px)
        </div>

        {voteCounts.map((voteCount) => (
          <VoteCountChartRow key={voteCount} voteCount={voteCount} />
        ))}
      </div>
    </div>
  )
}

type VoteCountChartRowProps = {
  voteCount: number
}

function VoteCountChartRow({ voteCount }: VoteCountChartRowProps) {
  const votes = buildMockVotes(voteCount)

  return (
    <>
      <div className="text-sm font-medium text-gray-700">
        {voteCount} {voteCount === 1 ? 'vote' : 'votes'}
      </div>
      <div style={{ width: MOBILE_CHART_WIDTH_PX }}>
        <PropertyVotingVisualization votes={votes} showClusterBounds />
      </div>
      <div style={{ width: DESKTOP_CHART_WIDTH_PX }}>
        <PropertyVotingVisualization votes={votes} showClusterBounds />
      </div>
    </>
  )
}
