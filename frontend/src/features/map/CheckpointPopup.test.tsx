import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeCheckpoint, makeRoute } from '../../test/fixtures'
import { CheckpointDetails } from './CheckpointPopup'
import { RiskLegend } from './RiskLegend'

describe('CheckpointDetails', () => {
  it('shows mile, level label, weather values and reasons', () => {
    render(<CheckpointDetails route={makeRoute()} checkpoint={makeCheckpoint({ mile: 125.4 })} />)
    expect(screen.getByRole('heading')).toHaveTextContent('Route A mi 125')
    expect(screen.getByText('Moderate')).toBeInTheDocument()
    expect(screen.getByText('27 mph / 40 mph')).toBeInTheDocument()
    expect(screen.getByText('0.12 in/hr')).toBeInTheDocument()
    expect(screen.getByText('41 °F')).toBeInTheDocument()
    expect(screen.getByText('Wind 27 mph (Moderate)')).toBeInTheDocument()
  })

  it('labels a null level "No forecast" and explains why', () => {
    render(
      <CheckpointDetails
        route={makeRoute()}
        checkpoint={makeCheckpoint({ level: null, wind_mph: null, gust_mph: null, reasons: [] })}
      />,
    )
    expect(screen.getByText('No forecast')).toBeInTheDocument()
    expect(screen.getByText(/beyond the forecast horizon/)).toBeInTheDocument()
    expect(screen.getByText('— / —')).toBeInTheDocument()
  })
})

describe('RiskLegend', () => {
  it('lists all six levels as text', () => {
    render(<RiskLegend />)
    for (const label of ['Low', 'Moderate', 'High', 'Severe', 'No Travel', 'No forecast']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })
})
