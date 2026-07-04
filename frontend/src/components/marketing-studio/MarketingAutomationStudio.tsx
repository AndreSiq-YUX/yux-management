import {
  BarChart3,
  BookOpen,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  GitBranch,
  Image,
  Layers3,
  Megaphone,
  Play,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Workflow,
  Zap,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import type {
  MarketingAgent,
  MarketingAgentRun,
  MarketingCampaignCreativeSuggestion,
  MarketingCampaignDraftRun,
  MarketingContentGenerationRun,
  MarketingContentItem,
  MarketingContentReview,
  MarketingStudioSettings,
  MarketingToolRun,
  MarketingWorkflow,
  MarketingWorkflowRun,
} from '@/types/marketingStudio'

interface MarketingAutomationStudioProps {
  contents: MarketingContentItem[]
  settings: MarketingStudioSettings | null
  reviews: MarketingContentReview[]
  agents: MarketingAgent[]
  workflows: MarketingWorkflow[]
  workflowRuns: MarketingWorkflowRun[]
  agentRuns: MarketingAgentRun[]
  toolRuns: MarketingToolRun[]
  generationRuns: MarketingContentGenerationRun[]
  campaignCreativeSuggestions: MarketingCampaignCreativeSuggestion[]
  campaignDraftRuns: MarketingCampaignDraftRun[]
}

type FlowNodeType = 'entrada' | 'contexto' | 'agente' | 'aprovacao' | 'saida'

interface FlowNode {
  id: string
  label: string
  description: string
  type: FlowNodeType
  x: number
  y: number
  width?: number
  accent: string
  icon: typeof Bot
  status: string
  details: {
    objetivo: string
    entradas: string[]
    ferramentas: string[]
    saidas: string[]
    aprovacao: string
    limites: string[]
  }
}

interface FlowEdge {
  id: string
  source: string
  target: string
  label?: string
  variant?: 'primary' | 'secondary'
}

const defaultNodeWidth = 146

const automationNodes: FlowNode[] = [
  {
    id: 'briefing',
    label: 'Início do fluxo',
    description: 'Briefing aprovado',
    type: 'entrada',
    x: 24,
    y: 132,
    accent: 'bg-slate-500',
    icon: Play,
    status: 'Pronto',
    details: {
      objetivo: 'Disparar o workflow quando um briefing de campanha estiver aprovado.',
      entradas: ['Briefing aprovado', 'Objetivo comercial', 'Oferta principal'],
      ferramentas: ['Central de briefing', 'Contrato do cliente'],
      saidas: ['Evento de início', 'Pacote de contexto inicial'],
      aprovacao: 'Não exige aprovação adicional.',
      limites: ['Execução manual ou por evento', 'Sem custo de créditos'],
    },
  },
  {
    id: 'contexto',
    label: 'Preparar contexto',
    description: 'Marca, contrato e histórico',
    type: 'contexto',
    x: 170,
    y: 132,
    accent: 'bg-blue-600',
    icon: BookOpen,
    status: 'Sincronizado',
    details: {
      objetivo: 'Reunir marca, produtos, histórico comercial e limites do contrato antes dos agentes criarem qualquer ativo.',
      entradas: ['Perfil de marca', 'Base de conhecimento', 'Contrato ativo', 'Campanhas anteriores'],
      ferramentas: ['RAG da marca', 'CRM YUX', 'Histórico de campanhas'],
      saidas: ['Resumo estratégico', 'Restrições de marca', 'Contexto aprovado para agentes'],
      aprovacao: 'Bloqueia se a base de marca estiver incompleta.',
      limites: ['Máx. 20 fontes por execução', 'Prioriza conhecimento aprovado'],
    },
  },
  {
    id: 'estrategista',
    label: 'Estrategista de Campanha',
    description: 'Ângulos, oferta e público',
    type: 'agente',
    x: 320,
    y: 70,
    accent: 'bg-indigo-600',
    icon: Target,
    status: 'Ativo',
    details: {
      objetivo: 'Transformar o briefing em estratégia de campanha, com promessa, ângulo, público, objeções e hipótese de conversão.',
      entradas: ['Briefing', 'Oferta', 'Persona', 'Histórico de performance'],
      ferramentas: ['Strategy Engine', 'CRM YUX', 'Relatórios de campanha'],
      saidas: ['Estratégia aprovada', 'Ângulos de anúncio', 'Hipóteses de público'],
      aprovacao: 'Exige revisão YUX se alterar posicionamento ou promessa principal.',
      limites: ['Máx. 45 créditos', 'Modelo estratégico premium'],
    },
  },
  {
    id: 'redator',
    label: 'Redator Multicanal',
    description: 'Headlines, CTAs e variações',
    type: 'agente',
    x: 320,
    y: 208,
    accent: 'bg-violet-600',
    icon: FileText,
    status: 'Ativo',
    details: {
      objetivo: 'Criar variações de copy para Meta Ads, Google Ads, landing page e reaproveitamento orgânico.',
      entradas: ['Estratégia de campanha', 'Tom de voz', 'Objeções', 'Provas comerciais'],
      ferramentas: ['Brand Guardrails', 'Biblioteca de copies', 'RAG da marca'],
      saidas: ['12 copies', '6 headlines', '6 CTAs', 'Textos salvos na Central de Conteúdo'],
      aprovacao: 'Exige aprovação antes de publicar ou enviar para campanha paga.',
      limites: ['Máx. 35 créditos', 'Temperatura controlada'],
    },
  },
  {
    id: 'criativos',
    label: 'Gerador de Criativos',
    description: 'Imagem, carrossel e vídeo curto',
    type: 'agente',
    x: 470,
    y: 132,
    width: 170,
    accent: 'bg-[#635BFF]',
    icon: Image,
    status: 'Selecionado',
    details: {
      objetivo: 'Gerar um pacote visual para Meta Ads a partir da estratégia e das copies aprovadas.',
      entradas: ['Estratégia', 'Copies', 'Guia visual', 'Criativos de referência'],
      ferramentas: ['AI Image', 'Biblioteca de referências', 'Brand Guardrails', 'Meta Ads Specs'],
      saidas: ['6 imagens', '3 carrosséis', '12 prompts salvos', 'Brief para designer'],
      aprovacao: 'Exigir revisão YUX antes de liberar para cliente ou campanha.',
      limites: ['Máx. 180 créditos', 'Modelo visual premium', 'Timeout 8 min'],
    },
  },
  {
    id: 'revisor',
    label: 'Revisor de Marca',
    description: 'Qualidade e compliance',
    type: 'agente',
    x: 650,
    y: 132,
    accent: 'bg-emerald-600',
    icon: ShieldCheck,
    status: 'Obrigatório',
    details: {
      objetivo: 'Validar aderência à marca, promessas comerciais, clareza, risco regulatório e consistência visual.',
      entradas: ['Copies geradas', 'Criativos gerados', 'Políticas de marca', 'Regras de aprovação'],
      ferramentas: ['Checklist de qualidade', 'Grounding', 'Brand Guardrails'],
      saidas: ['Score de qualidade', 'Bloqueios', 'Sugestões de ajuste'],
      aprovacao: 'Bloqueia ativos com risco alto antes da Central de Conteúdo.',
      limites: ['Score mínimo 85', 'Revisão obrigatória para ads pagos'],
    },
  },
  {
    id: 'aprovacao',
    label: 'Aprovação YUX/Cliente',
    description: 'Validação humana',
    type: 'aprovacao',
    x: 804,
    y: 132,
    accent: 'bg-amber-500',
    icon: ClipboardCheck,
    status: '5 pendentes',
    details: {
      objetivo: 'Garantir controle humano antes de usar os ativos em campanha, publicação ou relatório externo.',
      entradas: ['Pacote revisado', 'Score de qualidade', 'Notas do revisor'],
      ferramentas: ['Fila de aprovação', 'Comentários', 'Histórico de versões'],
      saidas: ['Aprovado', 'Ajustes solicitados', 'Rejeitado'],
      aprovacao: 'Pode ser feita pela YUX, pelo cliente ou por ambos conforme contrato.',
      limites: ['SLA sugerido 24h', 'Publicação bloqueada até aprovação'],
    },
  },
  {
    id: 'central',
    label: 'Salvar na Central de Conteúdo',
    description: 'Ativos rastreáveis e reutilizáveis',
    type: 'saida',
    x: 650,
    y: 308,
    width: 216,
    accent: 'bg-[#B449A6]',
    icon: Layers3,
    status: 'Saída padrão',
    details: {
      objetivo: 'Registrar tudo que foi gerado com origem, objetivo, status, tags e destino dentro do Marketing Studio.',
      entradas: ['Criativos', 'Copies', 'Prompts', 'Briefs', 'Metadados do workflow'],
      ferramentas: ['Central de Conteúdo', 'Biblioteca de Criativos', 'Histórico de aprovação'],
      saidas: ['Ativos filtráveis', 'Origem do ativo', 'Reuso em campanhas e orgânico'],
      aprovacao: 'Mantém status de revisão, aprovado, publicado ou usado em campanha.',
      limites: ['Não publica sozinho', 'Preserva auditoria de origem'],
    },
  },
  {
    id: 'campanhas',
    label: 'Enviar para Campanhas',
    description: 'Rascunho Meta Ads',
    type: 'saida',
    x: 804,
    y: 288,
    accent: 'bg-blue-600',
    icon: Megaphone,
    status: 'Opcional',
    details: {
      objetivo: 'Transformar ativos aprovados em rascunho de campanha para revisão no Campaign Lab.',
      entradas: ['Ativos aprovados', 'Público sugerido', 'Orçamento', 'UTMs'],
      ferramentas: ['Meta Ads', 'Campaign Lab', 'Governança de publicação'],
      saidas: ['Campanha em rascunho', 'Conjunto de anúncios', 'UTMs sugeridas'],
      aprovacao: 'Nunca publica campanha paga sem aprovação explícita.',
      limites: ['Somente rascunho por padrão', 'Depende de conexão Meta Ads'],
    },
  },
  {
    id: 'biblioteca',
    label: 'Enviar para Biblioteca de Criativos',
    description: 'Referências e variações',
    type: 'saida',
    x: 804,
    y: 408,
    accent: 'bg-cyan-600',
    icon: Sparkles,
    status: 'Automático',
    details: {
      objetivo: 'Organizar os criativos gerados para busca, inspiração, comparação e novas variações.',
      entradas: ['Criativos aprovados', 'Prompts', 'Tags', 'Objetivo da campanha'],
      ferramentas: ['Creative Hub', 'Busca por tags', 'Gerar similar'],
      saidas: ['Itens na biblioteca', 'Coleções', 'Ativos para reuso'],
      aprovacao: 'Itens não aprovados ficam visíveis apenas internamente.',
      limites: ['Mantém origem do workflow', 'Agrupa por campanha e objetivo'],
    },
  },
]

const automationEdges: FlowEdge[] = [
  { id: 'briefing-contexto', source: 'briefing', target: 'contexto' },
  { id: 'contexto-estrategista', source: 'contexto', target: 'estrategista' },
  { id: 'contexto-redator', source: 'contexto', target: 'redator' },
  { id: 'estrategista-criativos', source: 'estrategista', target: 'criativos' },
  { id: 'redator-criativos', source: 'redator', target: 'criativos' },
  { id: 'criativos-revisor', source: 'criativos', target: 'revisor' },
  { id: 'revisor-aprovacao', source: 'revisor', target: 'aprovacao' },
  { id: 'aprovacao-central', source: 'aprovacao', target: 'central', label: 'aprovado' },
  { id: 'central-campanhas', source: 'central', target: 'campanhas', label: 'ads', variant: 'secondary' },
  { id: 'central-biblioteca', source: 'central', target: 'biblioteca', label: 'criativos', variant: 'secondary' },
]

const tactics = [
  {
    group: 'Criar campanhas',
    items: [
      { name: 'Gerar pacote Meta Ads', status: 'Pronto', icon: Megaphone },
      { name: 'Criar variações Google Ads', status: 'Requer conexão', icon: Search },
      { name: 'Reciclar campanha vencedora', status: 'Premium', icon: RefreshCw },
    ],
  },
  {
    group: 'Gerar conteúdo orgânico',
    items: [
      { name: 'Post orgânico multicanal', status: 'Pronto', icon: Send },
      { name: 'Artigo WordPress completo', status: 'Requer conexão', icon: FileText },
      { name: 'Calendário semanal', status: 'Pronto', icon: Workflow },
    ],
  },
  {
    group: 'Analisar e otimizar',
    items: [
      { name: 'Auditoria 360 de campanhas', status: 'Premium', icon: BarChart3 },
      { name: 'Radar semanal de ideias', status: 'Pronto', icon: Zap },
      { name: 'Relatório mensal de performance', status: 'Pronto', icon: CircleDollarSign },
    ],
  },
]

const typeLabel: Record<FlowNodeType, string> = {
  entrada: 'Entrada',
  contexto: 'Contexto',
  agente: 'Agente IA',
  aprovacao: 'Aprovação',
  saida: 'Saída',
}

export function MarketingAutomationStudio({
  contents,
  settings,
  reviews,
  agents,
  workflows,
  workflowRuns,
  agentRuns,
  toolRuns,
  generationRuns,
  campaignCreativeSuggestions,
  campaignDraftRuns,
}: MarketingAutomationStudioProps) {
  const [selectedNodeId, setSelectedNodeId] = useState('criativos')
  const selectedNode = automationNodes.find(node => node.id === selectedNodeId) || automationNodes[4]
  const selectedWorkflow = workflows.find(workflow => workflow.status === 'active') || workflows[0]
  const latestRun = workflowRuns[0]
  const pendingApprovals = reviews.filter(review => review.status === 'pending').length
  const generatedAssets = contents.length + generationRuns.length + campaignCreativeSuggestions.length
  const activeAgents = agents.filter(agent => agent.status === 'active').length || 3
  const activeWorkflows = workflows.filter(workflow => workflow.status === 'active').length || 8
  const runningAgents = agentRuns.filter(run => run.status === 'running' || run.status === 'queued').length || Math.min(activeAgents, 3)

  const inspectorAgent = useMemo(() => {
    if (selectedNode.id === 'estrategista') return agents.find(agent => agent.agentType === 'campaign_strategist')
    if (selectedNode.id === 'redator') return agents.find(agent => agent.agentType === 'multichannel_writer')
    if (selectedNode.id === 'criativos') return agents.find(agent => agent.agentType === 'visual_creative_generator')
    if (selectedNode.id === 'revisor') return agents.find(agent => agent.agentType === 'brand_quality_reviewer')
    return undefined
  }, [agents, selectedNode.id])

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-3xl font-semibold text-[#141821]">Estúdio de Automações</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Crie, monitore e ajuste fluxos inteligentes que alimentam campanhas, criativos, conteúdos e relatórios.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <HeaderChip label="Workspace" value="Empresa ABC" />
            <HeaderChip label="Modo" value={operationModeLabel(settings?.operationMode)} />
            <HeaderChip label="Créditos" value={String(settings?.currentCreditBalance ?? 0)} />
            <HeaderChip label="Última execução" value={latestRun?.createdAt ? formatRelative(latestRun.createdAt) : 'há 12 min'} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex h-10 items-center gap-2 rounded-md bg-[#2563EB] px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700" type="button">
            <GitBranch className="h-4 w-4" />
            Novo workflow
          </button>
          <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50" type="button">
            <Layers3 className="h-4 w-4" />
            Biblioteca de táticas
          </button>
          <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50" type="button">
            <ShieldCheck className="h-4 w-4" />
            Executar diagnóstico
          </button>
        </div>
      </div>

      <div className="rounded-md border border-slate-300 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600">Pulso das automações</p>
        </div>
        <div className="grid divide-y divide-slate-200 md:grid-cols-5 md:divide-x md:divide-y-0">
          <PulseMetric icon={Workflow} label="Workflows ativos" value={activeWorkflows} detail="Fluxos prontos para execução" />
          <PulseMetric icon={Bot} label="Agentes em execução" value={runningAgents} detail={`${agentRuns.length || runningAgents} runs monitorados`} />
          <PulseMetric icon={ClipboardCheck} label="Aprovações pendentes" value={pendingApprovals || 5} detail="Itens aguardando decisão" tone="warning" />
          <PulseMetric icon={Layers3} label="Ativos gerados" value={generatedAssets || 42} detail="Conteúdo, copy e criativos" tone="brand" />
          <PulseMetric icon={CircleDollarSign} label="Economia estimada" value="18h" detail="Trabalho manual evitado" tone="success" />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)] min-[1800px]:grid-cols-[300px_minmax(0,1fr)_360px]">
        <aside className="rounded-md border border-slate-300 bg-white">
          <div className="border-b border-slate-200 px-4 py-4">
            <p className="text-sm font-semibold text-[#141821]">Biblioteca de táticas</p>
            <p className="mt-1 text-xs text-slate-500">Modelos prontos por objetivo de marketing.</p>
          </div>
          <div className="space-y-4 p-3">
            {tactics.map(group => (
              <div key={group.group}>
                <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{group.group}</p>
                <div className="space-y-2">
                  {group.items.map(item => (
                    <button
                      key={item.name}
                      type="button"
                      className="flex w-full items-start gap-3 rounded-md border border-slate-200 bg-white p-3 text-left hover:border-blue-300 hover:bg-blue-50/40"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600">
                        <item.icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-[#141821]">{item.name}</span>
                        <span className={tacticStatusClass(item.status)}>{item.status}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div className="min-w-0 overflow-hidden rounded-md border border-slate-300 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Editor de fluxo</p>
              <h3 className="mt-1 text-lg font-semibold text-[#141821]">{selectedWorkflow?.name || 'Gerar pacote Meta Ads'}</h3>
              <p className="mt-1 text-xs text-slate-500">
                Tudo que o fluxo gera é salvo com origem, objetivo, status e destino na Central de Conteúdo.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">Pronto para executar</span>
              <button className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50" type="button">
                <Play className="h-3.5 w-3.5" />
                Executar teste
              </button>
            </div>
          </div>
          <div className="overflow-auto">
            <div className="relative h-[560px] min-w-[960px] overflow-hidden bg-[#f8fafc]">
              <div className="absolute inset-0 opacity-80 [background-image:radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:18px_18px]" />
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 960 560" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <marker id="automation-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
                    <path d="M0,0 L8,4 L0,8 Z" fill="#64748b" />
                  </marker>
                </defs>
                {automationEdges.map(edge => (
                  <FlowConnector key={edge.id} edge={edge} />
                ))}
              </svg>
              {automationNodes.map(node => (
                <FlowNodeButton
                  key={node.id}
                  node={node}
                  selected={node.id === selectedNode.id}
                  onSelect={() => setSelectedNodeId(node.id)}
                />
              ))}
            </div>
          </div>
        </div>

        <aside className="rounded-md border border-slate-300 bg-white xl:col-span-2 min-[1800px]:col-span-1">
          <div className="border-b border-slate-200 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-blue-600">
                  <selectedNode.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#141821]">{selectedNode.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{typeLabel[selectedNode.type]} / {selectedNode.status}</p>
                </div>
              </div>
              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                {inspectorAgent?.status === 'active' || selectedNode.status === 'Selecionado' ? 'Ativo' : selectedNode.status}
              </span>
            </div>
          </div>

          <div className="space-y-4 p-4">
            <InspectorBlock title="O que este agente faz">
              <p>{selectedNode.details.objetivo}</p>
            </InspectorBlock>
            <InspectorBlock title="Dados que ele usa">
              <TagList items={selectedNode.details.entradas} />
            </InspectorBlock>
            <InspectorBlock title="Ferramentas">
              <TagList items={inspectorAgent?.allowedTools.length ? inspectorAgent.allowedTools.map(tool => toolLabel(tool)) : selectedNode.details.ferramentas} />
            </InspectorBlock>
            <InspectorBlock title="Saídas geradas">
              <TagList items={selectedNode.details.saidas} />
            </InspectorBlock>
            <InspectorBlock title="Aprovação">
              <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{inspectorAgent?.requiresHumanApproval ? 'Exige aprovação humana antes de publicar ou enviar para campanha.' : selectedNode.details.aprovacao}</p>
              </div>
            </InspectorBlock>
            <InspectorBlock title="Limites e governança">
              <TagList items={inspectorAgent?.maxCostPerRun ? [`Máx. ${inspectorAgent.maxCostPerRun} créditos`, ...selectedNode.details.limites] : selectedNode.details.limites} />
            </InspectorBlock>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Última execução</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <RunStat label="Score" value={String(latestQualityScore(agentRuns) || 92)} />
                <RunStat label="Custo" value={String(latestRun?.creditDebit || toolRuns[0]?.creditsCharged || 74)} />
                <RunStat label="Bloqueios" value={latestRun?.errorMessage ? '1' : '0'} />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button className="inline-flex h-9 flex-1 items-center justify-center rounded-md bg-[#2563EB] px-3 text-sm font-semibold text-white hover:bg-blue-700" type="button">
                Salvar configuração
              </button>
              <button className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50" type="button">
                Ver logs
              </button>
            </div>
          </div>
        </aside>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <OutputCard
          icon={Layers3}
          title="Central de Conteúdo"
          description="Todos os ativos gerados por agentes, criação manual, radar ou campanhas ficam em um único acervo com origem e status."
          detail={`${generatedAssets || 42} ativos rastreáveis`}
        />
        <OutputCard
          icon={Sparkles}
          title="Biblioteca de Criativos"
          description="Criativos aprovados viram referências, variações e inspiração para novas campanhas e posts orgânicos."
          detail={`${campaignCreativeSuggestions.length || 9} sugestões de criativo`}
        />
        <OutputCard
          icon={Megaphone}
          title="Campaign Lab"
          description="Campanhas recebem rascunhos, copies, UTMs, públicos sugeridos e peças aprovadas sem publicação automática."
          detail={`${campaignDraftRuns.length || 2} rascunhos recentes`}
        />
      </div>
    </section>
  )
}

function HeaderChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600">
      <span className="font-medium text-slate-900">{label}:</span>
      {value}
    </span>
  )
}

function PulseMetric({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  icon: typeof Bot
  label: string
  value: number | string
  detail: string
  tone?: 'neutral' | 'warning' | 'success' | 'brand'
}) {
  const toneClass = {
    neutral: 'text-slate-600 border-slate-200 bg-white',
    warning: 'text-amber-600 border-amber-200 bg-amber-50/70',
    success: 'text-emerald-600 border-emerald-200 bg-emerald-50/70',
    brand: 'text-blue-600 border-blue-200 bg-blue-50/70',
  }[tone]

  return (
    <div className="flex items-center gap-4 p-4">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${toneClass}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-[#141821]">{value}</p>
        <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
      </div>
    </div>
  )
}

function FlowConnector({ edge }: { edge: FlowEdge }) {
  const source = automationNodes.find(node => node.id === edge.source)!
  const target = automationNodes.find(node => node.id === edge.target)!
  const sourceWidth = source.width || defaultNodeWidth
  const startX = source.x + sourceWidth
  const startY = source.y + 45
  const endX = target.x
  const endY = target.y + 45
  const midX = startX + Math.max((endX - startX) / 2, 44)
  const color = edge.variant === 'secondary' ? '#94a3b8' : '#64748b'
  const d = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX - 8} ${endY}`

  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeDasharray={edge.variant === 'secondary' ? '5 5' : undefined} strokeWidth="1.5" markerEnd="url(#automation-arrow)" />
      {edge.label && (
        <text x={(startX + endX) / 2} y={(startY + endY) / 2 - 8} fill="#64748b" fontSize="11" fontWeight="600">
          {edge.label}
        </text>
      )}
    </g>
  )
}

function FlowNodeButton({ node, selected, onSelect }: { node: FlowNode; selected: boolean; onSelect: () => void }) {
  const width = node.width || defaultNodeWidth
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`absolute rounded-md border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        selected ? 'border-blue-500 ring-4 ring-blue-100' : 'border-slate-300'
      }`}
      style={{ left: node.x, top: node.y, width }}
    >
      <span className={`block h-1.5 rounded-t-md ${node.accent}`} />
      <span className="flex gap-3 p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-700">
          <node.icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{typeLabel[node.type]}</span>
          <span className="mt-1 block text-sm font-semibold leading-snug text-[#141821]">{node.label}</span>
          <span className="mt-1 block text-xs leading-snug text-slate-500">{node.description}</span>
          <span className="mt-2 inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">{node.status}</span>
        </span>
      </span>
    </button>
  )
}

function InspectorBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <div className="text-sm leading-relaxed text-slate-700">{children}</div>
    </div>
  )
}

function TagList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(item => (
        <span key={item} className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
          {item}
        </span>
      ))}
    </div>
  )
}

function RunStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-[#141821]">{value}</p>
    </div>
  )
}

function OutputCard({ icon: Icon, title, description, detail }: { icon: typeof Bot; title: string; description: string; detail: string }) {
  return (
    <article className="rounded-md border border-slate-300 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-blue-600">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-[#141821]">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{description}</p>
          <p className="mt-3 text-xs font-semibold text-blue-700">{detail}</p>
        </div>
      </div>
    </article>
  )
}

function tacticStatusClass(status: string) {
  const base = 'mt-2 inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium'
  if (status === 'Pronto') return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`
  if (status === 'Requer conexão') return `${base} border-amber-200 bg-amber-50 text-amber-700`
  return `${base} border-violet-200 bg-violet-50 text-violet-700`
}

function operationModeLabel(mode?: string) {
  if (mode === 'managed_by_yux') return 'Gerenciado pela YUX'
  if (mode === 'assisted_client') return 'Cliente assistido'
  if (mode === 'advanced_partner') return 'Parceiro avançado'
  return 'Cliente assistido'
}

function latestQualityScore(agentRuns: MarketingAgentRun[]) {
  return agentRuns.find(run => typeof run.qualityScore === 'number')?.qualityScore
}

function toolLabel(tool: string) {
  const labels: Record<string, string> = {
    curated_sources: 'Fontes curadas',
    jina_reader: 'Leitura de URL',
    jina_search: 'Busca externa',
    jina_grounding: 'Grounding',
    tavily_search: 'Busca Tavily',
    serper_search: 'Busca Serper',
    firecrawl: 'Crawler',
    youtube_data: 'YouTube Data',
    rag_search: 'RAG da marca',
    create_task: 'Criar tarefa',
    create_wordpress_draft: 'Rascunho WordPress',
    publish_wordpress: 'Publicar WordPress',
    campaign_draft: 'Rascunho de campanha',
    image_generation: 'Geração de imagem',
  }
  return labels[tool] || tool
}

function formatRelative(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'há pouco'
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000))
  if (diffMinutes < 60) return `há ${diffMinutes} min`
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `há ${diffHours} h`
  const diffDays = Math.round(diffHours / 24)
  return `há ${diffDays} d`
}
