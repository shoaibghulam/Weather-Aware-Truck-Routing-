import type { IntervalMi, Place, PlanRequest } from '../../api/types'
import { hoursBetween, parseLocalInput, toIsoWithOffset } from '../../lib/datetime'

export const LOAD_MIN_LB = 1
export const LOAD_MAX_LB = 80_000
export const INTERVALS: readonly IntervalMi[] = [10, 25, 50]
export const DEFAULT_INTERVAL: IntervalMi = 25
/** Mirrors backend A12: no more than 1 h in the past, at most 14 days ahead. */
export const MAX_PAST_HOURS = 1
export const MAX_AHEAD_HOURS = 14 * 24

export interface TripFormValues {
  origin: Place | null
  destination: Place | null
  /** datetime-local string, browser zone. */
  departure: string
  /** Raw text from the number input so partial edits are kept. */
  load: string
  interval: IntervalMi
}

export type FieldName = 'origin' | 'destination' | 'departure' | 'load' | 'interval'
export type FieldErrors = Partial<Record<FieldName, string>>

export type ValidationResult =
  | { ok: true; request: PlanRequest }
  | { ok: false; errors: FieldErrors }

function validatePlaces(values: TripFormValues): FieldErrors {
  const errors: FieldErrors = {}
  if (!values.origin) errors.origin = 'Choose an origin from the suggestions.'
  if (!values.destination) errors.destination = 'Choose a destination from the suggestions.'
  if (values.origin && values.destination) {
    const same =
      Math.abs(values.origin.lat - values.destination.lat) < 1e-6 &&
      Math.abs(values.origin.lon - values.destination.lon) < 1e-6
    if (same) errors.destination = 'Destination must differ from the origin.'
  }
  return errors
}

export function validateDeparture(value: string, now: Date): string | undefined {
  const date = parseLocalInput(value)
  if (!date) return 'Enter a valid departure date and time.'
  const offset = hoursBetween(now, date)
  if (offset < -MAX_PAST_HOURS) return 'Departure cannot be more than 1 hour in the past.'
  if (offset > MAX_AHEAD_HOURS) return 'Departure must be within the next 14 days (forecast horizon).'
  return undefined
}

export function validateLoad(value: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return 'Enter the load weight in pounds.'
  if (!/^\d+$/.test(trimmed)) return 'Load must be a whole number of pounds.'
  const load = Number(trimmed)
  if (load < LOAD_MIN_LB || load > LOAD_MAX_LB) {
    return `Load must be between ${LOAD_MIN_LB} and ${LOAD_MAX_LB.toLocaleString('en-US')} lb.`
  }
  return undefined
}

export function validateTrip(values: TripFormValues, now: Date = new Date()): ValidationResult {
  const errors: FieldErrors = { ...validatePlaces(values) }
  const departureError = validateDeparture(values.departure, now)
  if (departureError) errors.departure = departureError
  const loadError = validateLoad(values.load)
  if (loadError) errors.load = loadError
  if (!INTERVALS.includes(values.interval)) errors.interval = 'Pick 10, 25 or 50 miles.'

  const departure = parseLocalInput(values.departure)
  if (Object.keys(errors).length > 0 || !values.origin || !values.destination || !departure) {
    return { ok: false, errors }
  }
  return {
    ok: true,
    request: {
      origin: values.origin,
      destination: values.destination,
      departure: toIsoWithOffset(departure),
      load_lb: Number(values.load.trim()),
      interval_mi: values.interval,
    },
  }
}
