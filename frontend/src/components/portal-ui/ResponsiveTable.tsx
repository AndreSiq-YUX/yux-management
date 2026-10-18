import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface ResponsiveTableColumn<T> {
  key: string
  header: ReactNode
  /** Como renderizar a célula; por padrão, `row[key]`. */
  render?: (row: T) => ReactNode
  /** Classes da célula/coluna na tabela (ex.: `text-right`, `w-32`). */
  className?: string
  /** Rótulo no cartão (celular). Por padrão, `header` quando for texto. Use `''` para ocultar o rótulo. */
  mobileLabel?: string
}

export interface ResponsiveTableProps<T> {
  columns: ResponsiveTableColumn<T>[]
  rows: T[]
  getRowKey: (row: T, index: number) => string
  onRowClick?: (row: T) => void
  /** Mostrado quando `rows` está vazio. */
  empty?: ReactNode
  /** Legenda acessível da tabela. */
  caption?: string
  className?: string
}

function cellValue<T>(column: ResponsiveTableColumn<T>, row: T): ReactNode {
  if (column.render) return column.render(row)
  const raw = (row as Record<string, unknown>)[column.key]
  return raw === undefined || raw === null ? '' : (raw as ReactNode)
}

function activateOnKey(event: KeyboardEvent, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    action()
  }
}

/**
 * Tabela a partir de 720px; abaixo disso, lista de cartões com pares rótulo/valor.
 * O wrapper da tabela tem `overflow-x-auto` para telas intermediárias.
 */
export function ResponsiveTable<T>({ columns, rows, getRowKey, onRowClick, empty, caption, className }: ResponsiveTableProps<T>) {
  if (rows.length === 0 && empty) return <>{empty}</>

  const labelOf = (column: ResponsiveTableColumn<T>) =>
    column.mobileLabel !== undefined ? column.mobileLabel : typeof column.header === 'string' ? column.header : ''

  return (
    <div className={cn('min-w-0', className)}>
      {/* Tabela (≥ 720px) */}
      <div data-testid="responsive-table-desktop" className="hidden overflow-x-auto min-[720px]:block">
        <table className="w-full border-collapse text-left text-[13px]">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr className="border-b border-yx-line">
              {columns.map(column => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'whitespace-nowrap px-3 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-yx-fg-3',
                    column.className,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={getRowKey(row, index)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? event => activateOnKey(event, () => onRowClick(row)) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={cn(
                  'border-b border-yx-line last:border-b-0',
                  onRowClick &&
                    'cursor-pointer hover:bg-yx-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-yx-blue',
                )}
              >
                {columns.map(column => (
                  <td key={column.key} className={cn('px-3 py-3 align-middle text-yx-fg', column.className)}>
                    {cellValue(column, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cartões (< 720px) */}
      <ul data-testid="responsive-table-cards" className="m-0 grid list-none gap-2.5 p-0 min-[720px]:hidden">
        {rows.map((row, index) => (
          <li
            key={getRowKey(row, index)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            onKeyDown={onRowClick ? event => activateOnKey(event, () => onRowClick(row)) : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            role={onRowClick ? 'button' : undefined}
            className={cn(
              'rounded-lg border border-yx-line bg-yx-surface p-3.5',
              onRowClick &&
                'cursor-pointer hover:border-yx-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue',
            )}
          >
            <dl className="m-0 grid gap-2">
              {columns.map(column => {
                const label = labelOf(column)
                return (
                  <div key={column.key} className="flex items-start justify-between gap-3 text-[13px]">
                    {label ? (
                      <dt className="shrink-0 font-mono text-[11px] font-medium uppercase leading-[1.7] tracking-[0.07em] text-yx-fg-3">
                        {label}
                      </dt>
                    ) : null}
                    <dd className={cn('m-0 min-w-0 text-yx-fg', label ? 'text-right' : 'w-full')}>{cellValue(column, row)}</dd>
                  </div>
                )
              })}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  )
}
