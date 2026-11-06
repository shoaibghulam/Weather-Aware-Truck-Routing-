import type { Checkpoint, PlannedRoute } from '../../api/types'
import { formatDateTime, formatMeasure, formatMiles } from '../../lib/format'
import { levelMeta, levelOnDark } from '../../lib/risk'

interface CheckpointDetailsProps {
  route: PlannedRoute
  checkpoint: Checkpoint
}

/** Popup body for one checkpoint. Level is always printed as text, not just colour. */
export function CheckpointDetails({ route, checkpoint: c }: CheckpointDetailsProps) {
  const level = levelMeta(c.level)
  const rows: [string, string][] = [
    ['ETA', formatDateTime(c.eta)],
    ['Wind / gust', `${formatMeasure(c.wind_mph, 'mph')} / ${formatMeasure(c.gust_mph, 'mph')}`],
    ['Rain', formatMeasure(c.rain_in_hr, 'in/hr', 2)],
    ['Snow', formatMeasure(c.snow_in_hr, 'in/hr', 2)],
    ['Temp', formatMeasure(c.temp_f, '°F')],
  ]
  return (
    <article className="min-w-52 text-text">
      <header className="flex items-baseline justify-between gap-3 pr-5">
        <h3 className="m-0 text-sm font-semibold">
          {route.name} <span className="tabular font-normal text-muted">mi {formatMiles(c.mile).replace(' mi', '')}</span>
        </h3>
      </header>
      <p
        className={`${level.bgClass} ${levelOnDark(c.level) ? 'text-white' : 'text-(--ink-900)'} m-0 mt-1.5 inline-block px-1.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase`}
      >
        {level.label}
      </p>
      <dl className="m-0 mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        {rows.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-muted">{term}</dt>
            <dd className="tabular m-0 text-right">{value}</dd>
          </div>
        ))}
      </dl>
      {c.level === null && (
        <p className="m-0 mt-2 text-xs text-muted">ETA is beyond the forecast horizon, so this stretch is unscored.</p>
      )}
      {c.reasons.length > 0 && (
        <ul className="m-0 mt-2 list-none border-t border-line p-0 pt-1.5 text-xs">
          {c.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
    </article>
  )
}
