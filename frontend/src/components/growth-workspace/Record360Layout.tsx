import type { ReactNode } from 'react'

interface Record360LayoutProps {
  identity: ReactNode
  tabs: ReactNode
  associations: ReactNode
}

export function Record360Layout({ identity, tabs, associations }: Record360LayoutProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_260px]">
      <aside className="space-y-4">{identity}</aside>
      <main className="min-w-0">{tabs}</main>
      <aside className="space-y-4">{associations}</aside>
    </div>
  )
}
