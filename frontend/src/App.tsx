import { useState } from 'react'
import type { PlanRequest } from './api/types'
import { RouteMap } from './features/map/RouteMap'
import { RiskLegend } from './features/map/RiskLegend'
import { RoutesPanel } from './features/routes-panel/RoutesPanel'
import { TripForm } from './features/trip-form/TripForm'
import { useCorridorHeatmap, usePlanTrip } from './features/trip/useTrip'
import { formatDateTime } from './lib/format'

export function App() {
  const planMutation = usePlanTrip()
  const plan = planMutation.data
  const heatmap = useCorridorHeatmap(plan)
  const [lastRequest, setLastRequest] = useState<PlanRequest | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Fall back to the recommended route whenever the selection is not in the current plan.
  const selectedRouteId =
    plan?.routes.some((r) => r.id === selectedId) ? selectedId : (plan?.recommendation.route_id ?? null)

  function handleSubmit(request: PlanRequest) {
    setLastRequest(request)
    setSelectedId(null)
    setHoveredId(null)
    planMutation.mutate(request)
  }

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <TopBar request={lastRequest} />
      <main className="flex flex-1 flex-col lg:grid lg:min-h-0 lg:grid-cols-[minmax(360px,420px)_1fr]">
        <div
          className="contents border-line bg-bg lg:flex lg:min-h-0 lg:flex-col lg:overflow-y-auto lg:border-r"
        >
          <section aria-labelledby="form-heading" className="order-1 border-b border-line bg-surface px-4 pt-4 pb-5 sm:px-5">
            <h2 id="form-heading" className="m-0 mb-3 text-xs font-semibold tracking-widest text-muted uppercase">
              New dispatch
            </h2>
            <TripForm onSubmit={handleSubmit} isSubmitting={planMutation.isPending} />
          </section>
          <div className="order-3 px-4 py-4 sm:px-5">
            <RoutesPanel
              plan={plan}
              isLoading={planMutation.isPending}
              error={planMutation.error}
              selectedRouteId={selectedRouteId}
              onSelect={setSelectedId}
              onHover={setHoveredId}
            />
            <div className="mt-4 sm:hidden">
              <RiskLegend />
            </div>
          </div>
        </div>
        <section aria-label="Route map" className="relative order-2 h-[62svh] min-h-[420px] lg:h-auto lg:min-h-0">
          <RouteMap
            plan={plan}
            heatmap={heatmap.data}
            heatmapStatus={heatmap.status}
            heatmapError={heatmap.error}
            onRetryHeatmap={heatmap.retry}
            selectedRouteId={selectedRouteId}
            hoveredRouteId={hoveredId}
            onSelectRoute={setSelectedId}
            onHoverRoute={setHoveredId}
          />
        </section>
      </main>
    </div>
  )
}

function TopBar({ request }: { request: PlanRequest | null }) {
  return (
    <header className="flex min-h-12 flex-wrap items-center justify-between gap-x-6 gap-y-1 bg-(--ink-900) px-4 py-2 text-(--ink-100) sm:px-5">
      <h1 className="m-0 flex items-baseline gap-2 text-base font-bold tracking-tight">
        <span aria-hidden="true" className="inline-block size-2.5 bg-signal" />
        Routewatch
        <span className="hidden text-xs font-normal text-(--ink-300) sm:inline">weather-aware truck dispatch</span>
      </h1>
      {request && (
        <p className="tabular m-0 truncate text-xs text-(--ink-300)">
          <span className="text-(--ink-100)">{request.origin.label}</span> → <span className="text-(--ink-100)">{request.destination.label}</span>
          <span className="mx-2 text-(--ink-500)">|</span>
          dep {formatDateTime(request.departure)}
        </p>
      )}
    </header>
  )
}
