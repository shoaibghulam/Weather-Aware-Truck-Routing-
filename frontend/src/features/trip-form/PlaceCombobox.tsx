import { useId, useState, type KeyboardEvent } from 'react'
import { errorMessage } from '../../api/client'
import type { Place } from '../../api/types'
import { GEOCODE_MIN_CHARS, useGeocode } from './useGeocode'

interface PlaceComboboxProps {
  label: string
  /** Short code shown in the field gutter, e.g. "A" / "B". */
  marker: string
  value: Place | null
  onChange: (place: Place | null) => void
  error?: string
}

/** WAI-ARIA 1.2 combobox with a listbox popup; arrow keys, Enter and Escape. */
export function PlaceCombobox({ label, marker, value, onChange, error }: PlaceComboboxProps) {
  const id = useId()
  const listId = `${id}-list`
  const [text, setText] = useState(value?.label ?? '')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const committed = value !== null && value.label === text
  const geo = useGeocode(text, !committed)
  const showList = open && !committed && geo.active

  function choose(place: Place) {
    onChange(place)
    setText(place.label)
    setOpen(false)
    setActive(-1)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const count = geo.results.length
    if (event.key === 'ArrowDown' && count > 0) {
      event.preventDefault()
      setOpen(true)
      setActive((i) => (i + 1) % count)
    } else if (event.key === 'ArrowUp' && count > 0) {
      event.preventDefault()
      setActive((i) => (i <= 0 ? count - 1 : i - 1))
    } else if (event.key === 'Enter' && showList && active >= 0) {
      const place = geo.results[active]
      if (place) {
        event.preventDefault()
        choose(place)
      }
    } else if (event.key === 'Escape') {
      setOpen(false)
      setActive(-1)
    }
  }

  const describedBy = [error ? `${id}-err` : '', `${id}-hint`].filter(Boolean).join(' ')
  const activeId = showList && active >= 0 ? `${id}-opt-${active}` : undefined

  return (
    <div className="relative">
      <label htmlFor={`${id}-input`} className="mb-1 block text-xs font-semibold tracking-wider text-muted uppercase">
        {label}
      </label>
      <div className="flex items-stretch border border-line-strong bg-surface focus-within:border-accent">
        <span
          aria-hidden="true"
          className="tabular grid w-8 shrink-0 place-items-center border-r border-line bg-surface-2 text-xs font-semibold"
        >
          {marker}
        </span>
        <input
          id={`${id}-input`}
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          value={text}
          placeholder="City, address or ZIP"
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
            setActive(-1)
            if (value) onChange(null)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="min-h-11 w-full min-w-0 bg-transparent px-3 text-[15px] outline-none placeholder:text-muted"
        />
      </div>
      <p id={`${id}-hint`} className="sr-only">
        Type at least {GEOCODE_MIN_CHARS} characters, then use the arrow keys to pick a suggestion.
      </p>
      {error && (
        <p id={`${id}-err`} className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
      <ul
        id={listId}
        role="listbox"
        aria-label={`${label} suggestions`}
        hidden={!showList}
        className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-auto border border-line-strong bg-surface shadow-lg"
      >
        <SuggestionStatus geo={geo} />
        {geo.results.map((place, index) => (
          <li
            key={`${place.lat},${place.lon},${place.label}`}
            id={`${id}-opt-${index}`}
            role="option"
            aria-selected={index === active}
            // mousedown fires before the input blurs, so the choice is not lost.
            onMouseDown={(e) => {
              e.preventDefault()
              choose(place)
            }}
            onMouseEnter={() => setActive(index)}
            className="cursor-pointer border-b border-line px-3 py-2 text-sm last:border-b-0 aria-selected:bg-accent aria-selected:text-accent-contrast"
          >
            {place.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

function SuggestionStatus({ geo }: { geo: ReturnType<typeof useGeocode> }) {
  let message: string | null = null
  if (geo.error) message = errorMessage(geo.error)
  else if (geo.isPending || geo.isFetching) message = 'Searching…'
  else if (geo.results.length === 0) message = 'No matches. Try a city and state, e.g. "Dallas, TX".'
  if (!message) return null
  return (
    <li role="presentation" aria-live="polite" className={`px-3 py-2 text-sm ${geo.error ? 'text-danger' : 'text-muted'}`}>
      {message}
    </li>
  )
}
