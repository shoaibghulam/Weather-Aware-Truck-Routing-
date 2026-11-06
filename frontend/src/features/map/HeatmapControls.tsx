import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { addHours } from '../../lib/datetime'
import { formatDateTime } from '../../lib/format'
import { usePrefersReducedMotion } from './useMediaQuery'
import { HEATMAP_LAYER_ID, HEATMAP_MAX_HOUR, clampHour, displayHour, heatmapWeightExpression } from './heatmap'

/** The slice of the MapLibre map this component needs (keeps tests WebGL-free). */
export interface HeatmapMap {
  // Method syntax on purpose: parameter bivariance lets MapLibre's stricter overloads satisfy it.
  getLayer(id: string): unknown
  setPaintProperty(layer: string, name: string, value: unknown): unknown
  setLayoutProperty(layer: string, name: string, value: unknown): unknown
  once(type: string, listener: () => void): unknown
}

export interface HeatmapMapRef {
  current: { getMap: () => HeatmapMap } | null
}

export type HeatmapStatus = 'idle' | 'loading' | 'error' | 'ready'

interface HeatmapControlsProps {
  mapRef: HeatmapMapRef
  departure: string
  /** Absolute ISO time for each hour index, from the heatmap response. */
  hours: readonly string[] | undefined
  status: HeatmapStatus
  errorMessage?: string
  onRetry: () => void
}

const HOURS_PER_SECOND = 4
const REDUCED_MOTION_STEP_MS = 600

export function hourLabel(hour: number, departure: string, hours?: readonly string[]): string {
  const iso = hours?.[hour] ?? addHours(new Date(departure), hour).toISOString()
  return formatDateTime(iso)
}

/**
 * Scrubbing never touches React map state, the network or the source data:
 * every hour change is one `setPaintProperty('heatmap-weight', …)` on the GPU layer.
 */
export function HeatmapControls({ mapRef, departure, hours, status, errorMessage, onRetry }: HeatmapControlsProps) {
  const id = useId()
  const [hour, setHour] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isVisible, setIsVisible] = useState(true)
  const reducedMotion = usePrefersReducedMotion()
  const isReady = status === 'ready'

  const applyHour = useCallback(
    (value: number) => {
      const map = mapRef.current?.getMap()
      if (!map) return
      const paint = () => map.setPaintProperty(HEATMAP_LAYER_ID, 'heatmap-weight', heatmapWeightExpression(value))
      if (map.getLayer(HEATMAP_LAYER_ID)) paint()
      else map.once('idle', () => map.getLayer(HEATMAP_LAYER_ID) && paint())
    },
    [mapRef],
  )

  useEffect(() => {
    if (isReady && !isPlaying) applyHour(hour)
  }, [hour, isReady, isPlaying, applyHour])

  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (isReady && map?.getLayer(HEATMAP_LAYER_ID)) {
      map.setLayoutProperty(HEATMAP_LAYER_ID, 'visibility', isVisible ? 'visible' : 'none')
    }
  }, [isVisible, isReady, mapRef])

  usePlayback({ isPlaying: isPlaying && isReady && isVisible, hour, reducedMotion, applyHour, setHour })

  function onSliderKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === ' ' || event.key.toLowerCase() === 'k') {
      event.preventDefault()
      setIsPlaying((p) => !p)
    }
  }

  const label = hourLabel(hour, departure, hours)
  return (
    <section aria-label="Weather heatmap" className="pointer-events-auto border border-line-strong bg-overlay p-3 shadow-lg backdrop-blur-sm">
      <header className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-[11px] font-semibold tracking-widest text-muted uppercase">Corridor forecast</h2>
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <input type="checkbox" checked={isVisible} onChange={(e) => setIsVisible(e.target.checked)} className="size-4 accent-(--accent)" />
          Show heatmap
        </label>
      </header>
      <StatusLine status={status} errorMessage={errorMessage} onRetry={onRetry} />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setIsPlaying((p) => !p)}
          disabled={!isReady || !isVisible}
          aria-label={isPlaying ? 'Pause forecast playback' : 'Play forecast playback'}
          className="grid size-11 shrink-0 cursor-pointer place-items-center border border-line-strong bg-surface disabled:cursor-not-allowed disabled:opacity-40"
        >
          <PlayIcon isPlaying={isPlaying} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor={`${id}-slider`} className="tabular text-sm font-semibold">
              T+{String(hour).padStart(2, '0')} h
            </label>
            <output htmlFor={`${id}-slider`} className="tabular truncate text-xs text-muted">
              {label}
            </output>
          </div>
          <input
            id={`${id}-slider`}
            type="range"
            min={0}
            max={HEATMAP_MAX_HOUR}
            step={1}
            value={hour}
            disabled={!isReady}
            aria-valuetext={`${hour} hours after departure, ${label}`}
            aria-describedby={`${id}-help`}
            onChange={(e) => {
              setIsPlaying(false)
              setHour(clampHour(Number(e.target.value)))
            }}
            onKeyDown={onSliderKey}
            className="mt-1 h-6 w-full cursor-pointer accent-(--accent) disabled:cursor-not-allowed"
          />
          <p id={`${id}-help`} className="sr-only">
            Hours from departure, 0 to 48. Arrow keys step one hour; Space plays or pauses.
          </p>
        </div>
      </div>
    </section>
  )
}

