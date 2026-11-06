import { useQuery } from '@tanstack/react-query'
import { geocode } from '../../api/client'
import type { Place } from '../../api/types'
import { useDebouncedValue } from './useDebouncedValue'

export const GEOCODE_MIN_CHARS = 3
export const GEOCODE_DEBOUNCE_MS = 300

/** Debounced suggestions; disabled below 3 chars or when the text is a committed choice. */
export function useGeocode(text: string, enabled: boolean) {
  const debounced = useDebouncedValue(text.trim(), GEOCODE_DEBOUNCE_MS)
  const active = enabled && debounced.length >= GEOCODE_MIN_CHARS
  const query = useQuery({
    queryKey: ['geocode', debounced],
    queryFn: ({ signal }) => geocode(debounced, signal),
    enabled: active,
    staleTime: 5 * 60_000,
    retry: false,
  })
  const results: Place[] = active ? (query.data?.results ?? []) : []
  return {
    results,
    isFetching: active && query.isFetching,
    error: active ? query.error : null,
    /** True while the user is still typing (debounce pending). */
    isPending: enabled && text.trim() !== debounced,
    active,
  }
}
