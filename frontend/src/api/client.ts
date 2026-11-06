import type {
  ApiErrorBody,
  GeocodeResponse,
  HeatmapRequest,
  HeatmapResponse,
  PlanRequest,
  PlanResponse,
} from './types'

const API_ROOT = '/api'
const GENERIC_MESSAGE = 'The server returned an unexpected response. Please try again.'

/** Any failure talking to the backend, normalised to the API's error envelope. */
export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

function isErrorBody(body: unknown): body is ApiErrorBody {
  if (typeof body !== 'object' || body === null || !('error' in body)) return false
  const err = (body as { error: unknown }).error
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { message?: unknown }).message === 'string' &&
    typeof (err as { code?: unknown }).code === 'string'
  )
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new ApiError('NETWORK', 'Could not reach the server. Check your connection and try again.', 0)
  }

  const body = await readJson(response)
  if (!response.ok) {
    if (isErrorBody(body)) throw new ApiError(body.error.code, body.error.message, response.status)
    throw new ApiError('HTTP_' + response.status, GENERIC_MESSAGE, response.status)
  }
  if (body === undefined) throw new ApiError('BAD_RESPONSE', GENERIC_MESSAGE, response.status)
  return body as T
}

export function geocode(query: string, signal?: AbortSignal): Promise<GeocodeResponse> {
  const params = new URLSearchParams({ q: query })
  return request<GeocodeResponse>(`/geocode?${params.toString()}`, { signal })
}

export function planTrip(body: PlanRequest): Promise<PlanResponse> {
  return request<PlanResponse>('/trips/plan', { method: 'POST', body: JSON.stringify(body) })
}

export function fetchHeatmap(body: HeatmapRequest, signal?: AbortSignal): Promise<HeatmapResponse> {
  return request<HeatmapResponse>('/trips/heatmap', {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  })
}

/** User-facing message for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return GENERIC_MESSAGE
}
