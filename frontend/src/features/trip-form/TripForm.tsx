import { useState, type FormEvent } from 'react'
import type { IntervalMi, PlanRequest } from '../../api/types'
import { nextFullHour, toLocalInputValue } from '../../lib/datetime'
import { PlaceCombobox } from './PlaceCombobox'
import {
  DEFAULT_INTERVAL,
  INTERVALS,
  LOAD_MAX_LB,
  LOAD_MIN_LB,
  validateTrip,
  type FieldErrors,
  type TripFormValues,
} from './validation'

interface TripFormProps {
  onSubmit: (request: PlanRequest) => void
  isSubmitting: boolean
}

const DEFAULT_LOAD = '36000'
const labelClass = 'mb-1 block text-xs font-semibold tracking-wider text-muted uppercase'
const fieldClass =
  'tabular min-h-11 w-full border border-line-strong bg-surface px-3 text-[15px] outline-none focus:border-accent aria-[invalid=true]:border-danger'

function initialValues(): TripFormValues {
  return {
    origin: null,
    destination: null,
    departure: toLocalInputValue(nextFullHour()),
    load: DEFAULT_LOAD,
    interval: DEFAULT_INTERVAL,
  }
}

export function TripForm({ onSubmit, isSubmitting }: TripFormProps) {
  const [values, setValues] = useState<TripFormValues>(initialValues)
  const [errors, setErrors] = useState<FieldErrors>({})

  function update<K extends keyof TripFormValues>(key: K, value: TripFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = validateTrip(values)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    onSubmit(result.request)
  }

  return (
    <form noValidate onSubmit={handleSubmit} aria-label="Plan a trip" className="grid gap-4">
      <div className="grid gap-3">
        <PlaceCombobox label="Origin" marker="A" value={values.origin} onChange={(p) => update('origin', p)} error={errors.origin} />
        <PlaceCombobox
          label="Destination"
          marker="B"
          value={values.destination}
          onChange={(p) => update('destination', p)}
          error={errors.destination}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr]">
        <div>
          <label htmlFor="departure" className={labelClass}>
            Departure <span className="font-normal normal-case tracking-normal">(local time)</span>
          </label>
          <input
            id="departure"
            type="datetime-local"
            value={values.departure}
            onChange={(e) => update('departure', e.target.value)}
            aria-invalid={errors.departure ? true : undefined}
            aria-describedby={errors.departure ? 'departure-err' : undefined}
            className={fieldClass}
          />
          <FieldError id="departure-err" message={errors.departure} />
        </div>
        <div>
          <label htmlFor="load" className={labelClass}>
            Load <span className="font-normal normal-case tracking-normal">(lb)</span>
          </label>
          <input
            id="load"
            type="number"
            inputMode="numeric"
            min={LOAD_MIN_LB}
            max={LOAD_MAX_LB}
            step={1}
            value={values.load}
            onChange={(e) => update('load', e.target.value)}
            aria-invalid={errors.load ? true : undefined}
            aria-describedby={errors.load ? 'load-err' : 'load-hint'}
            className={fieldClass}
          />
          <p id="load-hint" className="sr-only">
            Between {LOAD_MIN_LB} and {LOAD_MAX_LB} pounds.
          </p>
          <FieldError id="load-err" message={errors.load} />
        </div>
      </div>

      <IntervalPicker value={values.interval} onChange={(v) => update('interval', v)} />

      <button
        type="submit"
        disabled={isSubmitting}
        className="group relative flex min-h-12 items-center justify-between gap-3 bg-text px-4 text-sm font-semibold tracking-wide text-bg uppercase transition-[opacity,transform] duration-150 hover:opacity-90 active:translate-y-px disabled:cursor-progress disabled:opacity-60"
      >
        <span>{isSubmitting ? 'Planning routes…' : 'Plan routes'}</span>
        <span aria-hidden="true" className="tabular text-signal transition-transform duration-150 group-hover:translate-x-1">
          →
        </span>
      </button>
    </form>
  )
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="mt-1 text-xs text-danger">
      {message}
    </p>
  )
}

function IntervalPicker({ value, onChange }: { value: IntervalMi; onChange: (v: IntervalMi) => void }) {
  return (
    <fieldset>
      <legend className={labelClass}>Weather checkpoint every</legend>
      <div className="grid grid-cols-3 border border-line-strong">
        {INTERVALS.map((interval) => (
          <label
            key={interval}
            className="tabular relative flex min-h-11 cursor-pointer items-center justify-center border-r border-line-strong text-sm last:border-r-0 has-checked:bg-text has-checked:text-bg has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--focus)"
          >
            <input
              type="radio"
              name="interval"
              value={interval}
              checked={value === interval}
              onChange={() => onChange(interval)}
              className="sr-only"
            />
            {interval} mi
          </label>
        ))}
      </div>
    </fieldset>
  )
}
