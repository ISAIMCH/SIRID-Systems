interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: ReadonlyArray<readonly [T, string]>
  onChange: (value: T) => void
}

// A row of mutually exclusive filters (period, view) shown as one pill.
function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="inline-flex rounded-xl bg-slate-100 p-1 text-sm" role="group" aria-label={label}>
      {options.map(([optionValue, optionLabel]) => {
        const isActive = optionValue === value
        return (
          <button
            className={`min-h-[32px] rounded-lg px-3 font-medium transition-all duration-200 ${
              isActive ? 'bg-white text-ink shadow-sm' : 'text-slate-500 hover:text-ink'
            }`}
            type="button"
            aria-pressed={isActive}
            key={optionValue}
            onClick={() => onChange(optionValue)}
          >
            {optionLabel}
          </button>
        )
      })}
    </div>
  )
}

export default Segmented
