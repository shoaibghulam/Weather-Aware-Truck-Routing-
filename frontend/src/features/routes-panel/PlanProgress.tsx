import { useEffect, useState } from 'react'

/** What the backend is doing, roughly, by elapsed time (long trips take 7–12 s). */
export const PLAN_STAGES: readonly { afterS: number; text: string }[] = [
  { afterS: 0, text: 'Finding truck routes…' },
  { afterS: 3, text: 'Placing checkpoints and estimating arrival times…' },
  { afterS: 6, text: 'Checking the forecast at each checkpoint’s ETA…' },
  { afterS: 11, text: 'Scoring risk and ranking routes — long trips take a little longer…' },
]

export function stageFor(elapsedS: number): string {
  let text = PLAN_STAGES[0]?.text ?? ''
  for (const stage of PLAN_STAGES) if (elapsedS >= stage.afterS) text = stage.text
  return text
}

export function PlanProgress() {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const started = Date.now()
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500)
    return () => window.clearInterval(timer)
  }, [])
  return (
    <section aria-busy="true" className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3 border-l-4 border-signal bg-surface-2 px-3 py-2.5">
        <p role="status" className="m-0 text-sm">
          {stageFor(elapsed)}
        </p>
        <span aria-hidden="true" className="tabular shrink-0 text-xs text-muted">
          {elapsed}s
        </span>
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} aria-hidden="true" className="skeleton h-28 border border-line" style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </section>
  )
}
