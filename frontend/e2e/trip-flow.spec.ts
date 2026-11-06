import { expect, test, type Page } from '@playwright/test'
import { makePlan } from '../src/test/fixtures'

const PLACES: Record<string, { label: string; lat: number; lon: number }> = {
  dallas: { label: 'Dallas, TX', lat: 32.78, lon: -96.8 },
  denver: { label: 'Denver, CO', lat: 39.74, lon: -104.99 },
}

function heatmapResponse() {
  const hours = Array.from({ length: 49 }, (_, h) => new Date(Date.UTC(2026, 10, 7, 14 + h)).toISOString())
  const feature = (lon: number, lat: number, base: number) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: Object.fromEntries(hours.map((_, h) => [`h${h}`, (base + h / 24) % 4])),
  })
  return { hours, geojson: { type: 'FeatureCollection', features: [feature(-97, 32, 0.4), feature(-98, 34, 2.1)] } }
}

async function mockApi(page: Page, plan = makePlan()) {
  const calls = { plan: 0, heatmap: 0, planBody: null as unknown }
  await page.route('**/api/geocode?**', async (route) => {
    const q = new URL(route.request().url()).searchParams.get('q')?.toLowerCase() ?? ''
    const hit = Object.entries(PLACES).find(([key]) => q.includes(key))
    await route.fulfill({ json: { results: hit ? [hit[1]] : [] } })
  })
  await page.route('**/api/trips/plan', async (route) => {
    calls.plan += 1
    calls.planBody = route.request().postDataJSON()
    await route.fulfill({ json: plan })
  })
  await page.route('**/api/trips/heatmap', async (route) => {
    calls.heatmap += 1
    await route.fulfill({ json: heatmapResponse() })
  })
  return calls
}

async function pickPlace(page: Page, name: 'Origin' | 'Destination', text: string) {
  await page.getByRole('combobox', { name }).fill(text)
  await page.getByRole('option').first().click()
}

test('plans a trip, ranks three routes and scrubs the heatmap without refetching', async ({ page }) => {
  const calls = await mockApi(page)
  await page.goto('./')

  await pickPlace(page, 'Origin', 'Dallas')
  await pickPlace(page, 'Destination', 'Denver')
  await page.getByLabel(/Load/).fill('36000')
  await page.getByRole('button', { name: /Plan routes/ }).click()

  await expect(page.getByText('Route A has 0 severe miles vs 42 on Route B.')).toBeVisible()
  for (const name of ['Route A', 'Route B', 'Route C']) {
    await expect(page.getByRole('heading', { name }).or(page.getByText(name, { exact: true })).first()).toBeVisible()
  }
  await expect(page.getByText('Via-point').first()).toBeVisible()
  expect(calls.planBody).toMatchObject({ load_lb: 36000, interval_mi: 25, origin: { label: 'Dallas, TX' } })

  const slider = page.getByRole('slider')
  await expect(slider).toBeEnabled()
  await slider.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByText('T+03 h')).toBeVisible()
  await page.keyboard.press('End')
  await expect(page.getByText('T+48 h')).toBeVisible()
  expect(calls.heatmap).toBe(1) // scrubbing never refetches
})

test('blocks an out-of-range load before calling the API', async ({ page }) => {
  const calls = await mockApi(page)
  await page.goto('./')

  await pickPlace(page, 'Origin', 'Dallas')
  await pickPlace(page, 'Destination', 'Denver')
  await page.getByLabel(/Load/).fill('90000')
  await page.getByRole('button', { name: /Plan routes/ }).click()

  await expect(page.getByText(/80,000/).first()).toBeVisible()
  expect(calls.plan).toBe(0)
})

test('shows the API error message when planning fails', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/trips/plan', (route) =>
    route.fulfill({
      status: 422,
      json: { error: { code: 'NO_ROUTE', message: 'No truck route was found between these locations.' } },
    }),
  )
  await page.goto('./')

  await pickPlace(page, 'Origin', 'Dallas')
  await pickPlace(page, 'Destination', 'Denver')
  await page.getByRole('button', { name: /Plan routes/ }).click()

  await expect(page.getByText('No truck route was found between these locations.')).toBeVisible()
})
