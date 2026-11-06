import { LEVELS } from '../../lib/risk'

/** Map legend. Swatch + label for every level, including "No forecast". */
export function RiskLegend() {
  return (
    <section aria-label="Risk legend" className="pointer-events-auto border border-line-strong bg-overlay px-3 py-2 shadow-lg backdrop-blur-sm">
      <h2 className="m-0 text-[11px] font-semibold tracking-widest text-muted uppercase">Checkpoint risk</h2>
      <ul className="m-0 mt-1.5 grid list-none grid-cols-3 gap-x-3 gap-y-1 p-0 text-xs sm:grid-cols-2">
        {LEVELS.map((level) => (
          <li key={level.key} className="flex items-center gap-1.5 whitespace-nowrap">
            <span
              aria-hidden="true"
              className={`${level.bgClass} inline-block rounded-full border border-surface`}
              style={{ width: 8 + Math.max(level.score, 0) * 2, height: 8 + Math.max(level.score, 0) * 2 }}
            />
            {level.label}
          </li>
        ))}
      </ul>
      <p className="m-0 mt-1.5 text-[11px] text-muted">Larger dot = higher risk. Heatmap uses the same ramp.</p>
    </section>
  )
}
