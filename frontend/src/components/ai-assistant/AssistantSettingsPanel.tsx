import { useState, useEffect, useId } from 'react'
import {
  Bot, Sparkles, Volume2, Plus,
  Save, ArrowRight, ArrowLeft, BookOpen, FileText, DollarSign, CheckCheck, X
} from 'lucide-react'
import { StatusChip, portalButtonClasses } from '@/components/portal-ui'
import { portalFocusRing } from '@/components/portal-ui/buttonStyles'
import { aiAssistantDataClient } from '@/lib/aiAssistantDataClient'
import { statusLabel } from '@/lib/client-portal/portalDisplay'
import { cn } from '@/lib/utils'
import { usePlatformStore } from '@/stores/platformStore'
import toast from 'react-hot-toast'
import type { AiAssistantRole, AiAssistantSettings } from '@/types/aiAssistant'

const PRODUCT_PREFIX = '[PRODUTO]'

const labelCls = 'block space-y-1'
const labelTextCls = 'block text-[13px] font-semibold text-yx-fg'
const fieldCls =
  'h-10 w-full rounded-lg border border-yx-line-strong bg-yx-surface px-3 text-[13px] text-yx-fg placeholder:text-yx-fg-3 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue focus-visible:ring-offset-2 focus-visible:ring-offset-yx-surface'
const cardCls = 'rounded-[10px] border border-yx-line bg-yx-surface p-4 text-yx-fg shadow-[0_1px_2px_rgba(14,17,32,0.04)] dark:shadow-none'

interface AssistantSettingsPanelProps {
  organizationId: string
  assistant?: AiAssistantSettings | null
  onSaveAssistant?: (organizationId: string) => void
  /**
   * `portal`: tela do cliente, largura total e sem campos técnicos (só para papéis internos, em "Detalhes técnicos").
   * `internal` (padrão): Hub interno, com todos os campos.
   */
  variant?: 'portal' | 'internal'
}

