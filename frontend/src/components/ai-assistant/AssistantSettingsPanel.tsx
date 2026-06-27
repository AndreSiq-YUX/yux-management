import { useState, useEffect } from 'react'
import {
  Bot, Sparkles, Volume2, ShieldCheck, Tag, Plus, Trash2,
  Save, ArrowRight, ArrowLeft, Check, BookOpen, Link, FileText, DollarSign, CheckCheck, X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'
import type { AiAssistantRole, AiAssistantSettings, AiAssistantHandoffRule, AiAssistantSafetyRule, AiAssistantKnowledgeLink } from '@/types/aiAssistant'

interface AssistantSettingsPanelProps {
  organizationId: string
  assistant?: AiAssistantSettings | null
  onSaveAssistant?: (organizationId: string) => void
}

export function AssistantSettingsPanel({
  organizationId,
  assistant,
  onSaveAssistant,
}: AssistantSettingsPanelProps) {
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
        const { data, error } = await supabase
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
        const { data, error } = await supabase
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
        } catch(e) {
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
        } catch(e) {}
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
      toast.error('Preencha pelo menos o nome e preÃ§o do produto')
      return
    }

    try {
      setSaving(true)
      // Save product as a unified knowledge entry
      const { data, error } = await supabase
        .from('knowledge_entries')
        .insert({
          organization_id: organizationId,
          title: `[PRODUTO] ${newProdName.trim()}`,
          body: `Nome: ${newProdName.trim()}\nPreÃ§o: ${newProdPrice.trim()}\nDescriÃ§Ã£o: ${newProdDesc.trim()}\nLink: ${newProdLink.trim()}`,
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
      toast.success('Produto adicionado e integrado Ã  Base de Conhecimento')
    } catch (e) {
      console.error(e)
      toast.error('Erro ao registrar produto')
    } finally {
      setSaving(false)
    }
  }

  // Handle master save
  const handleSave = async () => {
    if (!agentName.trim()) {
      toast.error('O nome do bot Ã© obrigatÃ³rio')
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
        const { error } = await supabase
          .from('ai_assistants')
          .update(assistantPayload)
          .eq('id', assistantId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('ai_assistants')
          .insert({ ...assistantPayload, id: undefined })
          .select()
          .single()
        if (error) throw error
        assistantId = data.id
      }

      // 2. Save Handoff Rules (clean delete & insert)
      await supabase.from('ai_assistant_handoff_rules').delete().eq('assistant_id', assistantId)

      const keywords = escapeKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
      const handoffRulesPayload = [
        {
          assistant_id: assistantId,
          name: 'Palavras-chave de escape',
          rule_type: 'human_request',
          conditions: { keywords, outOfHoursBehavior, handoffQueueId, moveCrmStage },
          is_enabled: true
        },
        {
          assistant_id: assistantId,
          name: 'Limiar de confianÃ§a',
          rule_type: 'low_confidence',
          conditions: {},
          min_confidence: Number(confidenceThreshold / 100),
          is_enabled: true
        }
      ]
      const { error: handoffError } = await supabase.from('ai_assistant_handoff_rules').insert(handoffRulesPayload)
      if (handoffError) throw handoffError

      // 3. Save Safety Rules / Metadata (clean delete & insert)
      await supabase.from('ai_assistant_safety_rules').delete().eq('assistant_id', assistantId)

      const safetyRulesPayload = [
        {
          assistant_id: assistantId,
          name: 'InstruÃ§Ãµes do Sistema',
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
          name: 'Habilidades de MÃ­dia',
          rule_type: 'capabilities',
          instructions: JSON.stringify({ understandVoice, understandImages, understandFiles, understandVideos }),
          severity: 'medium',
          is_enabled: true
        }
      ]
      const { error: safetyError } = await supabase.from('ai_assistant_safety_rules').insert(safetyRulesPayload)
      if (safetyError) throw safetyError

      // 4. Save Knowledge Links (clean delete & insert)
      await supabase.from('ai_assistant_knowledge_links').delete().eq('assistant_id', assistantId)

      if (selectedKnowledgeIds.length > 0) {
        const linksPayload = selectedKnowledgeIds.map(entryId => ({
          assistant_id: assistantId,
          knowledge_entry_id: entryId
        }))
        const { error: linksError } = await supabase.from('ai_assistant_knowledge_links').insert(linksPayload)
        if (linksError) throw linksError
      }

      toast.success('Agente de IA salvo e ativado com sucesso!')
      if (onSaveAssistant) onSaveAssistant(organizationId)
    } catch (e) {
      console.error(e)
      toast.error('Erro ao salvar configuraÃ§Ãµes do assistente')
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

  return (
    <section className="space-y-4 max-w-4xl mx-auto">
      {/* Wizard Step Bar */}
      <div className="bg-white p-3 border rounded-xl shadow-sm">
        <div className="flex items-center justify-between border-b pb-2 mb-3">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
            <Sparkles className="h-4.5 w-4.5 text-yux-600 animate-pulse" />
            Configurar Agente de IA Comercial
          </h2>
          <span className="text-xs text-gray-400 font-semibold">Etapa {step} de 4</span>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-bold text-slate-500">
          <button onClick={() => setStep(1)} className={`py-1.5 rounded border ${step === 1 ? 'bg-yux-50 text-yux-700 border-yux-200' : 'bg-slate-50'}`}>1. Identidade</button>
          <button onClick={() => setStep(2)} className={`py-1.5 rounded border ${step === 2 ? 'bg-yux-50 text-yux-700 border-yux-200' : 'bg-slate-50'}`}>2. Habilidades</button>
          <button onClick={() => setStep(3)} className={`py-1.5 rounded border ${step === 3 ? 'bg-yux-50 text-yux-700 border-yux-200' : 'bg-slate-50'}`}>3. Gatilhos & Handoff</button>
          <button onClick={() => setStep(4)} className={`py-1.5 rounded border ${step === 4 ? 'bg-yux-50 text-yux-700 border-yux-200' : 'bg-slate-50'}`}>4. Conhecimento</button>
        </div>
      </div>

      {/* Main step content */}
      <div className="bg-white border rounded-xl p-4 shadow-sm min-h-[300px]">
        {/* STEP 1: IDENTITY */}
        {step === 1 && (
          <div className="space-y-3">
            <div className="border-b pb-1.5 mb-2">
              <h3 className="font-bold text-sm text-gray-900">Identidade e Prompt do Agente</h3>
              <p className="text-xs text-gray-400">Configure a persona do bot e as instruÃ§Ãµes fundamentais que guiarÃ£o as respostas.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs">
                <span className="font-semibold text-gray-700">Nome do Atendente Virtual</span>
                <Input value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="Ex: Sofia, Lucas" className="h-9" />
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-semibold text-gray-700">Tom de Voz Principal</span>
                <select
                  value={tone}
                  onChange={e => setTone(e.target.value)}
                  className="h-9 w-full rounded-md border px-2 bg-white text-xs text-gray-800"
                >
                  <option value="consultivo">Consultivo (Orienta e sugere soluÃ§Ãµes)</option>
                  <option value="objetivo">Objetivo (Direto ao ponto, respostas curtas)</option>
                  <option value="acolhedor">Acolhedor (EmpÃ¡tico e amigÃ¡vel)</option>
                  <option value="premium">Premium (Formal, refinado e polido)</option>
                </select>
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-semibold text-gray-700">Nome da Empresa</span>
                <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Ex: Portal YUX" className="h-9" />
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-semibold text-gray-700">Site Oficial de ReferÃªncia</span>
                <Input value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} placeholder="Ex: https://yux.com.br" className="h-9" />
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-semibold text-gray-700">Papel da IA</span>
                <select
                  value={assistantRole}
                  onChange={e => setAssistantRole(e.target.value as AiAssistantRole)}
                  className="h-9 w-full rounded-md border px-2 bg-white text-xs text-gray-800"
                >
                  <option value="sdr">SDR / Comercial 1</option>
                  <option value="closer">Closer</option>
                  <option value="support">Suporte receptivo</option>
                  <option value="retention">Retencao / Comercial 2</option>
                  <option value="custom">Customizado</option>
                </select>
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-semibold text-gray-700">Strategy Profile ID</span>
                <Input value={strategyProfileId} onChange={e => setStrategyProfileId(e.target.value)} placeholder="Opcional: UUID do perfil estrategico" className="h-9" />
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-semibold text-gray-700">Prioridade de Roteamento</span>
                <Input type="number" value={routingPriority} onChange={e => setRoutingPriority(Number(e.target.value || 100))} className="h-9" />
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-semibold text-gray-700">Lock de Papel (min)</span>
                <Input type="number" value={roleLockMinutes} onChange={e => setRoleLockMinutes(Number(e.target.value || 30))} className="h-9" />
              </label>
            </div>
            <div className="space-y-1 text-xs pt-1">
              <span className="font-semibold text-gray-700 flex justify-between">
                <span>InstruÃ§Ãµes de Sistema (System Prompt)</span>
                <span className="text-gray-400">{systemPrompt.length} caracteres</span>
              </span>
              <textarea
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                rows={6}
                placeholder="Insira as regras rÃ­gidas do bot. Ex: 'VocÃª Ã© um vendedor de planos da empresa X. Nunca forneÃ§a descontos sem permissÃ£o. Sempre direcione o cliente para o agendamento...'"
                className="w-full rounded-md border p-3 text-xs bg-slate-50/50 focus:ring-1 focus:ring-yux-500 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* STEP 2: CAPABILITIES */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="border-b pb-1.5 mb-2">
              <h3 className="font-bold text-sm text-gray-900">Habilidades e MÃ­dias Suportadas</h3>
              <p className="text-xs text-gray-400">Ative o que o agente de IA pode entender nas conversas com os clientes.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 pt-2">
              <label className="flex items-start gap-3 p-3 rounded-lg border hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={understandVoice}
                  onChange={e => setUnderstandVoice(e.target.checked)}
                  className="rounded border-gray-300 text-yux-600 mt-0.5 focus:ring-yux-500"
                />
                <div className="text-xs">
                  <div className="font-bold text-gray-800 flex items-center gap-1.5">
                    <Volume2 className="h-4 w-4 text-yux-600" />
                    Compreender Ãudios (Voz)
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">O bot transcreverÃ¡ e interpretarÃ¡ mensagens de voz enviadas no WhatsApp.</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg border hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={understandImages}
                  onChange={e => setUnderstandImages(e.target.checked)}
                  className="rounded border-gray-300 text-yux-600 mt-0.5 focus:ring-yux-500"
                />
                <div className="text-xs">
                  <div className="font-bold text-gray-800 flex items-center gap-1.5">
                    <CheckCheck className="h-4 w-4 text-yux-600" />
                    Compreender Imagens e Fotos
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">Permite ao bot analisar fotos de produtos ou comprovantes enviados.</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg border hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={understandFiles}
                  onChange={e => setUnderstandFiles(e.target.checked)}
                  className="rounded border-gray-300 text-yux-600 mt-0.5 focus:ring-yux-500"
                />
                <div className="text-xs">
                  <div className="font-bold text-gray-800 flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-yux-600" />
                    Compreender Arquivos (PDF/Docs)
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">O bot lerÃ¡ o conteÃºdo de PDFs ou planilhas anexadas.</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg border hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={understandVideos}
                  onChange={e => setUnderstandVideos(e.target.checked)}
                  className="rounded border-gray-300 text-yux-600 mt-0.5 focus:ring-yux-500"
                />
                <div className="text-xs">
                  <div className="font-bold text-gray-800 flex items-center gap-1.5">
                    <Bot className="h-4 w-4 text-yux-600" />
                    Compreender VÃ­deos
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">Analisa frames e transcriÃ§Ãµes de Ã¡udio de vÃ­deos curtos.</p>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* STEP 3: HANDOFF & ROUTING */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="border-b pb-1.5 mb-2">
              <h3 className="font-bold text-sm text-gray-900">Gatilhos de TransferÃªncia (Handoff) & CRM</h3>
              <p className="text-xs text-gray-400">Configure em quais situaÃ§Ãµes a IA deve passar a conversa para um atendente humano.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div className="space-y-1.5">
                <span className="font-semibold text-gray-700">Limiar de ConfianÃ§a da IA: {confidenceThreshold}%</span>
                <input
                  type="range"
                  min="50"
                  max="95"
                  value={confidenceThreshold}
                  onChange={e => setConfidenceThreshold(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-yux-600"
                />
                <p className="text-[10px] text-gray-400">Transfere se a confianÃ§a da resposta da IA cair abaixo de {confidenceThreshold}%.</p>
              </div>

              <label className="space-y-1">
                <span className="font-semibold text-gray-700">Palavras-chave de Escape (separadas por vÃ­rgula)</span>
                <Input
                  value={escapeKeywords}
                  onChange={e => setEscapeKeywords(e.target.value)}
                  placeholder="Ex: atendente, falar com pessoa"
                  className="h-9"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold text-gray-700">Comportamento fora do horÃ¡rio comercial</span>
                <select
                  value={outOfHoursBehavior}
                  onChange={e => setOutOfHoursBehavior(e.target.value)}
                  className="h-9 w-full rounded-md border px-2 bg-white text-xs text-gray-800"
                >
                  <option value="unavailability_message">Informar indisponibilidade e manter na IA</option>
                  <option value="queue_handoff">Informar e enviar para fila humana de urgÃªncia</option>
                  <option value="ai_only">Permitir que a IA responda 24h normalmente</option>
                </select>
              </label>

              {queues.length > 0 && (
                <label className="space-y-1">
                  <span className="font-semibold text-gray-700">Fila Destino do Handoff</span>
                  <select
                    value={handoffQueueId}
                    onChange={e => setHandoffQueueId(e.target.value)}
                    className="h-9 w-full rounded-md border px-2 bg-white text-xs text-gray-800"
                  >
                    {queues.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
                  </select>
                </label>
              )}

              <label className="col-span-2 flex items-center gap-2 p-2 rounded border bg-slate-50/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={moveCrmStage}
                  onChange={e => setMoveCrmStage(e.target.checked)}
                  className="rounded border-gray-300 text-yux-600 focus:ring-yux-500"
                />
                <div>
                  <span className="font-bold text-gray-800">Mover lead no CRM ao transferir para humano</span>
                  <p className="text-[10px] text-gray-400 mt-0.5">Move automaticamente o estÃ¡gio do lead associado para a etapa de "Handoff Humano".</p>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* STEP 4: KNOWLEDGE & PRODUCTS */}
        {step === 4 && (
          <div className="space-y-3">
            <div className="border-b pb-1.5 mb-2 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-gray-900">Biblioteca de Conhecimento & CatÃ¡logo</h3>
                <p className="text-xs text-gray-400">Associe materiais gerais da empresa ao assistente ou cadastre produtos.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddProduct(true)}
                className="text-[11px] h-8 border-yux-200 text-yux-700 bg-yux-50/20 hover:bg-yux-50"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Cadastrar Produto
              </Button>
            </div>

            {/* Product registration form modal-like overlay */}
            {showAddProduct && (
              <div className="bg-slate-50 border rounded-lg p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between border-b pb-1">
                  <span className="font-bold text-slate-800">Novo Produto no CatÃ¡logo Unificado</span>
                  <button onClick={() => setShowAddProduct(false)}><X className="h-4 w-4 text-slate-400 hover:text-slate-600" /></button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="font-medium">Nome do Produto</span>
                    <Input value={newProdName} onChange={e => setNewProdName(e.target.value)} placeholder="Ex: Notebook Pro" className="h-8 text-xs" />
                  </label>
                  <label className="space-y-1">
                    <span className="font-medium">PreÃ§o</span>
                    <Input value={newProdPrice} onChange={e => setNewProdPrice(e.target.value)} placeholder="Ex: R$ 4.500,00" className="h-8 text-xs" />
                  </label>
                  <label className="space-y-1 col-span-2">
                    <span className="font-medium">Link de Checkout/Info</span>
                    <Input value={newProdLink} onChange={e => setNewProdLink(e.target.value)} placeholder="Ex: https://checkout.com/note-pro" className="h-8 text-xs" />
                  </label>
                  <label className="space-y-1 col-span-2">
                    <span className="font-medium">DescriÃ§Ã£o Completa</span>
                    <textarea
                      value={newProdDesc}
                      onChange={e => setNewProdDesc(e.target.value)}
                      rows={2}
                      placeholder="Ficha tÃ©cnica, cores, garantia..."
                      className="w-full rounded-md border p-2 text-xs focus:ring-1 focus:ring-yux-500 focus:outline-none"
                    />
                  </label>
                </div>
                <Button size="sm" onClick={handleAddProduct} className="text-xs">Confirmar Cadastro</Button>
              </div>
            )}

            {/* List of general knowledge files for selection */}
            <div className="space-y-2">
              <span className="font-bold text-xs text-gray-700 flex items-center gap-1">
                <BookOpen className="h-4 w-4 text-yux-600" />
                Vincular Materiais e Documentos do Acervo Geral
              </span>
              <div className="max-h-[180px] overflow-y-auto border rounded-lg divide-y bg-white">
                {availableKnowledge.map(entry => {
                  const isChecked = selectedKnowledgeIds.includes(entry.id)
                  const isProduct = entry.title.startsWith('[PRODUTO]')
                  return (
                    <label
                      key={entry.id}
                      className={`flex items-start gap-2.5 p-2.5 hover:bg-slate-50 cursor-pointer text-xs ${
                        isChecked ? 'bg-yux-50/25' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleKnowledge(entry.id)}
                        className="rounded border-gray-300 text-yux-600 mt-0.5 focus:ring-yux-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {isProduct ? (
                            <DollarSign className="h-3 w-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <FileText className="h-3 w-3.5 text-slate-400 shrink-0" />
                          )}
                          <span className="font-bold text-slate-800 truncate">{entry.title}</span>
                          <Badge variant="outline" className="text-[9px] py-0 px-1 font-semibold">{entry.status}</Badge>
                        </div>
                        <p className="text-[10px] text-gray-400 line-clamp-1 mt-0.5">{entry.body}</p>
                      </div>
                    </label>
                  )
                })}
                {availableKnowledge.length === 0 && (
                  <p className="p-4 text-center text-slate-400 text-[11px]">Nenhum material cadastrado na biblioteca de conhecimento geral.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between items-center bg-white p-3 border rounded-xl shadow-sm">
        <Button
          variant="outline"
          size="sm"
          disabled={step === 1 || saving}
          onClick={() => setStep(step - 1)}
          className="text-xs"
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
          Voltar
        </Button>

        {step < 4 ? (
          <Button
            size="sm"
            onClick={() => setStep(step + 1)}
            className="text-xs"
          >
            AvanÃ§ar
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={saving}
            onClick={handleSave}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? 'Salvando...' : 'Salvar e Ativar Agente de IA'}
          </Button>
        )}
      </div>
    </section>
  )
}
