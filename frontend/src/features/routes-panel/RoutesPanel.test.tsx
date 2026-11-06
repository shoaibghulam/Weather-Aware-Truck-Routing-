import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import { makePlan, makeSummary } from '../../test/fixtures'
import { stageFor } from './PlanProgress'
import { RoutesPanel } from './RoutesPanel'
import { fastestDuration, levelSegments, routeBadges } from './routeStats'

function renderPanel(overrides: Partial<Parameters<typeof RoutesPanel>[0]> = {}) {
  const props = {
    plan: makePlan(),
    isLoading: false,
    error: null,
    selectedRouteId: 'r0',
    onSelect: vi.fn(),
    onHover: vi.fn(),
    ...overrides,
  }
  render(<RoutesPanel {...props} />)
  return props
}

describe('RoutesPanel', () => {
  afterEach(() => vi.useRealTimers())

  it('lists every route in rank order with its key numbers', () => {
    renderPanel()
    const cards = screen.getAllByRole('button', { pressed: undefined })
    expect(cards.map((c) => within(c).getByText(/^Route [ABC]$/).textContent)).toEqual(['Route A', 'Route B', 'Route C'])
    const routeB = cards[1] as HTMLElement
    expect(within(routeB).getByText('+31 m')).toBeInTheDocument()
    expect(within(routeB).getByText('Max: Severe')).toBeInTheDocument()
    expect(within(cards[2] as HTMLElement).getByText('Fastest')).toBeInTheDocument()
  })

  it('shows badges, the recommendation explanation and notices', () => {
    renderPanel()
    expect(screen.getByText('Recommended')).toBeInTheDocument()
    expect(screen.getByText('Via-point')).toBeInTheDocument()
    expect(screen.getByText('Has no-forecast miles')).toBeInTheDocument()
    expect(screen.getByText(/0 severe miles vs 42/)).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Notices' })).toHaveTextContent('via-point')
  })

  it('prints a max level of null as "No forecast", never Low', () => {
    renderPanel()
    expect(screen.getByText('Max: No forecast')).toBeInTheDocument()
  })

  it('marks the selected route and reports clicks and hover', async () => {
    const props = renderPanel()
    const routeB = screen.getByRole('button', { name: /Route B/ })
    expect(screen.getByRole('button', { name: /Route A/ })).toHaveAttribute('aria-pressed', 'true')
    expect(routeB).toHaveAttribute('aria-pressed', 'false')
    await userEvent.hover(routeB)
    expect(props.onHover).toHaveBeenCalledWith('r1')
    await userEvent.click(routeB)
    expect(props.onSelect).toHaveBeenCalledWith('r1')
    await userEvent.unhover(routeB)
    expect(props.onHover).toHaveBeenLastCalledWith(null)
  })

  it('shows the empty state before any plan', () => {
    renderPanel({ plan: undefined })
    expect(screen.getByRole('heading', { name: 'No trip planned yet' })).toBeInTheDocument()
  })

  it('shows API error messages to the user', () => {
    renderPanel({ plan: undefined, error: new ApiError('ROUTING_UNAVAILABLE', 'Routing provider timed out', 502) })
    expect(screen.getByRole('alert')).toHaveTextContent('Routing provider timed out')
  })

  it('explains an empty route list', () => {
    renderPanel({ plan: { ...makePlan(), routes: [] } })
    expect(screen.getByRole('alert')).toHaveTextContent('No routes were found')
  })

  it('shows staged progress while planning', () => {
    vi.useFakeTimers()
    renderPanel({ isLoading: true })
    expect(screen.getByRole('status')).toHaveTextContent('Finding truck routes')
    act(() => vi.advanceTimersByTime(6500))
    expect(screen.getByRole('status')).toHaveTextContent('Checking the forecast')
  })
})

describe('routeStats', () => {
  it('splits miles per level and drops empty levels', () => {
    const segs = levelSegments(makeSummary())
    expect(segs.map((s) => s.key)).toEqual(['LOW', 'MODERATE', 'HIGH'])
    expect(segs.reduce((t, s) => t + s.percent, 0)).toBeCloseTo(100)
  })

  it('returns nothing for a zero-length summary', () => {
    expect(levelSegments(makeSummary({ low_mi: 0, moderate_mi: 0, high_mi: 0 }))).toEqual([])
  })

  it('finds the fastest duration and badges', () => {
    const plan = makePlan()
    expect(fastestDuration(plan.routes)).toBe(5400)
    expect(routeBadges(plan.routes[1]!)).toEqual([])
  })

  it('maps elapsed time to a progress stage', () => {
    expect(stageFor(0)).toMatch(/Finding/)
    expect(stageFor(4)).toMatch(/checkpoints/)
    expect(stageFor(30)).toMatch(/ranking/)
  })
})