interface PlaybackArgs {
  isPlaying: boolean
  hour: number
  reducedMotion: boolean
  applyHour: (value: number) => void
  setHour: (value: number) => void
}

/** rAF playback that blends between hours on the GPU; whole-hour steps under reduced motion. */
function usePlayback({ isPlaying, hour, reducedMotion, applyHour, setHour }: PlaybackArgs) {
  const startHour = useRef(hour)
  useEffect(() => {
    startHour.current = hour
  }, [hour])
  useEffect(() => {
    if (!isPlaying) return
    if (reducedMotion) {
      let current = startHour.current
      const timer = window.setInterval(() => {
        current = current >= HEATMAP_MAX_HOUR ? 0 : current + 1
        setHour(current)
        applyHour(current)
      }, REDUCED_MOTION_STEP_MS)
      return () => window.clearInterval(timer)
    }
    let frame = 0
    let position = startHour.current
    let last = performance.now()
    const tick = (now: number) => {
      position += ((now - last) / 1000) * HOURS_PER_SECOND
      last = now
      if (position > HEATMAP_MAX_HOUR) position = 0
      applyHour(position)
      if (displayHour(position) !== startHour.current) setHour(displayHour(position))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // startHour is a ref: playback must not restart every time the label hour ticks.
  }, [isPlaying, reducedMotion, applyHour, setHour])
}

function StatusLine({ status, errorMessage, onRetry }: Pick<HeatmapControlsProps, 'status' | 'errorMessage' | 'onRetry'>) {
  if (status === 'loading') {
    return (
      <p role="status" className="m-0 mt-1 text-xs text-muted">
        <span aria-hidden="true" className="skeleton mr-1.5 inline-block size-2 align-middle" />
        Loading 48-hour corridor forecast…
      </p>
    )
  }
  if (status === 'error') {
    return (
      <p role="alert" className="m-0 mt-1 text-xs text-danger">
        Heatmap unavailable: {errorMessage}{' '}
        <button type="button" onClick={onRetry} className="cursor-pointer text-text underline underline-offset-2">
          Retry
        </button>
      </p>
    )
  }
  if (status === 'idle') return <p className="m-0 mt-1 text-xs text-muted">Plan a trip to load the corridor forecast.</p>
  return null
}

function PlayIcon({ isPlaying }: { isPlaying: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 fill-current">
      {isPlaying ? <path d="M3 2h4v12H3zM9 2h4v12H9z" /> : <path d="M4 2l10 6-10 6z" />}
    </svg>
  )
}
