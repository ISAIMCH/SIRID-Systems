import type { AreaPoint } from '../components/charts/AreaChart'
import type { User } from '../types'
import { hasCurrentMembership } from './membership'

// Every figure on Inicio is derived here from what the API returns; nothing is estimated.

export const EXPIRING_DAYS = 7
const DAY = 24 * 60 * 60 * 1000

export interface MoneyEvent {
  amount: number
  date: Date
}

export type RevenueRange = '7d' | '30d' | '12m'
export type GrowthRange = '6m' | '12m'



export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

export function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / previous) * 100
}

const dayName = (date: Date, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-MX', options).format(date)

function sumBetween(events: MoneyEvent[], from: Date, to: Date) {
  return events.reduce((total, event) => (event.date >= from && event.date < to ? total + event.amount : total), 0)
}

// Income per day (7 or 30 days) or per month (12 months), each point next to the same point of the period before.
export function revenueSeries(events: MoneyEvent[], range: RevenueRange, now = new Date()) {
  const points: AreaPoint[] = []
  if (range === '12m') {
    const firstMonth = addMonths(now, -11)
    for (let index = 0; index < 12; index += 1) {
      const start = addMonths(firstMonth, index)
      const end = addMonths(start, 1)
      const previousStart = addMonths(start, -12)
      points.push({
        key: start.toISOString(),
        label: index % 2 === 0 ? dayName(start, { month: 'short' }) : '',
        name: dayName(start, { month: 'long', year: 'numeric' }),
        value: sumBetween(events, start, end),
        compare: sumBetween(events, previousStart, addMonths(previousStart, 1)),
        compareName: dayName(previousStart, { month: 'long', year: 'numeric' }),
      })
    }
  } else {
    const days = range === '7d' ? 7 : 30
    const today = startOfDay(now)
    for (let index = 0; index < days; index += 1) {
      const start = addDays(today, index - days + 1)
      const previousStart = addDays(start, -days)
      const labelEvery = days === 7 ? 1 : 5
      points.push({
        key: start.toISOString(),
        label: (days - 1 - index) % labelEvery === 0 ? dayName(start, days === 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' }) : '',
        name: dayName(start, { weekday: 'long', day: 'numeric', month: 'short' }),
        value: sumBetween(events, start, addDays(start, 1)),
        compare: sumBetween(events, previousStart, addDays(previousStart, 1)),
        compareName: dayName(previousStart, { weekday: 'long', day: 'numeric', month: 'short' }),
      })
    }
  }
  const current = points.reduce((total, point) => total + point.value, 0)
  const previous = points.reduce((total, point) => total + (point.compare ?? 0), 0)
  return { points, current, previous }
}

// This month so far against the same days of last month.
export function monthToDate(events: MoneyEvent[], now = new Date()) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const tomorrow = addDays(startOfDay(now), 1)
  const previousStart = addMonths(monthStart, -1)
  const previousEnd = new Date(Math.min(addDays(previousStart, now.getDate()).getTime(), monthStart.getTime()))
  return { current: sumBetween(events, monthStart, tomorrow), previous: sumBetween(events, previousStart, previousEnd) }
}

export type ClientState = 'current' | 'expiring' | 'expired' | 'suspended' | 'pending' | 'none'

// Same rules as the membership badge in Usuarios, plus "about to expire" for current memberships.
export function clientState(user: User, now = new Date()): ClientState {
  const membership = user.membership
  if (!membership?.status) return 'none'
  if (hasCurrentMembership(membership, now)) {
    return membership.expiresAt && new Date(membership.expiresAt).getTime() - now.getTime() <= EXPIRING_DAYS * DAY ? 'expiring' : 'current'
  }
  if (membership.status === 'active' && membership.startsAt && new Date(membership.startsAt) > now) return 'pending'
  if (membership.status === 'active' || membership.status === 'expired') return 'expired'
  if (membership.status === 'suspended') return 'suspended'
  return 'pending'
}

export function countStates(clients: User[], now = new Date()) {
  const counts: Record<ClientState, number> = { current: 0, expiring: 0, expired: 0, suspended: 0, pending: 0, none: 0 }
  clients.forEach((client) => { counts[clientState(client, now)] += 1 })
  return counts
}

// Of the clients who have had a membership that started, the share still current: renewals keep it up, lapses bring it down.
export function retentionRate(counts: Record<ClientState, number>) {
  const kept = counts.current + counts.expiring
  const everActive = kept + counts.expired + counts.suspended
  return everActive ? (kept / everActive) * 100 : null
}

function planLabel(user: User) {
  const membership = user.membership
  const plan = membership?.plan ?? membership?.planId
  const planName = typeof plan === 'object' && plan ? plan.name || plan.nombre : undefined
  return membership?.planName || planName || 'Sin plan'
}

// Current memberships per plan: the four largest and the rest under "Otros".
export function planDistribution(clients: User[], now = new Date()) {
  const counts = new Map<string, number>()
  clients.filter((client) => hasCurrentMembership(client.membership, now)).forEach((client) => {
    const label = planLabel(client)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  })
  const sorted = [...counts.entries()].sort((first, second) => second[1] - first[1])
  const top = sorted.slice(0, 4).map(([label, value]) => ({ label, value }))
  const rest = sorted.slice(4).reduce((total, [, value]) => total + value, 0)
  return rest ? [...top, { label: 'Otros', value: rest }] : top
}

export function hasJoinDates(clients: User[]) {
  return clients.some((client) => Boolean(client.joinedAt))
}

function joinedBetween(clients: User[], from: Date, to: Date) {
  return clients.filter((client) => {
    if (!client.joinedAt) return false
    const joined = new Date(client.joinedAt)
    return joined >= from && joined < to
  }).length
}

// Sign-ups in the last 30 days against the 30 before.
export function recentSignups(clients: User[], now = new Date()) {
  const tomorrow = addDays(startOfDay(now), 1)
  const start = addDays(tomorrow, -30)
  return { current: joinedBetween(clients, start, tomorrow), previous: joinedBetween(clients, addDays(start, -30), start) }
}

// Clients of today's list by the month they joined: new per month and the running total at each month's end.
export function growthSeries(clients: User[], range: GrowthRange, now = new Date()) {
  const months = range === '6m' ? 6 : 12
  const firstMonth = addMonths(now, -(months - 1))
  let total = clients.filter((client) => client.joinedAt && new Date(client.joinedAt) < firstMonth).length
  return Array.from({ length: months }, (_, index) => {
    const start = addMonths(firstMonth, index)
    const added = joinedBetween(clients, start, addMonths(start, 1))
    total += added
    return {
      key: start.toISOString(),
      label: months === 12 && index % 2 === 1 ? '' : dayName(start, { month: 'short' }),
      name: dayName(start, { month: 'long', year: 'numeric' }),
      added,
      total,
    }
  })
}

// Current memberships ending within EXPIRING_DAYS, soonest first.
export function expiringSoon(clients: User[], now = new Date()) {
  return clients
    .filter((client) => clientState(client, now) === 'expiring')
    .sort((first, second) => new Date(first.membership?.expiresAt ?? 0).getTime() - new Date(second.membership?.expiresAt ?? 0).getTime())
}

export function daysUntil(value: string | undefined, now = new Date()) {
  if (!value) return null
  return Math.round((startOfDay(new Date(value)).getTime() - startOfDay(now).getTime()) / DAY)
}
