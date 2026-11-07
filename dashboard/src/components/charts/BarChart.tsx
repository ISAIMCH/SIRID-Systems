import { useState } from 'react'
import ChartTooltip, { TooltipRow } from './ChartTooltip'
import { compactNumber, niceMax } from './scale'

export interface BarDatum {
  key: string
  // Axis text; empty to skip that tick.
  label: string
  // Full name of the bar, for the tooltip and the table.
  name: string
  value: number
}

interface BarChartProps {
  data: BarDatum[]
  caption: string
  valueLabel: string
  formatValue?: (value: number) => string
  // The bar to emphasize (e.g. the peak hour); the others stay muted.
  highlightKey?: string
}

const BAR = '#0E9F6E'
const BAR_MUTED = '#86D9B8'

// One series of bars from a zero baseline, with a tooltip per bar and a hidden table for screen readers.
function BarChart({ data, caption, valueLabel, formatValue = (value) => value.toLocaleString('es-MX'), highlightKey }: BarChartProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const axisMax = niceMax(Math.max(...data.map((item) => item.value), 0), 4)
  const ticks = [axisMax, axisMax / 2, 0]
  const active = hovered === null ? null : data[hovered]

  return (
    <figure className="relative">
      <p className="text-xs font-medium text-slate-500" aria-hidden="true">{valueLabel}</p>
      <div className="relative mt-3 flex h-52 gap-3" aria-hidden="true">
        <div className="flex w-8 flex-col justify-between text-right text-[11px] text-slate-400 tabular">
          {ticks.map((tick) => <span className="-translate-y-1/2 first:translate-y-0 last:translate-y-0" key={tick}>{compactNumber(tick)}</span>)}
        </div>
        <div className="relative flex-1">
          <div className="absolute inset-0 flex flex-col justify-between">
            {ticks.map((tick) => <div className={`h-px ${tick === 0 ? 'bg-slate-300' : 'bg-slate-100'}`} key={tick} />)}
          </div>
          <div className="relative flex h-full items-end gap-[2px]" onMouseLeave={() => setHovered(null)}>
            {data.map((item, index) => {
              const isMuted = (hovered !== null && hovered !== index) || (hovered === null && highlightKey !== undefined && highlightKey !== item.key)
              return (
                <div
                  className="flex h-full flex-1 items-end"
                  key={item.key}
                  onMouseEnter={() => setHovered(index)}
                >
                  <div
                    className="w-full origin-bottom animate-grow rounded-t transition-colors duration-150"
                    style={{
                      height: item.value > 0 ? `max(${(item.value / axisMax) * 100}%, 3px)` : 0,
                      backgroundColor: isMuted ? BAR_MUTED : BAR,
                      animationDelay: `${Math.min(index * 18, 360)}ms`,
                    }}
                  />
                </div>
              )
            })}
          </div>
          {active && hovered !== null && (
            <ChartTooltip left={((hovered + 0.5) / data.length) * 100} title={active.name}>
              <TooltipRow color={BAR} label={valueLabel} value={formatValue(active.value)} />
            </ChartTooltip>
          )}
        </div>
      </div>
      <div className="ml-11 mt-2 flex gap-[2px] text-[11px] text-slate-400" aria-hidden="true">
        {data.map((item) => (
          <span className="flex-1 truncate text-center" key={item.key}>{item.label}</span>
        ))}
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {data.map((item) => (
            <tr key={item.key}><th scope="row">{item.name}</th><td>{formatValue(item.value)}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

export default BarChart
