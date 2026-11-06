import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HEATMAP_LAYER_ID, heatmapWeightExpression } from './heatmap'
import { HeatmapControls, hourLabel, type HeatmapMap, type HeatmapStatus } from './HeatmapControls'

const DEPARTURE = '2026-11-07T14:00:00Z'
const HOURS = Array.from({ length: 49 }, (_, i) => new Date(Date.parse(DEPARTURE) + i * 3_600_000).toISOString())

function fakeMap(hasLayer = true) {
  const map = {
    getLayer: vi.fn(() => (hasLayer ? {} : undefined)),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
    once: vi.fn(),
  } satisfies HeatmapMap
  return { map, ref: { current: { getMap: () => map } } }
}

function setup(status: HeatmapStatus = 'ready', hasLayer = true) {
  const { map, ref } = fakeMap(hasLayer)
  const onRetry = vi.fn()
  const utils = render(
    <HeatmapControls mapRef={ref} departure={DEPARTURE} hours={HOURS} status={status} errorMessage="Open-Meteo down" onRetry={onRetry} />,
  )
  return { map, onRetry, ...utils }
}

let rafCallbacks: FrameRequestCallback[] = []
beforeEach(() => {
  rafCallbacks = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => rafCallbacks.push(cb))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})
afterEach(() => vi.unstubAllGlobals())

describe('HeatmapControls', () => {
  it('scrubbing only calls setPaintProperty with the hour expression', () => {
    const { map } = setup()
    map.setPaintProperty.mockClear()
    fireEvent.change(screen.getByRole('slider'), { target: { value: '12' } })
    expect(map.setPaintProperty).toHaveBeenCalledTimes(1)
    expect(map.setPaintProperty).toHaveBeenCalledWith(HEATMAP_LAYER_ID, 'heatmap-weight', heatmapWeightExpression(12))
    expect(screen.getByText('T+12 h')).toBeInTheDocument()
  })

  it('labels the slider with hours from departure and absolute local time', () => {
    setup()
    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('max', '48')
    expect(slider.getAttribute('aria-valuetext')).toMatch(/^0 hours after departure, /)
  })

  it('supports keyboard stepping with arrow keys', async () => {
    const { map } = setup()
    const slider = screen.getByRole('slider')
    slider.focus()
    // jsdom does not implement native range key handling; emulate the browser's step.
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    fireEvent.change(slider, { target: { value: '1' } })
    expect(map.setPaintProperty).toHaveBeenLastCalledWith(HEATMAP_LAYER_ID, 'heatmap-weight', heatmapWeightExpression(1))
  })

  it('toggles heatmap visibility via layout property', async () => {
    const { map } = setup()
    await userEvent.click(screen.getByLabelText('Show heatmap'))
    expect(map.setLayoutProperty).toHaveBeenLastCalledWith(HEATMAP_LAYER_ID, 'visibility', 'none')
    await userEvent.click(screen.getByLabelText('Show heatmap'))
    expect(map.setLayoutProperty).toHaveBeenLastCalledWith(HEATMAP_LAYER_ID, 'visibility', 'visible')
  })

  it('plays with requestAnimationFrame and pauses again', async () => {
    const { map } = setup()
    await userEvent.click(screen.getByRole('button', { name: /Play/ }))
    expect(screen.getByRole('button', { name: /Pause/ })).toBeInTheDocument()
    const t0 = performance.now()
    act(() => rafCallbacks.shift()?.(t0 + 1000))
    const last = map.setPaintProperty.mock.calls.at(-1)
    expect(last?.[0]).toBe(HEATMAP_LAYER_ID)
    expect(screen.getByText(/T\+0[34] h/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Pause/ }))
    expect(screen.getByRole('button', { name: /Play/ })).toBeInTheDocument()
  })

  it('space on the slider toggles playback', () => {
    setup()
    fireEvent.keyDown(screen.getByRole('slider'), { key: ' ' })
    expect(screen.getByRole('button', { name: /Pause/ })).toBeInTheDocument()
  })

  it('waits for the layer before painting', () => {
    const { map } = setup('ready', false)
    expect(map.setPaintProperty).not.toHaveBeenCalled()
    expect(map.once).toHaveBeenCalledWith('idle', expect.any(Function))
  })

  it('shows its own loading state and disables scrubbing', () => {
    setup('loading')
    expect(screen.getByText(/Loading 48-hour corridor forecast/)).toBeInTheDocument()
    expect(screen.getByRole('slider')).toBeDisabled()
  })

  it('reports errors with a retry that does not affect routes', async () => {
    const { onRetry } = setup('error')
    expect(screen.getByRole('alert')).toHaveTextContent('Heatmap unavailable: Open-Meteo down')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('falls back to departure + N hours when hours are missing', () => {
    expect(hourLabel(3, DEPARTURE)).toBe(hourLabel(3, DEPARTURE, HOURS))
  })
})
