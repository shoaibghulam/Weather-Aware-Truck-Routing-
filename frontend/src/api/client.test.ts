import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonResponse, makePlan } from '../test/fixtures'
import { ApiError, errorMessage, fetchHeatmap, geocode, planTrip } from './client'
import type { PlanRequest } from './types'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const request: PlanRequest = {
  origin: { label: 'Dallas, TX', lat: 32.77, lon: -96.79 },
  destination: { label: 'Denver, CO', lat: 39.74, lon: -104.99 },
  departure: '2026-11-07T08:00:00-06:00',
  load_lb: 36000,
  interval_mi: 25,
}

describe('geocode', () => {
  it('GETs /api/geocode with an encoded query', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ results: [{ label: 'Dallas, TX', lat: 1, lon: 2 }] }))
    const out = await geocode('Dallas & Co')
    expect(out.results).toHaveLength(1)
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('/api/geocode?q=Dallas+%26+Co')
    expect((init?.headers as Record<string, string>)['Content-Type']).toBeUndefined()
  })
})

describe('planTrip', () => {
  it('POSTs the JSON body and returns the plan', async () => {
    fetchMock.mockResolvedValue(jsonResponse(makePlan()))
    const plan = await planTrip(request)
    expect(plan.routes).toHaveLength(3)
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('/api/trips/plan')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual(request)
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('surfaces the error envelope message and code', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: 'ROUTING_UNAVAILABLE', message: 'TomTom is down' } }, 502))
    const err = await planTrip(request).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ code: 'ROUTING_UNAVAILABLE', status: 502, message: 'TomTom is down' })
  })

  it('handles 429 throttling via the envelope', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: 'THROTTLED', message: 'Slow down' } }, 429))
    await expect(planTrip(request)).rejects.toMatchObject({ status: 429, message: 'Slow down' })
  })

  it('falls back to a generic message for non-envelope errors', async () => {
    fetchMock.mockResolvedValue(new Response('<html>oops</html>', { status: 500 }))
    await expect(planTrip(request)).rejects.toMatchObject({ code: 'HTTP_500', status: 500 })
  })

  it('rejects a 200 with a non-JSON body', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 200 }))
    await expect(planTrip(request)).rejects.toMatchObject({ code: 'BAD_RESPONSE' })
  })

  it('maps network failures to a NETWORK error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(planTrip(request)).rejects.toMatchObject({ code: 'NETWORK', status: 0 })
  })
})

describe('fetchHeatmap', () => {
  it('POSTs departure, load and points and passes the abort signal', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ hours: [], geojson: { type: 'FeatureCollection', features: [] } }))
    const controller = new AbortController()
    const body = { departure: request.departure, load_lb: 36000, points: [[-97, 32]] as [number, number][] }
    await fetchHeatmap(body, controller.signal)
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('/api/trips/heatmap')
    expect(JSON.parse(String(init?.body))).toEqual(body)
    expect(init?.signal).toBe(controller.signal)
  })

  it('rethrows aborts untouched so TanStack Query can cancel', async () => {
    fetchMock.mockRejectedValue(new DOMException('aborted', 'AbortError'))
    await expect(fetchHeatmap({ departure: 'x', load_lb: 1, points: [] })).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('errorMessage', () => {
  it('prefers ApiError and Error messages, then a generic fallback', () => {
    expect(errorMessage(new ApiError('X', 'api says no', 400))).toBe('api says no')
    expect(errorMessage(new Error('plain'))).toBe('plain')
    expect(errorMessage('weird')).toMatch(/unexpected/)
  })
})
