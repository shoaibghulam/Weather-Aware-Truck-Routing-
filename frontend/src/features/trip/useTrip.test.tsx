import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonResponse, makePlan } from '../../test/fixtures'
import { useMediaQuery } from '../map/useMediaQuery'
import { useCorridorHeatmap, usePlanTrip } from './useTrip'

const fetchMock = vi.fn<typeof fetch>()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const heatmapBody = { hours: ['2026-11-07T14:00:00Z'], geojson: { type: 'FeatureCollection', features: [] } }

describe('useCorridorHeatmap', () => {
  it('stays idle without a plan', () => {
    const { result } = renderHook(() => useCorridorHeatmap(undefined), { wrapper: wrapper() })
    expect(result.current.status).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requests the corridor with the plan departure and load, then is ready', async () => {
    fetchMock.mockResolvedValue(jsonResponse(heatmapBody))
    const plan = makePlan()
    const { result } = renderHook(() => useCorridorHeatmap(plan), { wrapper: wrapper() })
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body).toEqual({ departure: plan.departure, load_lb: 36000, points: plan.corridor })
  })

  it('reports errors without throwing, and can retry', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: { code: 'WEATHER', message: 'Weather down' } }, 502))
    const { result } = renderHook(() => useCorridorHeatmap(makePlan()), { wrapper: wrapper() })
    // The hook retries once (1 s backoff) before reporting an error.
    await waitFor(() => expect(result.current.status).toBe('error'), { timeout: 4000 })
    expect(result.current.error).toBe('Weather down')
    fetchMock.mockResolvedValue(jsonResponse(heatmapBody))
    result.current.retry()
    await waitFor(() => expect(result.current.status).toBe('ready'))
  })
})

describe('usePlanTrip', () => {
  it('posts the plan request', async () => {
    fetchMock.mockResolvedValue(jsonResponse(makePlan()))
    const { result } = renderHook(() => usePlanTrip(), { wrapper: wrapper() })
    const plan = makePlan()
    result.current.mutate({
      origin: { label: 'a', lat: 1, lon: 1 },
      destination: { label: 'b', lat: 2, lon: 2 },
      departure: plan.departure,
      load_lb: 1,
      interval_mi: 10,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.routes).toHaveLength(3)
  })
})

describe('useMediaQuery', () => {
  it('is false when matchMedia is unavailable and follows it when present', () => {
    expect(renderHook(() => useMediaQuery('(x)')).result.current).toBe(false)
    const listeners: (() => void)[] = []
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: (_: string, cb: () => void) => listeners.push(cb),
      removeEventListener: vi.fn(),
    }))
    const { result, unmount } = renderHook(() => useMediaQuery('(prefers-color-scheme: dark)'))
    expect(result.current).toBe(true)
    expect(listeners).toHaveLength(1)
    unmount()
  })
})
