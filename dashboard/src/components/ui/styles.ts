// Class strings for the controls every page repeats, so forms and buttons look the same everywhere.

export const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-brand-text focus:ring-2 focus:ring-brand/30 disabled:bg-slate-50 disabled:text-slate-500'

export const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700'

export const hintClass = 'mt-1.5 text-xs text-slate-500'

export const primaryButton = 'inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink shadow-glow transition hover:bg-brand-hover active:bg-brand-press disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none'

export const secondaryButton = 'inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'

export const dangerButton = 'inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60'

// Square icon-only button for row actions (edit, delete).
export const iconButton = 'grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-ink disabled:opacity-40'

export const errorAlert = 'rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700'

export const successAlert = 'rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800'

// Table head and cells used inside a Panel (which pads 20px / 24px).
export const tableHeadClass = 'border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500'
export const thClass = 'px-3 py-2.5 font-medium first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6'
export const tdClass = 'px-3 py-3.5 first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6'
