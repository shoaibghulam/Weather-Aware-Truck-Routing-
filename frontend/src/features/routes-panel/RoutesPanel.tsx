import { errorMessage } from '../../api/client'
import type { PlanResponse } from '../../api/types'
import { formatPounds } from '../../lib/format'
import { PlanProgress } from './PlanProgress'
import { RouteCard } from './RouteCard'
import { fastestDuration } from './routeStats'

interface RoutesPanelProps {
  plan: PlanResponse | undefined
  isLoading: boolean
  error: unknown
  selectedRouteId: string | null
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
}

export function RoutesPanel({ plan, isLoading, error, selectedRouteId, onSelect, onHover }: RoutesPanelProps) {
  if (isLoading) return <PlanProgress />
  if (error) return <ErrorState message={errorMessage(error)} />
  if (!plan) return <EmptyState />
  if (plan.routes.length === 0) {
    return <ErrorState message="No routes were found between these places." notices={plan.notices} />
  }

  const fastest = fastestDuration(plan.routes)
  return (
    <section aria-labelledby="routes-heading" className="grid gap-3">
      <header className="flex items-baseline justify-between gap-2">
        <h2 id="routes-heading" className="text-xs font-semibold tracking-widest text-muted uppercase">
          {plan.routes.length} route{plan.routes.length === 1 ? '' : 's'} · ranked by risk
        </h2>
        <span className="tabular text-xs text-muted">
          {formatPounds(plan.load_lb)} · {plan.interval_mi} mi
        </span>
      </header>

      <aside aria-label="Recommendation" className="border-l-4 border-accent bg-surface-2 px-3 py-2.5 text-sm">
        <p className="m-0 text-[10px] font-semibold tracking-widest text-accent uppercase">Why this route</p>
        <p className="m-0 mt-0.5">{plan.recommendation.explanation}</p>
      </aside>

      {plan.notices.length > 0 && <Notices notices={plan.notices} />}

      <ol className="m-0 grid list-none gap-2 p-0">
        {plan.routes.map((route) => (
          <RouteCard
            key={route.id}
            route={route}
            fastestS={fastest}
            isSelected={route.id === selectedRouteId}
            onSelect={onSelect}
            onHover={onHover}
          />
        ))}
      </ol>
    </section>
  )
}

function Notices({ notices }: { notices: string[] }) {
  return (
    <ul role="status" aria-label="Notices" className="m-0 grid list-none gap-1 border border-dashed border-line-strong p-2.5 text-xs">
      {notices.map((notice) => (
        <li key={notice} className="flex gap-2">
          <span aria-hidden="true" className="tabular text-signal">
            !
          </span>
          {notice}
        </li>
      ))}
    </ul>
  )
}

function EmptyState() {
  return (
    <section className="border border-dashed border-line-strong p-4 text-sm text-muted">
      <h2 className="m-0 text-base font-semibold text-text">No trip planned yet</h2>
      <p className="m-0 mt-1">
        Enter an origin, a destination and a departure time. You&apos;ll get up to three truck routes, scored by the
        forecast at the moment the truck reaches each checkpoint.
      </p>
    </section>
  )
}

function ErrorState({ message, notices = [] }: { message: string; notices?: string[] }) {
  return (
    <section role="alert" className="border border-danger bg-surface p-4 text-sm">
      <h2 className="m-0 text-base font-semibold text-danger">Couldn&apos;t plan this trip</h2>
      <p className="m-0 mt-1">{message}</p>
      {notices.length > 0 && <Notices notices={notices} />}
    </section>
  )
}
