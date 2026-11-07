// A round axis top (1, 2, 2.5 or 5 times a power of ten) at or above `max`, so ticks land on readable numbers.
export function niceMax(max: number, minimum = 1) {
  const value = Math.max(max, minimum)
  const power = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 2.5, 5, 10].find((factor) => factor * power >= value) ?? 10
  return step * power
}

export const compactNumber = (value: number) =>
  new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
