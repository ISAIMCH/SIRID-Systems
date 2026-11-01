export interface BarDatum {
  key: string
  // Axis text; empty to skip that tick.
  label: string
  // Full name of the bar, for the hover text and the table.
  name: string
  value: number
}

interface BarChartProps {
  data: BarDatum[]
  caption: string
  valueLabel: string
  formatValue?: (value: number) => string
}

// One series of bars from a zero baseline. Each bar shows its value on hover, and a hidden table reads it out.
function BarChart({ data, caption, valueLabel, formatValue = (value) => value.toLocaleString('es-MX') }: BarChartProps) {
  const max = Math.max(...data.map((item) => item.value), 0)

  return (
    <figure>
      <div className="flex items-baseline justify-between text-xs text-slate-400" aria-hidden="true">
        <span>{valueLabel}</span>
        <span>máx. {formatValue(max)}</span>
      </div>
      <div className="mt-2 flex h-40 items-end gap-0.5 border-b border-slate-200" aria-hidden="true">
        {data.map((item) => (
          <div className="group relative flex h-full flex-1 items-end" key={item.key} title={`${item.name}: ${formatValue(item.value)}`}>
            <div
              className="w-full rounded-t bg-emerald-500 transition-colors group-hover:bg-emerald-700"
              style={{ height: max > 0 && item.value > 0 ? `max(${(item.value / max) * 100}%, 2px)` : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-0.5 text-[10px] text-slate-400" aria-hidden="true">
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
