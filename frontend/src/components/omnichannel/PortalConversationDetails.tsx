import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { AlertTriangle, Bot, Building, Check, CheckCheck, Mail, MessageSquare, PanelRight, Paperclip, Phone, Plus, Tag, User, X } from 'lucide-react'
import { StatusChip, portalButtonClasses, portalFocusRing } from '@/components/portal-ui'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { crmOpsDataClient } from '@/lib/crmOpsDataClient'
import { omnichannelDataClient } from '@/lib/omnichannelDataClient'
import { channelLabel, formatPortalCurrency } from '@/lib/client-portal/portalDisplay'
import { cn } from '@/lib/utils'
import { mapLead, mapStage } from './ConversationDetails'
import { conversationStatusLabel, messageAuthorLabel, messageDeliveryLabel, responseModeLabel } from './portalLabels'
import type { CrmLead, CrmPipelineStage } from '@/types/crm'
import type { OmnichannelMessageView, PortalOmnichannelConversationSummary } from '@/services/omnichannelService'
import type { ResponseMode } from '@/types/omnichannel'

interface PortalConversationDetailsProps {
  conversation?: PortalOmnichannelConversationSummary
  messages: OmnichannelMessageView[]
  onModeChange?: (conversationId: string, mode: ResponseMode) => void
  onHandoff?: (conversationId: string) => void
  onResolve?: (conversationId: string) => void
  onReopen?: (conversationId: string) => void
  onAssign?: (conversationId: string) => void
  onReassign?: (conversationId: string) => void
  onApproveSuggestion?: (messageId: string) => void
  className?: string
}

const modeOptions: Array<{ mode: ResponseMode; label: string }> = [
  { mode: 'automatic', label: 'IA responde' },
  { mode: 'assisted', label: 'IA sugere' },
  { mode: 'manual', label: 'Só atendente' },
]

const actionButton = portalButtonClasses('ghost', 'px-3')
const fieldClasses =
  'h-10 w-full rounded-lg border border-yx-line-strong bg-yx-surface px-2 text-[13px] text-yx-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue'

const prefersWideLayout = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1024px)').matches

