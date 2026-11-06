import { useMutation, useQuery } from '@tanstack/react-query'
import { errorMessage, fetchHeatmap, planTrip } from '../../api/client'
import type { PlanRequest, PlanResponse } from '../../api/types'
import { capPoints } from '../map/heatmap'
import type { HeatmapStatus } from '../map/HeatmapControls'

/** Plan request (one shot, user-triggered). */
export function usePlanTrip() {
  return useMutation({ mutationFn: (request: PlanRequest) => planTrip(request) })
}

/**
 * Second, progressive request: the corridor heatmap loads after routes render.
 * Its failure never affects the routes.
 */
export function useCorridorHeatmap(plan: PlanResponse | undefined) {
  const query = useQuery({
    queryKey: ['heatmap', plan?.departure, plan?.load_lb, plan?.corridor],
    queryFn: ({ signal }) => {
      if (!plan) throw new Error('No plan')
      return fetchHeatmap({ departure: plan.departure, load_lb: plan.load_lb, points: capPoints(plan.corridor) }, signal)
    },
    enabled: Boolean(plan && plan.corridor.length > 0),
    staleTime: 10 * 60_000,
    retry: 1,
  })
  let status: HeatmapStatus = 'idle'
  if (plan && query.isPending && query.fetchStatus !== 'idle') status = 'loading'
  else if (query.isError) status = 'error'
  else if (query.data) status = 'ready'
  return {
    data: query.data,
    status,
    error: query.isError ? errorMessage(query.error) : undefined,
    retry: () => void query.refetch(),
  }
}
