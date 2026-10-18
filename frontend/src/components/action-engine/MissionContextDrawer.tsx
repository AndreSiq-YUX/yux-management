import { BookOpen, Building2, CheckCircle2, ExternalLink, X } from 'lucide-react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useDialogFocusReturn } from '@/components/portal-ui/useDialogFocusReturn'
import type { MissionConversation, MissionConversationMissingContext, MissionConversationSource } from '@/types/actionEngine'
import type { ResolvedCorrectionTarget } from '@/lib/workspace/correctionTargets'

type Props = {
  conversation: MissionConversation
  open: boolean
  onClose: () => void
  correctionTarget?: (missing: MissionConversationMissingContext) => ResolvedCorrectionTarget | null
  onInlineCorrection?: (missing: MissionConversationMissingContext, target: ResolvedCorrectionTarget) => void
}

export function MissionContextDrawer({ conversation, open, onClose, correctionTarget, onInlineCorrection }: Props) {
  const focusReturn = useDialogFocusReturn()
  const sources = uniqueSources(conversation.messages.flatMap(message => message.sourceRefs).filter(source => source.displayMode !== 'hidden'))
  const yuxSources = sources.filter(source => source.ref.startsWith('yux:'))
  const customerSources = sources.filter(source => source.ref.startsWith('customer:'))
  const readiness = conversation.contextReadiness
  const missing = Array.isArray(readiness.missing) ? readiness.missing : []

  return (
    <DialogPrimitive.Root open={open} onOpenChange={next => { if (!next) onClose() }}>
      <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink-900/30" />
      <DialogPrimitive.Content {...focusReturn} aria-describedby="mission-context-description" className="fixed inset-y-0 right-0 z-50 h-full w-full max-w-md overflow-y-auto bg-yx-surface shadow-2xl focus-visible:outline-none">
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-yx-line bg-yx-surface px-5 py-4">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-yx-blue">Transparência</p><DialogPrimitive.Title className="mt-1 text-lg font-semibold text-yx-fg">Contexto usado pelo agente</DialogPrimitive.Title><DialogPrimitive.Description id="mission-context-description" className="sr-only">Fontes verificadas e informações que ainda precisam de correção.</DialogPrimitive.Description></div>
          <DialogPrimitive.Close aria-label="Fechar contexto" className="grid h-10 w-10 place-items-center rounded-full text-yx-fg-3 hover:bg-yx-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue"><X aria-hidden="true" className="h-4 w-4" /></DialogPrimitive.Close>
        </header>
        <div className="space-y-6 p-5">
          <ContextSection icon={BookOpen} title="Estratégia YUX" description="Métodos e padrões da YUX usados para orientar este pedido." sources={yuxSources} empty="Nenhuma fonte metodológica foi necessária nesta resposta." />
          <ContextSection icon={Building2} title="Contexto da empresa" description="Informações da marca, oferta e operação consideradas pelo agente." sources={customerSources} empty="Ainda não há fontes suficientes do cliente para exibir." />
          {missing.length ? (
            <section>
              <h3 className="font-semibold text-yx-fg">O que ainda falta</h3>
              <div className="mt-3 space-y-2">
                {missing.map(item => {
                  const target = correctionTarget?.(item)
                  return <article className="rounded-lg border border-yx-warn-line bg-yx-warn-soft p-3" key={item.key}><p className="text-sm font-medium text-yx-warn">{item.reason}</p>{target?.mode === 'inline' ? <button type="button" className="mt-2 text-xs font-semibold text-yx-warn hover:underline" onClick={() => onInlineCorrection?.(item, target)}>Corrigir nesta conversa</button> : target?.path ? <a className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-yx-warn hover:underline" href={target.path}>Corrigir informação <ExternalLink className="h-3 w-3" /></a> : null}</article>
                })}
              </div>
            </section>
          ) : <div className="flex gap-2 rounded-lg border border-yx-ok-line bg-yx-ok-soft p-3 text-sm text-yx-ok"><CheckCircle2 className="h-4 w-4 shrink-0" />O contexto consultado está suficiente para esta etapa.</div>}
        </div>
      </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function ContextSection({ icon: Icon, title, description, sources, empty }: { icon: typeof BookOpen; title: string; description: string; sources: MissionConversationSource[]; empty: string }) {
  return <section><div className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-yx-blue-soft text-yx-blue"><Icon className="h-4 w-4" /></span><div><h3 className="font-semibold text-yx-fg">{title}</h3><p className="mt-1 text-xs leading-5 text-yx-fg-3">{description}</p></div></div><div className="mt-3 space-y-2">{sources.length ? sources.map(source => <div className="rounded-lg border border-yx-line px-3 py-2.5" key={source.ref}><p className="text-sm font-medium text-yx-fg-2">{source.displayMode === 'generic' ? 'Metodologia YUX' : source.title}</p><p className="mt-0.5 text-[11px] text-yx-fg-3">Fonte verificada</p></div>) : <p className="rounded-lg bg-yx-surface-2 p-3 text-xs leading-5 text-yx-fg-3">{empty}</p>}</div></section>
}

function uniqueSources(sources: MissionConversationSource[]) {
  return [...new Map(sources.map(source => [source.ref, source])).values()]
}
