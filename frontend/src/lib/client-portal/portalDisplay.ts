export const formatPortalDate = (value?: string) => {
  if (!value) return 'Sem data'
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

export const formatPortalDateTime = (value?: string) => {
  if (!value) return 'Sem data'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export const formatPortalCurrency = (value?: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
}

export const countItems = <T>(items: T[], predicate: (item: T) => boolean) => items.filter(predicate).length

export const statusLabel = (status?: string) => {
  if (!status) return 'Nao informado'
  return status.replace(/_/g, ' ')
}