export function AssistantSettingsPanel({
  organizationId,
  assistant,
  onSaveAssistant,
  variant = 'internal',
}: AssistantSettingsPanelProps) {
  const idPrefix = useId()
  const isInternalRole = usePlatformStore(state => state.role?.scope === 'internal')
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)

  // Step 1: Identity fields
  const [agentName, setAgentName] = useState('Sofia')
  const [companyName, setCompanyName] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [tone, setTone] = useState('consultivo')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [assistantRole, setAssistantRole] = useState<AiAssistantRole>('sdr')
  const [strategyProfileId, setStrategyProfileId] = useState('')
  const [routingPriority, setRoutingPriority] = useState(100)
  const [roleLockMinutes, setRoleLockMinutes] = useState(30)

  // Step 2: Capabilities / Media checkboxes
  const [understandVoice, setUnderstandVoice] = useState(true)
  const [understandImages, setUnderstandImages] = useState(true)
  const [understandFiles, setUnderstandFiles] = useState(true)
  const [understandVideos, setUnderstandVideos] = useState(false)

  // Step 3: Handoff & Routing
  const [confidenceThreshold, setConfidenceThreshold] = useState(80) // slider 0-100
  const [escapeKeywords, setEscapeKeywords] = useState('humano, atendente, falar com pessoa, ajuda, suporte')
  const [outOfHoursBehavior, setOutOfHoursBehavior] = useState('unavailability_message')
  const [handoffQueueId, setHandoffQueueId] = useState('')
  const [moveCrmStage, setMoveCrmStage] = useState(true)

  // Step 4: Unified Knowledge & Product Catalog
  const [availableKnowledge, setAvailableKnowledge] = useState<any[]>([])
  const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState<string[]>([])

  // Product Catalog modal / list
  const [products, setProducts] = useState<Array<{ name: string; price: string; desc: string; link: string }>>([])
  const [newProdName, setNewProdName] = useState('')
  const [newProdPrice, setNewProdPrice] = useState('')
  const [newProdDesc, setNewProdDesc] = useState('')
  const [newProdLink, setNewProdLink] = useState('')
  const [showAddProduct, setShowAddProduct] = useState(false)

  // Queues list for selection
  const [queues, setQueues] = useState<any[]>([])

  // Load queues
  useEffect(() => {
    const fetchQueues = async () => {
      try {
        const { data, error } = await aiAssistantDataClient
          .from('conversation_queues')
          .select('id, name')
          .eq('organization_id', organizationId)
          .eq('is_active', true)
        if (error) throw error
        setQueues(data || [])
        if (data && data.length > 0) setHandoffQueueId(data[0].id)
      } catch (e) {
        console.error(e)
      }
    }
    fetchQueues()
  }, [organizationId])

  // Load client's unified knowledge entries
  useEffect(() => {
    const fetchKnowledge = async () => {
      try {
        const { data, error } = await aiAssistantDataClient
          .from('knowledge_entries')
          .select('id, title, body, status')
          .eq('organization_id', organizationId)
        if (error) throw error
        setAvailableKnowledge(data || [])
      } catch (e) {
        console.error(e)
      }
    }
    fetchKnowledge()
  }, [organizationId])

  // Load assistant data on mount/change
  useEffect(() => {
    if (assistant) {
      setAgentName(assistant.name || 'Sofia')
      setTone(assistant.tone || 'consultivo')
      setAssistantRole(assistant.assistantRole || 'sdr')
      setStrategyProfileId(assistant.strategyProfileId || '')
      setRoutingPriority(assistant.routingPriority || 100)
      setRoleLockMinutes(Number(assistant.routingMetadata?.lockRoleMinutes || 30))

      // Load prompt from safety rules
      const promptRule = assistant.safetyRules.find(r => r.ruleType === 'system_prompt')
      if (promptRule) setSystemPrompt(promptRule.instructions)

      // Load profile metadata
      const profileRule = assistant.safetyRules.find(r => r.ruleType === 'company_profile')
      if (profileRule) {
        try {
          const profile = JSON.parse(profileRule.instructions)
          setCompanyName(profile.companyName || '')
          setWebsiteUrl(profile.websiteUrl || '')
        } catch {
          // Fallback if raw text
          setCompanyName(profileRule.instructions)
        }
      }

      // Load capabilities
      const capRule = assistant.safetyRules.find(r => r.ruleType === 'capabilities')
      if (capRule) {
        try {
          const caps = JSON.parse(capRule.instructions)
          setUnderstandVoice(caps.understandVoice ?? true)
          setUnderstandImages(caps.understandImages ?? true)
          setUnderstandFiles(caps.understandFiles ?? true)
          setUnderstandVideos(caps.understandVideos ?? false)
        } catch {
          // Keep the safe capability defaults when legacy metadata is not valid JSON.
        }
      }

      // Load handoff rules
      const keywordsRule = assistant.handoffRules.find(r => r.ruleType === 'human_request')
      if (keywordsRule && keywordsRule.conditions?.keywords) {
        const kws = keywordsRule.conditions.keywords
        if (Array.isArray(kws)) {
          setEscapeKeywords(kws.join(', '))
        }
      }

      const confRule = assistant.handoffRules.find(r => r.ruleType === 'low_confidence')
      if (confRule && confRule.minConfidence !== undefined) {
        setConfidenceThreshold(Math.round(Number(confRule.minConfidence) * 100))
      }

      // Load linked knowledge entries
      const linkedIds = assistant.knowledgeLinks
        .map(link => link.knowledgeEntryId)
        .filter(Boolean) as string[]
      setSelectedKnowledgeIds(linkedIds)
    }
  }, [assistant])

  // Add Product to catalog & unified knowledge database
  const handleAddProduct = async () => {
    if (!newProdName.trim() || !newProdPrice.trim()) {
      toast.error('Preencha pelo menos o nome e o preço do produto')
      return
    }

    try {
      setSaving(true)
      // Save product as a unified knowledge entry
      const { data, error } = await aiAssistantDataClient
        .from('knowledge_entries')
        .insert({
          organization_id: organizationId,
          title: `${PRODUCT_PREFIX} ${newProdName.trim()}`,
          body: `Nome: ${newProdName.trim()}\nPreço: ${newProdPrice.trim()}\nDescrição: ${newProdDesc.trim()}\nLink: ${newProdLink.trim()}`,
          status: 'published'
        })
        .select()
        .single()

      if (error) throw error

      // Append to local state list
      setProducts(prev => [...prev, {
        name: newProdName.trim(),
        price: newProdPrice.trim(),
        desc: newProdDesc.trim(),
        link: newProdLink.trim()
      }])

      // Link it to the assistant selection
      setSelectedKnowledgeIds(prev => [...prev, data.id])

      // Update available knowledge list
      setAvailableKnowledge(prev => [...prev, data])

      // Clean form
      setNewProdName('')
      setNewProdPrice('')
      setNewProdDesc('')
      setNewProdLink('')
      setShowAddProduct(false)
      toast.success('Produto adicionado e vinculado à base de conhecimento')
    } catch (e) {
      console.error(e)
      toast.error('Não foi possível cadastrar o produto. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  // Handle master save
  const handleSave = async () => {
    if (!agentName.trim()) {
      toast.error('O nome do agente é obrigatório')
      return
    }
    try {
      setSaving(true)
      let assistantId = assistant?.id

      // 1. Upsert AI assistant row
      const assistantPayload = {
        organization_id: organizationId,
        name: agentName.trim(),
        tone: tone,
        status: 'active',
        assistant_role: assistantRole,
        strategy_profile_id: strategyProfileId || null,
        routing_priority: routingPriority,
        routing_metadata: { lockRoleMinutes: roleLockMinutes },
        summary_enabled: true,
        classification_enabled: true,
        updated_at: new Date().toISOString()
      }

      if (assistantId && assistantId !== 'new') {
        const { error } = await aiAssistantDataClient
          .from('ai_assistants')
          .update(assistantPayload)
          .eq('id', assistantId)
        if (error) throw error
      } else {
        const { data, error } = await aiAssistantDataClient
          .from('ai_assistants')
          .insert({ ...assistantPayload, id: undefined })
          .select()
          .single()
        if (error) throw error
        assistantId = data.id
      }

      // 2. Save Handoff Rules (clean delete & insert)
      await aiAssistantDataClient.from('ai_assistant_handoff_rules').delete().eq('assistant_id', assistantId)

      const keywords = escapeKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
      const handoffRulesPayload = [
        {
          assistant_id: assistantId,
          name: 'Pedido de atendente',
          rule_type: 'human_request',
          conditions: { keywords, outOfHoursBehavior, handoffQueueId, moveCrmStage },
          is_enabled: true
        },
        {
          assistant_id: assistantId,
          name: 'Confiança baixa do agente',
          rule_type: 'low_confidence',
          conditions: {},
          min_confidence: Number(confidenceThreshold / 100),
          is_enabled: true
        }
      ]
      const { error: handoffError } = await aiAssistantDataClient.from('ai_assistant_handoff_rules').insert(handoffRulesPayload)
      if (handoffError) throw handoffError

      // 3. Save Safety Rules / Metadata (clean delete & insert)
      await aiAssistantDataClient.from('ai_assistant_safety_rules').delete().eq('assistant_id', assistantId)

      const safetyRulesPayload = [
        {
          assistant_id: assistantId,
          name: 'Instruções do Sistema',
          rule_type: 'system_prompt',
          instructions: systemPrompt.trim(),
          severity: 'medium',
          is_enabled: true
        },
        {
          assistant_id: assistantId,
          name: 'Perfil da Empresa',
          rule_type: 'company_profile',
          instructions: JSON.stringify({ companyName: companyName.trim(), websiteUrl: websiteUrl.trim() }),
          severity: 'medium',
          is_enabled: true
        },
        {
          assistant_id: assistantId,
          name: 'Habilidades de Mídia',
          rule_type: 'capabilities',
          instructions: JSON.stringify({ understandVoice, understandImages, understandFiles, understandVideos }),
          severity: 'medium',
          is_enabled: true
        }
      ]
      const { error: safetyError } = await aiAssistantDataClient.from('ai_assistant_safety_rules').insert(safetyRulesPayload)
      if (safetyError) throw safetyError

      // 4. Save Knowledge Links (clean delete & insert)
      await aiAssistantDataClient.from('ai_assistant_knowledge_links').delete().eq('assistant_id', assistantId)

      if (selectedKnowledgeIds.length > 0) {
        const linksPayload = selectedKnowledgeIds.map(entryId => ({
          assistant_id: assistantId,
          knowledge_entry_id: entryId
        }))
        const { error: linksError } = await aiAssistantDataClient.from('ai_assistant_knowledge_links').insert(linksPayload)
        if (linksError) throw linksError
      }

      toast.success('Agente de IA salvo e ativado.')
      if (onSaveAssistant) onSaveAssistant(organizationId)
    } catch (e) {
      console.error(e)
      toast.error('Não foi possível salvar a configuração do agente. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  // Toggle selection of knowledge entry
  const handleToggleKnowledge = (entryId: string) => {
    setSelectedKnowledgeIds(prev =>
      prev.includes(entryId) ? prev.filter(id => id !== entryId) : [...prev, entryId]
    )
  }

  const showTechnical = variant === 'internal' || isInternalRole
  const technicalFields = (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={labelCls}>
        <span className={labelTextCls}>Perfil estratégico (ID)</span>
        <input value={strategyProfileId} onChange={e => setStrategyProfileId(e.target.value)} placeholder="Opcional: UUID do perfil estratégico" className={fieldCls} />
      </label>
      <label className={labelCls}>
        <span className={labelTextCls}>Prioridade de roteamento</span>
        <input type="number" value={routingPriority} onChange={e => setRoutingPriority(Number(e.target.value || 100))} className={fieldCls} />
      </label>
      <label className={labelCls}>
        <span className={labelTextCls}>Tempo para manter o mesmo papel (minutos)</span>
        <input type="number" value={roleLockMinutes} onChange={e => setRoleLockMinutes(Number(e.target.value || 30))} className={fieldCls} />
      </label>
    </div>
  )

  const stepTitles = ['1. Identidade', '2. Habilidades', '3. Gatilhos e transferência', '4. Conhecimento']
  const capabilities = [
    { checked: understandVoice, set: setUnderstandVoice, icon: Volume2, title: 'Compreender áudios (voz)', hint: 'O agente transcreve e interpreta mensagens de voz enviadas no WhatsApp.' },
    { checked: understandImages, set: setUnderstandImages, icon: CheckCheck, title: 'Compreender imagens e fotos', hint: 'Permite ao agente analisar fotos de produtos ou comprovantes enviados.' },
    { checked: understandFiles, set: setUnderstandFiles, icon: FileText, title: 'Compreender arquivos (PDF e documentos)', hint: 'O agente lê o conteúdo de PDFs ou planilhas anexadas.' },
    { checked: understandVideos, set: setUnderstandVideos, icon: Bot, title: 'Compreender vídeos', hint: 'Analisa quadros e a transcrição do áudio de vídeos curtos.' },
  ]

  return (
    <section aria-label="Configuração do agente de IA" className={cn('space-y-4', variant === 'internal' && 'mx-auto max-w-4xl')}>
      <div className={cardCls}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-yx-line pb-3">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold tracking-[-0.01em] text-yx-fg">
            <Sparkles aria-hidden="true" className="h-4 w-4 text-yx-blue" />
            {variant === 'portal' ? 'Passo a passo da configuração' : 'Configurar agente de IA comercial'}
          </h3>
          <StatusChip>Etapa {step} de 4</StatusChip>
        </div>
        <div role="group" aria-label="Etapas da configuração" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stepTitles.map((title, index) => (
            <button
              key={title}
              type="button"
              onClick={() => setStep(index + 1)}
              aria-current={step === index + 1 ? 'step' : undefined}
              className={cn(
                'min-h-10 rounded-lg border px-2 py-1.5 text-center text-[13px] font-semibold transition-colors',
                portalFocusRing,
                step === index + 1
                  ? 'border-yx-blue bg-yx-blue-soft text-yx-blue'
                  : 'border-yx-line-strong bg-yx-surface-2 text-yx-fg-2 hover:text-yx-fg',
              )}
            >
              {title}
            </button>
          ))}
        </div>
      </div>

      <div className={cn(cardCls, 'min-h-[300px]')}>
        {step === 1 && (
          <div className="space-y-4">
            <StepHeader title="Identidade e instruções do agente" description="Defina a persona do agente e as instruções que guiam as respostas." />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelCls}>
                <span className={labelTextCls}>Nome do atendente virtual</span>
                <input value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="Ex.: Sofia, Lucas" className={fieldCls} />
              </label>
              <label className={labelCls}>
                <span className={labelTextCls}>Tom de voz principal</span>
                <select value={tone} onChange={e => setTone(e.target.value)} className={fieldCls}>
                  <option value="consultivo">Consultivo (orienta e sugere soluções)</option>
                  <option value="objetivo">Objetivo (direto ao ponto, respostas curtas)</option>
                  <option value="acolhedor">Acolhedor (empático e amigável)</option>
                  <option value="premium">Premium (formal, refinado e polido)</option>
                </select>
              </label>
              <label className={labelCls}>
                <span className={labelTextCls}>Nome da empresa</span>
                <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Ex.: Minha Empresa" className={fieldCls} />
              </label>
              <label className={labelCls}>
                <span className={labelTextCls}>Site oficial de referência</span>
                <input value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} placeholder="Ex.: https://suaempresa.com.br" className={fieldCls} />
              </label>
              <label className={labelCls}>
                <span className={labelTextCls}>Papel do agente</span>
                <select value={assistantRole} onChange={e => setAssistantRole(e.target.value as AiAssistantRole)} className={fieldCls}>
                  <option value="sdr">Comercial: primeiro contato</option>
                  <option value="closer">Comercial: fechamento</option>
                  <option value="support">Suporte receptivo</option>
                  <option value="retention">Retenção e pós-venda</option>
                  <option value="custom">Personalizado</option>
                </select>
              </label>
            </div>

            {showTechnical ? (
              variant === 'portal' ? (
                <details className="rounded-lg border border-yx-line bg-yx-surface-2 p-3">
                  <summary className={cn('cursor-pointer rounded text-[13px] font-semibold text-yx-fg', portalFocusRing)}>Detalhes técnicos</summary>
                  <div className="mt-3">{technicalFields}</div>
                </details>
              ) : (
                technicalFields
              )
            ) : null}

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <label htmlFor={`${idPrefix}-instructions`} className={labelTextCls}>Instruções do agente</label>
                <span className="text-xs text-yx-fg-3">{systemPrompt.length} {systemPrompt.length === 1 ? 'caractere' : 'caracteres'}</span>
              </div>
              <textarea
                id={`${idPrefix}-instructions`}
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                rows={6}
                placeholder="Escreva as regras do agente. Ex.: 'Você atende clientes da empresa X. Nunca ofereça descontos sem autorização. Sempre convide o cliente a agendar uma conversa.'"
                className={cn(fieldCls, 'h-auto min-h-[140px] py-2.5 leading-relaxed')}
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <StepHeader title="Habilidades e mídias aceitas" description="Ative o que o agente pode entender nas conversas com seus clientes." />
            <div className="grid gap-3 sm:grid-cols-2">
              {capabilities.map(({ checked, set, icon: Icon, title, hint }) => (
                <label key={title} className="flex cursor-pointer items-start gap-3 rounded-lg border border-yx-line bg-yx-surface p-3 hover:bg-yx-surface-2">
                  <input type="checkbox" checked={checked} onChange={e => set(e.target.checked)} className="mt-0.5 h-4 w-4 accent-yx-blue" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold text-yx-fg">
                      <Icon aria-hidden="true" className="h-4 w-4 text-yx-blue" />
                      {title}
                    </span>
                    <span className="mt-0.5 block text-xs text-yx-fg-3">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <StepHeader title="Gatilhos e transferência para atendente" description="Defina em quais situações o agente passa a conversa para uma pessoa da equipe." />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor={`${idPrefix}-confidence`} className={labelTextCls}>Confiança mínima do agente: {confidenceThreshold}%</label>
                <input
                  id={`${idPrefix}-confidence`}
                  type="range"
                  min="50"
                  max="95"
                  value={confidenceThreshold}
                  onChange={e => setConfidenceThreshold(Number(e.target.value))}
                  className="h-6 w-full cursor-pointer accent-yx-blue"
                />
                <p className="text-xs text-yx-fg-3">Transfere para um atendente se a confiança da resposta cair abaixo de {confidenceThreshold}%.</p>
              </div>

              <label className={labelCls}>
                <span className={labelTextCls}>Palavras que pedem um atendente (separadas por vírgula)</span>
                <input value={escapeKeywords} onChange={e => setEscapeKeywords(e.target.value)} placeholder="Ex.: atendente, falar com pessoa" className={fieldCls} />
              </label>

              <label className={labelCls}>
                <span className={labelTextCls}>Comportamento fora do horário comercial</span>
                <select value={outOfHoursBehavior} onChange={e => setOutOfHoursBehavior(e.target.value)} className={fieldCls}>
                  <option value="unavailability_message">Informar indisponibilidade e manter com o agente</option>
                  <option value="queue_handoff">Informar e enviar para a fila de urgência</option>
                  <option value="ai_only">Deixar o agente responder 24h normalmente</option>
                </select>
              </label>

              {queues.length > 0 && (
                <label className={labelCls}>
                  <span className={labelTextCls}>Fila de destino da transferência</span>
                  <select value={handoffQueueId} onChange={e => setHandoffQueueId(e.target.value)} className={fieldCls}>
                    {queues.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
                  </select>
                </label>
              )}

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-yx-line bg-yx-surface-2 p-3 sm:col-span-2">
                <input type="checkbox" checked={moveCrmStage} onChange={e => setMoveCrmStage(e.target.checked)} className="mt-0.5 h-4 w-4 accent-yx-blue" />
                <span>
                  <span className="block text-[13px] font-semibold text-yx-fg">Mover o lead no CRM ao transferir para um atendente</span>
                  <span className="mt-0.5 block text-xs text-yx-fg-3">Muda automaticamente o lead para a etapa de atendimento humano.</span>
                </span>
              </label>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <StepHeader title="Biblioteca de conhecimento e catálogo" description="Vincule materiais da empresa ao agente ou cadastre produtos." className="min-w-0 flex-1 basis-[220px]" />
              <button type="button" onClick={() => setShowAddProduct(true)} className={portalButtonClasses('ghost')}>
                <Plus aria-hidden="true" />
                Cadastrar produto
              </button>
            </div>

            {showAddProduct && (
              <div role="group" aria-label="Novo produto no catálogo" className="space-y-3 rounded-lg border border-yx-line bg-yx-surface-2 p-3">
                <div className="flex items-center justify-between gap-2 border-b border-yx-line pb-2">
                  <span className="text-[13px] font-semibold text-yx-fg">Novo produto no catálogo</span>
                  <button
                    type="button"
                    onClick={() => setShowAddProduct(false)}
                    aria-label="Fechar o cadastro de produto"
                    className={cn('inline-flex h-10 w-10 items-center justify-center rounded-lg text-yx-fg-3 hover:text-yx-fg', portalFocusRing)}
                  >
                    <X aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={labelCls}>
                    <span className={labelTextCls}>Nome do produto</span>
                    <input value={newProdName} onChange={e => setNewProdName(e.target.value)} placeholder="Ex.: Notebook Pro" className={fieldCls} />
                  </label>
                  <label className={labelCls}>
                    <span className={labelTextCls}>Preço</span>
                    <input value={newProdPrice} onChange={e => setNewProdPrice(e.target.value)} placeholder="Ex.: R$ 4.500,00" className={fieldCls} />
                  </label>
                  <label className={cn(labelCls, 'sm:col-span-2')}>
                    <span className={labelTextCls}>Link de compra ou informações</span>
                    <input value={newProdLink} onChange={e => setNewProdLink(e.target.value)} placeholder="Ex.: https://sualoja.com.br/produto" className={fieldCls} />
                  </label>
                  <label className={cn(labelCls, 'sm:col-span-2')}>
                    <span className={labelTextCls}>Descrição completa</span>
                    <textarea
                      value={newProdDesc}
                      onChange={e => setNewProdDesc(e.target.value)}
                      rows={2}
                      placeholder="Ficha técnica, cores, garantia..."
                      className={cn(fieldCls, 'h-auto py-2.5')}
                    />
                  </label>
                </div>
                <button type="button" onClick={handleAddProduct} disabled={saving} className={portalButtonClasses('primary')}>
                  Confirmar cadastro
                </button>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[13px] font-semibold text-yx-fg">
                  <BookOpen aria-hidden="true" className="h-4 w-4 text-yx-blue" />
                  Materiais e documentos da empresa
                </span>
                <span className="text-xs text-yx-fg-3">{selectedKnowledgeIds.length} {selectedKnowledgeIds.length === 1 ? 'material vinculado' : 'materiais vinculados'}</span>
              </div>
              <div className="max-h-[260px] divide-y divide-yx-line overflow-y-auto rounded-lg border border-yx-line bg-yx-surface">
                {availableKnowledge.map(entry => {
                  const isChecked = selectedKnowledgeIds.includes(entry.id)
                  const isProduct = String(entry.title).startsWith(PRODUCT_PREFIX)
                  const title = isProduct ? String(entry.title).slice(PRODUCT_PREFIX.length).trim() : entry.title
                  return (
                    <label
                      key={entry.id}
                      className={cn('flex cursor-pointer items-start gap-3 p-3 text-[13px] hover:bg-yx-surface-2', isChecked && 'bg-yx-blue-soft')}
                    >
                      <input type="checkbox" checked={isChecked} onChange={() => handleToggleKnowledge(entry.id)} className="mt-0.5 h-4 w-4 accent-yx-blue" />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          {isProduct ? (
                            <DollarSign aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-yx-ok" />
                          ) : (
                            <FileText aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-yx-fg-3" />
                          )}
                          <span className="min-w-0 truncate font-semibold text-yx-fg">{title}</span>
                          {isProduct ? <StatusChip variant="ok">Produto</StatusChip> : null}
                          <StatusChip variant={entry.status === 'published' ? 'ok' : 'neutral'}>{statusLabel(entry.status)}</StatusChip>
                        </span>
                        <span className="mt-0.5 line-clamp-1 block text-xs text-yx-fg-3">{entry.body}</span>
                      </span>
                    </label>
                  )
                })}
                {availableKnowledge.length === 0 && (
                  <p className="p-4 text-center text-[13px] text-yx-fg-3">Nenhum material cadastrado na biblioteca de conhecimento da empresa.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={cn(cardCls, 'flex flex-wrap items-center justify-between gap-2')}>
        <button type="button" disabled={step === 1 || saving} onClick={() => setStep(step - 1)} className={portalButtonClasses('ghost')}>
          <ArrowLeft aria-hidden="true" />
          Voltar
        </button>

        {step < 4 ? (
          <button type="button" onClick={() => setStep(step + 1)} className={portalButtonClasses('primary')}>
            Avançar
            <ArrowRight aria-hidden="true" />
          </button>
        ) : (
          <button type="button" disabled={saving} onClick={handleSave} className={portalButtonClasses('primary')}>
            <Save aria-hidden="true" />
            {saving ? 'Salvando...' : 'Salvar e ativar o agente'}
          </button>
        )}
      </div>
    </section>
  )
}

function StepHeader({ title, description, className }: { title: string; description: string; className?: string }) {
  return (
    <div className={cn('border-b border-yx-line pb-3', className)}>
      <h4 className="font-display text-[15px] font-semibold text-yx-fg">{title}</h4>
      <p className="mt-0.5 text-[13px] text-yx-fg-3">{description}</p>
    </div>
  )
}
