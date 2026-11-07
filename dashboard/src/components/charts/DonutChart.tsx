import { useState } from 'react'

export interface DonutSlice {
  key: string
  label: string
  value: number
  color: string
}

interface DonutChartProps {
  data: DonutSlice[]
  caption: string
  // Center text when nothing is hovered.
  totalLabel: string
  formatValue?: (value: number) => string
}

const RADIUS = 42
const GAP = 1.2

// Parts of a whole (up to five slices plus "Otros"), with a legend that carries every number,
// so color is never the only way to read it.
function DonutChart({ data, caption, totalLabel, formatValue = (value) => value.toLocaleString('es-MX') }: DonutChartProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const total = data.reduce((sum, slice) => sum + slice.value, 0)
  const active = data.find((slice) => slice.key === hovered)
  const percent = (value: number) => (total ? Math.round((value / total) * 100) : 0)
  const starts = data.reduce<number[]>((list, _slice, index) => {
    list.push(index === 0 ? 0 : list[index - 1] + (total ? (data[index - 1].value / total) * 100 : 0))
    return list
  }, [])

  return (
    <figure className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
      <div className="relative h-44 w-44 shrink-0" aria-hidden="true">
        <svg className="h-full w-full -rotate-90 animate-fade" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="#F4F4F5" strokeWidth="12" />
          {data.map((slice, index) => {
            const length = total ? (slice.value / total) * 100 : 0
            const dash = Math.max(length - (data.length > 1 ? GAP : 0), 0)
            return (
              <circle
                key={slice.key}
                cx="50"
                cy="50"
                r={RADIUS}
                fill="none"
                stroke={slice.color}
                strokeWidth={hovered === slice.key ? 14 : 12}
                pathLength={100}
                strokeDasharray={`${dash} ${100 - dash}`}
                strokeDashoffset={-starts[index]}
                className="transition-[stroke-width,opacity] duration-200"
                opacity={hovered && hovered !== slice.key ? 0.35 : 1}
                onMouseEnter={() => setHovered(slice.key)}
                onMouseLeave={() => setHovered(null)}
              />
            )
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-display text-3xl font-bold leading-none text-ink tabular">
            {formatValue(active ? active.value : total)}
          </span>
          <span className="mt-1 max-w-[96px] truncate text-xs text-slate-500">{active ? active.label : totalLabel}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1">
        {data.map((slice) => (
          <li
            className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors ${hovered === slice.key ? 'bg-slate-50' : ''}`}
            key={slice.key}
            onMouseEnter={() => setHovered(slice.key)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="flex min-w-0 items-center gap-2 text-slate-700">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: slice.color }} aria-hidden="true" />
              <span className="truncate">{slice.label}</span>
            </span>
            <span className="shrink-0 text-slate-500 tabular">
              <span className="font-semibold text-ink">{formatValue(slice.value)}</span> · {percent(slice.value)}%
            </span>
          </li>
        ))}
      </ul>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  )
}

export default DonutChart
