import type { RouteSummary } from '../../api/types'
import { formatMiles } from '../../lib/format'
import { levelMeta } from '../../lib/risk'
import { levelSegments } from './routeStats'

/**
 * Stacked bar of miles per risk level. The bar is decorative; the caption prints
 * every level's label and miles so colour is never the only cue.
 * (Spans, not divs: this renders inside the route card's <button>.)
 */
export function LevelBar({ summary }: { summary: RouteSummary }) {
  const segments = levelSegments(summary)
  if (segments.length === 0) return <span className="block text-xs text-muted">No mileage breakdown available.</span>
  return (
    <span className="block">
      <span aria-hidden="true" className="flex h-2.5 w-full overflow-hidden bg-surface-2">
        {segments.map((s) => (
          <span
            key={s.key}
            className={`${levelMeta(s.key === 'NONE' ? null : s.key).bgClass} h-full border-r border-surface last:border-r-0`}
            style={{ width: `${s.percent}%` }}
          />
        ))}
      </span>
      <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
        {segments.map((s) => {
          const meta = levelMeta(s.key === 'NONE' ? null : s.key)
          return (
            <span key={s.key} className="inline-flex items-center gap-1">
              <span aria-hidden="true" className={`${meta.bgClass} size-2`} />
              {meta.label} <span className="tabular text-text">{formatMiles(s.miles)}</span>
            </span>
          )
        })}
      </span>
    </span>
  )
}
