import type { ReactNode } from 'react'

interface ChartTooltipProps {
  // Horizontal position of the hovered mark, in percent of the plot width.
  left: number
  title: string
  children: ReactNode
}

// Floating card above the plot; it flips its anchor near the edges so it never leaves the chart.
function ChartTooltip({ left, title, children }: ChartTooltipProps) {
  const shift = left < 20 ? '0%' : left > 80 ? '-100%' : '-50%'
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 min-w-[140px] animate-fade rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lift"
      style={{ left: `${left}%`, transform: `translate(${shift}, calc(-100% - 8px))` }}
      role="presentation"
    >
      <p className="font-semibold text-ink">{title}</p>
      <div className="mt-1 space-y-0.5">{children}</div>
    </div>
  )
}

export function TooltipRow({ color, label, value, dashed = false }: { color: string; label: string; value: string; dashed?: boolean }) {
  return (
    <p className="flex items-center justify-between gap-4 text-slate-600">
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block h-0.5 w-3 rounded-full"
          style={dashed ? { borderTop: `2px dashed ${color}`, height: 0 } : { backgroundColor: color, height: 3 }}
          aria-hidden
        />
        {label}
      </span>
      <span className="font-semibold text-ink tabular">{value}</span>
    </p>
  )
}

export default ChartTooltip
