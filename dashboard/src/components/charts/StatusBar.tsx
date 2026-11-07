import { useState } from 'react'

export interface StatusSegment {
  key: string
  label: string
  value: number
  // Tailwind background class of a status color.
  colorClass: string
  description?: string
}

interface StatusBarProps {
  data: StatusSegment[]
  caption: string
}

// One bar split by state (a whole of 100%), with a legend that names every state and its count.
function StatusBar({ data, caption }: StatusBarProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const total = data.reduce((sum, segment) => sum + segment.value, 0)
  const percent = (value: number) => (total ? Math.round((value / total) * 100) : 0)

  return (
    <figure>
      <div className="flex h-4 w-full origin-left animate-grow-x gap-[2px] overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        {data.filter((segment) => segment.value > 0).map((segment) => (
          <div
            className={`h-full transition-opacity duration-200 ${segment.colorClass} ${hovered && hovered !== segment.key ? 'opacity-30' : ''}`}
            style={{ flexGrow: segment.value }}
            key={segment.key}
            onMouseEnter={() => setHovered(segment.key)}
            onMouseLeave={() => setHovered(null)}
            title={`${segment.label}: ${segment.value} (${percent(segment.value)}%)`}
          />
        ))}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        {data.map((segment) => (
          <li
            className={`rounded-lg px-2 py-1.5 transition-colors ${hovered === segment.key ? 'bg-slate-50' : ''}`}
            key={segment.key}
            onMouseEnter={() => setHovered(segment.key)}
            onMouseLeave={() => setHovered(null)}
            title={segment.description}
          >
            <span className="flex items-center gap-2 text-xs text-slate-500">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${segment.colorClass}`} aria-hidden="true" />
              {segment.label}
            </span>
            <span className="mt-0.5 block text-sm text-slate-500 tabular">
              <span className="font-semibold text-ink">{segment.value.toLocaleString('es-MX')}</span> · {percent(segment.value)}%
            </span>
          </li>
        ))}
      </ul>
      <figcaption className="sr-only">{caption}</figcaption>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {data.map((segment) => (
            <tr key={segment.key}><th scope="row">{segment.label}</th><td>{segment.value} ({percent(segment.value)}%)</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

export default StatusBar
