import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
export function LeadWorkspaceLayout({
  header,
  identity,
  workKey,
  children,
}: {
  workKey?: string
  header: ReactNode
  identity: ReactNode
  children: ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const content = useRef<HTMLDivElement>(null),
    lastWork = useRef(workKey)
  useEffect(() => {
    if (lastWork.current === workKey) return
    lastWork.current = workKey
    setExpanded(false)
    if (window.matchMedia?.('(max-width:1023px)').matches)
      window.requestAnimationFrame(() =>
        content.current?.scrollTo?.({ top: 0 }),
      )
  }, [workKey])
  const Icon = expanded ? ChevronUp : ChevronDown
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      <header className="border-b bg-background px-4 py-4 pr-12 sm:px-6 sm:pr-14">
        {header}
      </header>
      <div
        ref={content}
        className="grid min-h-0 overflow-y-auto lg:grid-cols-[280px_minmax(0,1fr)] lg:overflow-hidden"
      >
        <aside
          className="order-1 min-w-0 border-b bg-muted/20 p-3 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-5"
          aria-label="Dados do lead"
        >
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-between text-sm lg:hidden"
            aria-expanded={expanded}
            aria-controls="lead-identity"
            onClick={() => setExpanded((value) => !value)}
          >
            Contatos e perfil do cliente
            <Icon className="ml-2 size-4" />
          </Button>
          <div
            id="lead-identity"
            className={cn(
              'flex-col gap-5',
              expanded ? 'mt-4 flex lg:mt-0' : 'hidden lg:flex',
            )}
          >
            {identity}
          </div>
        </aside>
        <main
          className="order-2 min-w-0 p-4 lg:order-2 lg:overflow-y-auto lg:p-5"
          aria-label="Trabalho comercial do lead"
        >
          {children}
        </main>
      </div>
    </div>
  )
}