/** Conversa aberta no portal: cabeçalho com ações reais, mensagens e painel de contexto (contato, CRM, etiquetas). */
export function PortalConversationDetails({
  conversation,
  messages,
  onModeChange,
  onHandoff,
  onResolve,
  onReopen,
  onAssign,
  onReassign,
  onApproveSuggestion,
  className,
}: PortalConversationDetailsProps) {
  const portalPath = usePortalWorkspacePath()
  const [showContext, setShowContext] = useState(prefersWideLayout)
  const [lead, setLead] = useState<CrmLead | null>(null)
  const [stages, setStages] = useState<CrmPipelineStage[]>([])
  const [loadingCrm, setLoadingCrm] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const timelineRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Rola só a lista de mensagens (scrollIntoView também moveria a página inteira no celular).
    const timeline = timelineRef.current
    if (timeline) timeline.scrollTop = timeline.scrollHeight
  }, [messages, conversation?.id])

  useEffect(() => {
    setTags(conversation?.tags || [])
  }, [conversation?.tags])

  const leadId = conversation?.contact?.leadId
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!leadId) {
        setLead(null)
        setStages([])
        return
      }
      try {
        setLoadingCrm(true)
        const { data: leadData, error: leadError } = await crmOpsDataClient.from('leads').select('*').eq('id', leadId).single()
        if (leadError) throw leadError
        const { data: stagesData, error: stagesError } = await crmOpsDataClient
          .from('crm_pipeline_stages')
          .select('*')
          .eq('pipeline_id', leadData.pipeline_id)
          .eq('is_active', true)
          .order('order_index')
        if (stagesError) throw stagesError
        if (cancelled) return
        setLead(mapLead(leadData))
        setStages(stagesData.map(mapStage))
      } catch (error) {
        console.error('Erro ao carregar o CRM da conversa:', error)
      } finally {
        if (!cancelled) setLoadingCrm(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [leadId])

  if (!conversation) {
    return (
      <div className={cn('grid place-items-center bg-yx-surface-2 p-8 text-center', className)}>
        <div className="space-y-2">
          <MessageSquare aria-hidden="true" className="mx-auto h-9 w-9 text-yx-fg-3" />
          <p className="text-sm font-semibold text-yx-fg">Nenhuma conversa selecionada</p>
          <p className="mx-auto max-w-[36ch] text-[13px] text-yx-fg-2">Escolha uma conversa na caixa de entrada para ler e responder.</p>
        </div>
      </div>
    )
  }

  const handleStageChange = async (newStageId: string) => {
    if (!lead) return
    const selectedStage = stages.find(stage => stage.id === newStageId)
    if (!selectedStage) return
    try {
      setLoadingCrm(true)
      const now = new Date().toISOString()
      const { error } = await crmOpsDataClient
        .from('leads')
        .update({
          stage_id: selectedStage.id,
          stage: selectedStage.isWon ? 'WON' : selectedStage.isLost ? 'LOST' : 'NEW',
          status: selectedStage.isWon ? 'won' : selectedStage.isLost ? 'lost' : 'open',
          won_at: selectedStage.isWon ? now : null,
          lost_at: selectedStage.isLost ? now : null,
          last_activity_at: now,
        })
        .eq('id', lead.id)
      if (error) throw error
      setLead(prev => (prev ? { ...prev, stageId: selectedStage.id, status: selectedStage.isWon ? 'won' : selectedStage.isLost ? 'lost' : 'open' } : null))
      toast.success('Etapa do lead atualizada')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível atualizar a etapa')
    } finally {
      setLoadingCrm(false)
    }
  }

  const handleAddTag = async () => {
    const trimmed = newTag.trim().toLowerCase()
    if (!trimmed || tags.includes(trimmed)) return
    try {
      const { error } = await omnichannelDataClient.from('conversation_tags').insert({ conversation_id: conversation.id, tag: trimmed })
      if (error) throw error
      setTags(prev => [...prev, trimmed])
      setNewTag('')
      toast.success('Etiqueta adicionada')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível salvar a etiqueta')
    }
  }

  const handleRemoveTag = async (tag: string) => {
    try {
      const { error } = await omnichannelDataClient.from('conversation_tags').delete().eq('conversation_id', conversation.id).eq('tag', tag)
      if (error) throw error
      setTags(prev => prev.filter(item => item !== tag))
      toast.success('Etiqueta removida')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível remover a etiqueta')
    }
  }

  const contactName = conversation.contact?.displayName || conversation.subject || 'Contato'
  const resolved = conversation.status === 'resolved'
  const overdue = conversation.status === 'waiting_human'
    && Boolean(conversation.slaDeadlineAt)
    && new Date(conversation.slaDeadlineAt as string).getTime() < Date.now()

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <header className="shrink-0 space-y-3 border-b border-yx-line bg-yx-surface p-3 sm:px-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-yx-line-strong bg-yx-blue-soft font-display text-sm font-semibold text-yx-blue"
          >
            {contactName[0]?.toUpperCase() || '?'}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-[15px] font-semibold text-yx-fg">{contactName}</h2>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-yx-fg-3">
              <span>{conversationStatusLabel(conversation.status)}</span>
              <span aria-hidden="true">·</span>
              <span>{channelLabel(conversation.channel)}</span>
            </p>
          </div>
          <button
            type="button"
            aria-pressed={showContext}
            onClick={() => setShowContext(current => !current)}
            className={portalButtonClasses('ghost', 'shrink-0 px-3')}
          >
            <PanelRight aria-hidden="true" />
            {showContext ? 'Ocultar contexto' : 'Ver contexto'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onModeChange ? (
            <div role="group" aria-label="Quem responde" className="inline-flex rounded-lg border border-yx-line-strong bg-yx-surface-2 p-0.5">
              {modeOptions.map(option => (
                <button
                  key={option.mode}
                  type="button"
                  aria-pressed={conversation.responseMode === option.mode}
                  onClick={() => onModeChange(conversation.id, option.mode)}
                  className={cn(
                    'min-h-10 rounded-md px-2.5 text-[12.5px] font-semibold transition-colors sm:min-h-8',
                    portalFocusRing,
                    conversation.responseMode === option.mode ? 'bg-yx-surface text-yx-blue shadow-sm' : 'text-yx-fg-2 hover:text-yx-fg',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
          {!resolved && !conversation.assignedUser && onAssign ? (
            <button type="button" onClick={() => onAssign(conversation.id)} className={actionButton}>Assumir conversa</button>
          ) : null}
          {!resolved && conversation.assignedUser && onReassign ? (
            <button type="button" onClick={() => onReassign(conversation.id)} className={actionButton}>Reatribuir</button>
          ) : null}
          {!resolved && conversation.status !== 'waiting_human' && onHandoff ? (
            <button type="button" onClick={() => onHandoff(conversation.id)} className={actionButton}>Transferir para atendente</button>
          ) : null}
          {!resolved && onResolve ? (
            <button type="button" onClick={() => onResolve(conversation.id)} className={portalButtonClasses('primary', 'px-3')}>
              <Check aria-hidden="true" />
              Resolver
            </button>
          ) : null}
          {resolved && onReopen ? (
            <button type="button" onClick={() => onReopen(conversation.id)} className={actionButton}>Reabrir</button>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div
          ref={timelineRef}
          className={cn(
            'min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain bg-yx-surface-2 p-3 sm:p-4',
            showContext ? 'hidden lg:flex' : 'flex',
          )}
        >
          {messages.length === 0 ? (
            <div className="grid flex-1 place-items-center text-center">
              <p className="rounded-full border border-yx-line bg-yx-surface px-3 py-1.5 text-xs text-yx-fg-2">Nenhuma mensagem nesta conversa.</p>
            </div>
          ) : (
            messages.map(message => {
              const outbound = message.direction === 'outbound'
              const suggestion = message.authorType === 'ai' && message.deliveryStatus === 'queued'
              const system = message.authorType === 'system' || message.contentType === 'system'

              if (system) {
                return (
                  <div key={message.id} className="flex justify-center">
                    <span className="rounded-full border border-yx-line bg-yx-surface px-2.5 py-1 text-[11px] font-medium text-yx-fg-2">{message.body}</span>
                  </div>
                )
              }

              if (suggestion) {
                return (
                  <div key={message.id} className="mr-auto max-w-[92%] space-y-2.5 rounded-xl border-2 border-dashed border-brand-violet-400 bg-yx-surface p-3.5 text-[13px] sm:max-w-[85%]">
                    <p className="flex items-center gap-1.5 font-semibold text-brand-violet-500">
                      <Bot aria-hidden="true" className="h-4 w-4" />
                      Sugestão de resposta da IA, aguardando aprovação
                    </p>
                    <p className="whitespace-pre-wrap border-l-2 border-yx-line-strong pl-2 leading-relaxed text-yx-fg-2">{message.body}</p>
                    {onApproveSuggestion ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => onApproveSuggestion(message.id)} className={portalButtonClasses('yux', 'px-3')}>
                          <Check aria-hidden="true" />
                          Aprovar e enviar
                        </button>
                        <span className="text-xs text-yx-fg-3">Ou escreva outra resposta no campo abaixo.</span>
                      </div>
                    ) : null}
                  </div>
                )
              }

              const delivery = outbound ? messageDeliveryLabel(message.deliveryStatus) : ''
              return (
                <div key={message.id} className={cn('flex', outbound ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[88%] rounded-xl border px-3 py-2 text-[13.5px] text-yx-fg sm:max-w-[75%]',
                      outbound
                        ? message.authorType === 'ai'
                          ? 'border-yx-line-strong bg-yx-surface'
                          : 'border-transparent bg-yx-blue-soft'
                        : 'border-yx-line bg-yx-surface',
                    )}
                  >
                    <p className="mb-0.5 flex items-center gap-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] text-yx-fg-3">
                      {message.authorType === 'ai' ? <Bot aria-hidden="true" className="h-3 w-3" /> : null}
                      {messageAuthorLabel(message.authorType)}
                    </p>
                    {message.body ? <p className="whitespace-pre-wrap break-words leading-relaxed">{message.body}</p> : null}
                    {message.attachments?.length ? (
                      <ul className="mt-2 list-none space-y-1.5 border-t border-yx-line p-0 pt-1.5">
                        {message.attachments.map(attachment => (
                          <li key={attachment.id} className="flex items-center gap-2 rounded-md border border-yx-line bg-yx-surface-2 p-2 text-xs">
                            <Paperclip aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-yx-fg-3" />
                            <span className="min-w-0 flex-1 truncate font-medium">{attachment.filename}</span>
                            <span className="shrink-0 text-yx-fg-3">{(attachment.byteSize / 1024).toFixed(1)} KB</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="mt-1.5 flex items-center justify-end gap-1.5 text-[11px] text-yx-fg-3">
                      <span>{new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                      {delivery ? <span>{delivery}</span> : null}
                      {outbound ? (message.deliveryStatus === 'read' ? <CheckCheck aria-hidden="true" className="h-3 w-3 text-yx-blue" /> : <Check aria-hidden="true" className="h-3 w-3" />) : null}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {showContext ? (
          <aside
            aria-label="Contexto da conversa"
            className="min-h-0 w-full shrink-0 divide-y divide-yx-line overflow-y-auto border-l border-yx-line bg-yx-surface text-[13px] text-yx-fg-2 lg:w-72"
          >
            <section className="space-y-2.5 p-4">
              <h3 className="flex items-center gap-1.5 font-display text-sm font-semibold text-yx-fg">
                <User aria-hidden="true" className="h-4 w-4 text-yx-blue" />
                Dados do contato
              </h3>
              <p className="flex items-center gap-2"><Phone aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-yx-fg-3" />{conversation.contact?.phone || 'Sem telefone'}</p>
              <p className="flex items-center gap-2"><Mail aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-yx-fg-3" /><span className="truncate">{conversation.contact?.email || 'Sem e-mail'}</span></p>
              <p className="flex items-center gap-2"><Building aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-yx-fg-3" />{lead?.company || 'Sem empresa vinculada'}</p>
            </section>

            <section className="space-y-2.5 p-4">
              <h3 className="font-display text-sm font-semibold text-yx-fg">Atendimento</h3>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                <dt className="text-yx-fg-3">Quem responde</dt>
                <dd className="text-right font-medium text-yx-fg">{responseModeLabel(conversation.responseMode)}</dd>
                <dt className="text-yx-fg-3">Responsável</dt>
                <dd className="text-right font-medium text-yx-fg">{conversation.assignedUser?.name || 'Ninguém ainda'}</dd>
                <dt className="text-yx-fg-3">Fila</dt>
                <dd className="text-right font-medium text-yx-fg">{conversation.queue?.name || 'Sem fila'}</dd>
                <dt className="text-yx-fg-3">Equipe</dt>
                <dd className="text-right font-medium text-yx-fg">{conversation.team?.name || 'Sem equipe'}</dd>
              </dl>
              {overdue ? (
                <p role="status" className="flex items-center gap-1.5 rounded-lg border border-yx-crit-line bg-yx-crit-soft px-2.5 py-2 text-xs font-semibold text-yx-crit">
                  <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
                  O prazo de resposta desta conversa passou.
                </p>
              ) : null}
            </section>

            <section className="space-y-2.5 p-4">
              <h3 className="font-display text-sm font-semibold text-yx-fg">Oportunidade no CRM</h3>
              {loadingCrm ? (
                <p className="text-xs text-yx-fg-3">Carregando dados do CRM...</p>
              ) : lead ? (
                <div className="space-y-2.5 rounded-lg border border-yx-line bg-yx-surface-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-yx-fg">{lead.name}</span>
                    <StatusChip variant={lead.status === 'won' ? 'ok' : lead.status === 'lost' ? 'crit' : 'neutral'}>
                      {lead.status === 'won' ? 'Ganho' : lead.status === 'lost' ? 'Perdido' : 'Em aberto'}
                    </StatusChip>
                  </div>
                  {lead.value !== undefined ? <p className="font-semibold text-yx-ok">{formatPortalCurrency(lead.value)}</p> : null}
                  {stages.length > 0 ? (
                    <label className="block space-y-1">
                      <span className="font-mono text-[11px] uppercase tracking-[0.07em] text-yx-fg-3">Etapa do funil</span>
                      <select value={lead.stageId} onChange={event => handleStageChange(event.target.value)} className={fieldClasses}>
                        {stages.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
                      </select>
                    </label>
                  ) : null}
                  <Link to={portalPath('/portal/comercial/leads')} className="inline-flex min-h-10 items-center font-semibold text-yx-blue hover:text-yx-blue-ink sm:min-h-0">
                    Abrir em Leads
                  </Link>
                </div>
              ) : (
                <div className="space-y-2 rounded-lg border border-dashed border-yx-line-strong p-3 text-center">
                  <p className="text-xs">Nenhum lead está vinculado a este contato.</p>
                  <Link to={portalPath('/portal/comercial/leads')} className={portalButtonClasses('ghost')}>
                    Ir para Leads
                  </Link>
                </div>
              )}
            </section>

            <section className="space-y-2.5 p-4">
              <h3 className="flex items-center gap-1.5 font-display text-sm font-semibold text-yx-fg">
                <Tag aria-hidden="true" className="h-4 w-4 text-yx-blue" />
                Etiquetas
              </h3>
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                {tags.map(tag => (
                  <li key={tag} className="inline-flex items-center gap-1 rounded-full border border-yx-line-strong bg-yx-surface-2 py-0.5 pl-2.5 pr-1 text-xs text-yx-fg">
                    {tag}
                    <button
                      type="button"
                      aria-label={`Remover etiqueta ${tag}`}
                      onClick={() => handleRemoveTag(tag)}
                      className={cn('grid h-6 w-6 place-items-center rounded-full text-yx-fg-3 hover:text-yx-crit', portalFocusRing)}
                    >
                      <X aria-hidden="true" className="h-3 w-3" />
                    </button>
                  </li>
                ))}
                {tags.length === 0 ? <li className="text-xs text-yx-fg-3">Nenhuma etiqueta.</li> : null}
              </ul>
              <div className="flex gap-2">
                <input
                  type="text"
                  aria-label="Nova etiqueta"
                  placeholder="Nova etiqueta"
                  value={newTag}
                  onChange={event => setNewTag(event.target.value)}
                  onKeyDown={event => event.key === 'Enter' && handleAddTag()}
                  className={fieldClasses}
                />
                <button type="button" aria-label="Adicionar etiqueta" onClick={handleAddTag} className={portalButtonClasses('ghost', 'w-10 shrink-0 px-0')}>
                  <Plus aria-hidden="true" />
                </button>
              </div>
            </section>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
