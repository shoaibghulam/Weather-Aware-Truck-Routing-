import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonResponse } from '../../test/fixtures'
import { TripForm } from './TripForm'

const fetchMock = vi.fn<typeof fetch>()
const PLACES: Record<string, { label: string; lat: number; lon: number }[]> = {
  dal: [
    { label: 'Dallas, TX', lat: 32.77, lon: -96.79 },
    { label: 'Dalhart, TX', lat: 36.06, lon: -102.51 },
  ],
  den: [{ label: 'Denver, CO', lat: 39.74, lon: -104.99 }],
}

beforeEach(() => {
  fetchMock.mockImplementation(async (input) => {
    const q = new URL(String(input), 'http://x').searchParams.get('q') ?? ''
    return jsonResponse({ results: PLACES[q.slice(0, 3).toLowerCase()] ?? [] })
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

function renderForm() {
  const onSubmit = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <TripForm onSubmit={onSubmit} isSubmitting={false} />
    </QueryClientProvider>,
  )
  return { onSubmit }
}

describe('TripForm', () => {
  it('defaults departure to a future full hour and interval to 25 mi', () => {
    renderForm()
    expect((screen.getByLabelText(/Departure/) as HTMLInputElement).value).toMatch(/T\d{2}:00$/)
    expect(screen.getByLabelText('25 mi')).toBeChecked()
  })

  it('shows field errors instead of submitting invalid input', async () => {
    const { onSubmit } = renderForm()
    await userEvent.clear(screen.getByLabelText(/Load/))
    await userEvent.type(screen.getByLabelText(/Load/), '90000')
    await userEvent.click(screen.getByRole('button', { name: /Plan routes/ }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText(/Choose an origin/)).toBeInTheDocument()
    expect(screen.getByText(/between 1 and 80,000/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Load/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('does not query the geocoder under 3 characters', async () => {
    renderForm()
    await userEvent.type(screen.getByRole('combobox', { name: 'Origin' }), 'Da')
    await new Promise((r) => setTimeout(r, 400))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('picks places with the keyboard and submits a valid request', async () => {
    const { onSubmit } = renderForm()
    const origin = screen.getByRole('combobox', { name: 'Origin' })
    await userEvent.type(origin, 'Dal')
    await screen.findByRole('option', { name: 'Dalhart, TX' })
    expect(origin).toHaveAttribute('aria-expanded', 'true')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}')
    expect(origin.getAttribute('aria-activedescendant')).toMatch(/opt-0$/)
    await userEvent.keyboard('{Enter}')
    expect(origin).toHaveValue('Dallas, TX')
    expect(origin).toHaveAttribute('aria-expanded', 'false')

    const destination = screen.getByRole('combobox', { name: 'Destination' })
    await userEvent.type(destination, 'Den')
    await userEvent.click(await screen.findByRole('option', { name: 'Denver, CO' }))
    expect(destination).toHaveValue('Denver, CO')

    await userEvent.click(screen.getByLabelText('50 mi'))
    await userEvent.click(screen.getByRole('button', { name: /Plan routes/ }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      origin: { label: 'Dallas, TX' },
      destination: { label: 'Denver, CO' },
      load_lb: 36000,
      interval_mi: 50,
    })
    expect(fetchMock.mock.calls.every(([url]) => String(url).startsWith('/api/geocode?q='))).toBe(true)
  })

  it('tells the user when nothing matches and closes on Escape', async () => {
    renderForm()
    const origin = screen.getByRole('combobox', { name: 'Origin' })
    await userEvent.type(origin, 'Zzzz')
    expect(await screen.findByText(/No matches/)).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(origin).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows geocoder errors from the API envelope', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: 'GEOCODER_DOWN', message: 'Geocoder unavailable' } }, 502))
    renderForm()
    await userEvent.type(screen.getByRole('combobox', { name: 'Origin' }), 'Dallas')
    expect(await screen.findByText('Geocoder unavailable')).toBeInTheDocument()
  })
})
