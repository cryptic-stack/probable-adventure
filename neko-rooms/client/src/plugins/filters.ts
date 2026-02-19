import moment from 'moment'

export const formatDatetime = (value?: string | number | Date | null): string => {
  if (!value) return ''
  return moment(String(value)).format('MM/DD/YYYY HH:mm')
}

export const formatTimeago = (value?: string | number | Date | null): string => {
  if (!value) return ''
  return moment(String(value)).fromNow()
}

export const formatPercent = (value: number): string => `${Math.floor(value * 10000) / 100}%`

export const formatMemory = (value: number): string => {
  if (value < 1e3) return `${value}B`
  if (value < 1e6) return `${(value / 1e3).toFixed(0)}K`
  if (value < 1e9) return `${(value / 1e6).toFixed(0)}M`
  return `${(value / 1e9).toFixed(1)}G`
}

export const formatNanocpus = (value: number): string => `${(value / 1e9).toFixed(1)}x`
