/** Datas sempre relativas a "agora" para que filtros de periodo mostrem dados. */
const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000

export const now = () => new Date()
export const daysAgo = (days: number, hours = 0) => new Date(Date.now() - days * DAY - hours * HOUR).toISOString()
export const daysFromNow = (days: number, hours = 0) => new Date(Date.now() + days * DAY + hours * HOUR).toISOString()
export const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString()
export const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000).toISOString()
/** Apenas a data (YYYY-MM-DD). */
export const dateOnly = (iso: string) => iso.slice(0, 10)
export const dayAgoDate = (days: number) => dateOnly(daysAgo(days))
export const dayAheadDate = (days: number) => dateOnly(daysFromNow(days))
