export function profileValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Não informado'
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (typeof value === 'number') return value.toLocaleString('pt-BR')
  return typeof value === 'string' ? value : 'Não informado'
}
