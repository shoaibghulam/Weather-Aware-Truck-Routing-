import type { PlannedRoute } from '../../api/types'
import { formatDateTime, formatDelta, formatDuration, formatMiles } from '../../lib/format'
import { levelMeta, levelOnDark } from '../../lib/risk'
import { LevelBar } from './LevelBar'
import { routeBadges, type RouteBadge } from './routeStats'

interface RouteCardProps {
  route: PlannedRoute
  fastestS: number
  isSelected: boolean
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
}

const BADGE_TONE: Record<RouteBadge['tone'], string> = {
  accent: 'bg-accent text-accent-contrast',
  neutral: 'border border-line-strong text-muted',
  warn: 'border border-dashed border-risk-none text-text',
}

export function RouteCard({ route, fastestS, isSelected, onSelect, onHover }: RouteCardProps) {
  const { summary } = route
  const max = levelMeta(summary.max_level)
  const delta = summary.duration_s - fastestS
  const badges = routeBadges(route)
  return (
    <li>
      <button
        type="button"
        aria-pressed={isSelected}
        onClick={() => onSelect(route.id)}
        onMouseEnter={() => onHover(route.id)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(route.id)}
        onBlur={() => onHover(null)}
        className={`relative block w-full cursor-pointer border bg-surface py-3 pr-4 pl-5 text-left transition-colors duration-150 hover:border-line-strong ${
          isSelected ? 'border-text' : 'border-line'
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute inset-y-0 left-0 w-1 ${route.recommended ? 'bg-accent' : 'bg-line-strong'}`}
        />
        <span className="flex items-baseline justify-between gap-3">
          <span className="flex items-baseline gap-2">
            <span className="tabular text-xs text-muted">#{route.rank}</span>
            <span className="text-lg leading-tight font-semibold">{route.name}</span>
          </span>
          <span
            className={`${max.bgClass} ${levelOnDark(summary.max_level) ? 'text-white' : 'text-(--ink-900)'} shrink-0 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase`}
          >
            Max: {max.label}
          </span>
        </span>

        {badges.length > 0 && (
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            {badges.map((b) => (
              <span key={b.label} className={`px-1.5 py-px text-[11px] font-medium ${BADGE_TONE[b.tone]}`}>
                {b.label}
              </span>
            ))}
          </span>
        )}

        <span className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
          <Stat term="Distance" value={formatMiles(summary.distance_mi)} />
          <Stat term="Drive time" value={formatDuration(summary.duration_s)} />
          <Stat term="vs fastest" value={formatDelta(delta)} />
          <Stat term="Arrive" value={formatDateTime(summary.arrival)} />
        </span>

        <span className="mt-3 block">
          <LevelBar summary={summary} />
        </span>
      </button>
    </li>
  )
}

function Stat({ term, value }: { term: string; value: string }) {
  return (
    <span className="block min-w-0">
      <span className="block text-[10px] font-semibold tracking-widest text-muted uppercase">{term}</span>{' '}
      <span className="tabular block truncate text-sm">{value}</span>
    </span>
  )
}
