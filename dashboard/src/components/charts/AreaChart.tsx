import { useId, useState } from 'react'
import ChartTooltip, { TooltipRow } from './ChartTooltip'
import { compactNumber, niceMax } from './scale'

export interface AreaPoint {
  key: string
  // Axis text; empty to skip that tick.
  label: string
  // Full name of the point, for the tooltip and the table.
  name: string
  value: number
  // Same position in the comparison period, when there is one.
  compare?: number
  compareName?: string
}

interface AreaChartProps {
  data: AreaPoint[]
  caption: string
  seriesLabel: string
  compareLabel?: string
  formatValue?: (value: number) => string
}

const LINE = '#0E9F6E'
const COMPARE = '#A1A1AA'
const WIDTH = 600
const HEIGHT = 200

// A trend over time with an optional dashed comparison line; one crosshair tooltip shows both values.
function AreaChart({ data, caption, seriesLabel, compareLabel, formatValue = (value) => value.toLocaleString('es-MX') }: AreaChartProps) {
  const gradientId = useId()
  const [hovered, setHovered] = useState<number | null>(null)
  const hasCompare = Boolean(compareLabel) && data.some((point) => point.compare !== undefined)
  const axisMax = niceMax(Math.max(...data.flatMap((point) => [point.value, point.compare ?? 0]), 0), 4)
  const ticks = [axisMax, axisMax / 2, 0]
  const x = (index: number) => (data.length > 1 ? (index / (data.length - 1)) * WIDTH : WIDTH / 2)
  const y = (value: number) => HEIGHT - (value / axisMax) * HEIGHT
  const line = (values: number[]) => values.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ')
  const mainPath = line(data.map((point) => point.value))
  const areaPath = `${mainPath} L${x(data.length - 1)},${HEIGHT} L${x(0)},${HEIGHT} Z`
  const comparePath = hasCompare ? line(data.map((point) => point.compare ?? 0)) : ''
  const active = hovered === null ? null : data[hovered]
  const leftOf = (index: number) => (data.length > 1 ? (index / (data.length - 1)) * 100 : 50)

  return (
    <figure>
      {hasCompare && (
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600" aria-hidden="true">
          <span className="flex items-center gap-1.5"><span className="h-[3px] w-4 rounded-full" style={{ backgroundColor: LINE }} />{seriesLabel}</span>
          <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed" style={{ borderColor: COMPARE }} />{compareLabel}</span>
        </div>
      )}
      <div className="relative mt-3 flex h-56 gap-3" aria-hidden="true">
        <div className="flex w-10 flex-col justify-between text-right text-[11px] text-slate-400 tabular">
          {ticks.map((tick) => <span key={tick}>{compactNumber(tick)}</span>)}
        </div>
        <div className="relative flex-1">
          <div className="absolute inset-0 flex flex-col justify-between">
            {ticks.map((tick) => <div className={`h-px ${tick === 0 ? 'bg-slate-300' : 'bg-slate-100'}`} key={tick} />)}
          </div>
          <svg className="absolute inset-0 h-full w-full animate-fade overflow-visible" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={LINE} stopOpacity="0.22" />
                <stop offset="100%" stopColor={LINE} stopOpacity="0" />
              </linearGradient>
            </defs>
            {hasCompare && (
              <path d={comparePath} fill="none" stroke={COMPARE} strokeWidth="2" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
            )}
            <path d={areaPath} fill={`url(#${gradientId})`} />
            <path d={mainPath} fill="none" stroke={LINE} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {active && hovered !== null && (
            <>
              <div className="pointer-events-none absolute inset-y-0 w-px bg-slate-300" style={{ left: `${leftOf(hovered)}%` }} />
              {hasCompare && active.compare !== undefined && (
                <span
                  className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
                  style={{ left: `${leftOf(hovered)}%`, top: `${(y(active.compare) / HEIGHT) * 100}%`, backgroundColor: COMPARE }}
                />
              )}
              <span
                className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                style={{ left: `${leftOf(hovered)}%`, top: `${(y(active.value) / HEIGHT) * 100}%`, backgroundColor: LINE }}
              />
              <ChartTooltip left={leftOf(hovered)} title={active.name}>
                <TooltipRow color={LINE} label={seriesLabel} value={formatValue(active.value)} />
                {hasCompare && active.compare !== undefined && (
                  <TooltipRow color={COMPARE} dashed label={active.compareName ?? compareLabel ?? ''} value={formatValue(active.compare)} />
                )}
              </ChartTooltip>
            </>
          )}
          {/* Hit areas wider than the line: one column per point. */}
          <div className="absolute inset-0 flex" onMouseLeave={() => setHovered(null)}>
            {data.map((point, index) => (
              <div className="h-full flex-1" key={point.key} onMouseEnter={() => setHovered(index)} />
            ))}
          </div>
        </div>
      </div>
      <div className="relative ml-[52px] mt-2 h-4 text-[11px] text-slate-400" aria-hidden="true">
        {data.map((point, index) => point.label && (
          <span
            className={`absolute whitespace-nowrap ${index === 0 ? '' : index === data.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`}
            style={{ left: `${leftOf(index)}%` }}
            key={point.key}
          >
            {point.label}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr><th scope="col">Fecha</th><th scope="col">{seriesLabel}</th>{hasCompare && <th scope="col">{compareLabel}</th>}</tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.key}>
              <th scope="row">{point.name}</th>
              <td>{formatValue(point.value)}</td>
              {hasCompare && <td>{point.compare === undefined ? '—' : formatValue(point.compare)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

export default AreaChart
