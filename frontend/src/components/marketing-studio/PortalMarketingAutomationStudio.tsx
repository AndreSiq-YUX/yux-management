import {
  BarChart3,
  BookOpen,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Image,
  Layers3,
  Megaphone,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Workflow,
  Zap,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import type {
  MarketingCalendarItem,
  MarketingContentReview,
  MarketingStudioSettings,
  PortalMarketingContentItem,
} from '@/types/marketingStudio'

interface PortalMarketingAutomationStudioProps {
  contents: PortalMarketingContentItem[]
  settings: MarketingStudioSettings | null
  calendarItems: MarketingCalendarItem[]
  reviews: MarketingContentReview[]
}

type PortalNodeType = 'entrada' | 'contexto' | 'agente' | 'aprovacao' | 'saida'

interface PortalFlowNode {
  id: string
  label: string
  description: string
  type: PortalNodeType
  x: number
  y: number
  width?: number
  accent: string
  icon: typeof Bot
  status: string
  details: {
    objetivo: string
    entradas: string[]
    saidas: string[]
    aprovacao: string
  }
}

interface PortalFlowEdge {
  id: string
  source: string
  target: string
  label?: string
  variant?: 'primary' | 'secondary'
}

const defaultNodeWidth = 146

const portalNodes: PortalFlowNode[] = [
  {
    id: 'briefing',
    label: 'Briefing aprovado',
    description: 'Pedido validado',
    type: 'entrada',
    x: 24,
    y: 132,
    accent: 'bg-slate-500',
    icon: Play,
    status: 'Pronto',
    details: {
      objetivo: 'Iniciar a criacao quando o briefing estiver claro, aprovado e conectado ao objetivo da campanha.',
      entradas: ['Objetivo', 'Oferta', 'Publico', 'Prazo'],
      saidas: ['Fluxo iniciado', 'Contexto organizado'],
      aprovacao: 'O fluxo comeca apenas quando o briefing estiver aprovado.',
    },
  },
  {
    id: 'contexto',
    label: 'Preparar contexto',
    description: 'Marca, oferta e historico',
    type: 'contexto',
    x: 170,
    y: 132,
    accent: 'bg-blue-600',
    icon: BookOpen,
    status: 'Sincronizado',
    details: {
      objetivo: 'Usar a base de marca, produtos, campanhas anteriores e informacoes do contrato para orientar os agentes.',
      entradas: ['Tom de voz', 'Produtos', 'Base de conhecimento', 'Historico aprovado'],
      saidas: ['Resumo para os agentes', 'Limites de marca', 'Referencias permitidas'],
      aprovacao: 'Dados sensiveis ou incompletos bloqueiam a continuacao automatica.',
    },
  },
  {
    id: 'estrategista',
    label: 'Estrategista de Campanha',
    description: 'Angulos, oferta e publico',
    type: 'agente',
    x: 320,
    y: 70,
    accent: 'bg-indigo-600',
    icon: Target,
    status: 'Ativo',
    details: {
      objetivo: 'Definir o caminho da campanha: publico, angulo, promessa, objecoes e hipotese de conversao.',
      entradas: ['Briefing', 'Oferta', 'Persona', 'Objetivo comercial'],
      saidas: ['Estrategia da campanha', 'Angulos de anuncio', 'Pontos de prova'],
      aprovacao: 'A YUX revisa a estrategia antes de transformar em pecas finais.',
    },
  },
  {
    id: 'redator',
    label: 'Redator Multicanal',
    description: 'Headlines, CTAs e variacoes',
    type: 'agente',
    x: 320,
    y: 208,
    accent: 'bg-violet-600',
    icon: FileText,
    status: 'Ativo',
    details: {
      objetivo: 'Criar textos para anuncios, posts, landing pages e variacoes de abordagem conforme o canal.',
      entradas: ['Estrategia', 'Tom de voz', 'Objecoes', 'Provas'],
      saidas: ['Copies', 'Headlines', 'CTAs', 'Variacoes por canal'],
      aprovacao: 'Textos usados em campanha ou publicacao passam por aprovacao.',
    },
  },
  {
    id: 'criativos',
    label: 'Gerador de Criativos',
    description: 'Imagens, carrosseis e briefs',
    type: 'agente',
    x: 470,
    y: 132,
    width: 170,
    accent: 'bg-[#635BFF]',
    icon: Image,
    status: 'Selecionado',
    details: {
      objetivo: 'Gerar pecas visuais e briefs para designer a partir da estrategia aprovada e dos textos criados.',
      entradas: ['Estrategia', 'Copies', 'Guia visual', 'Referencias'],
      saidas: ['Imagens', 'Carrosseis', 'Prompts salvos', 'Brief para designer'],
      aprovacao: 'A YUX revisa antes de enviar para aprovacao do cliente ou campanha.',
    },
  },
  {
    id: 'revisor',
    label: 'Revisor de Marca',
    description: 'Qualidade e consistencia',
    type: 'agente',
    x: 650,
    y: 132,
    accent: 'bg-emerald-600',
    icon: ShieldCheck,
    status: 'Obrigatorio',
    details: {
      objetivo: 'Conferir se textos e criativos respeitam marca, clareza, promessa, qualidade e regras do contrato.',
      entradas: ['Criativos', 'Copies', 'Guia de marca', 'Regras de aprovacao'],
      saidas: ['Score de qualidade', 'Ajustes sugeridos', 'Bloqueios quando necessario'],
      aprovacao: 'Ativos com risco ou baixa qualidade nao avancam para publicacao.',
    },
  },
  {
    id: 'aprovacao',
    label: 'Aprovacao do cliente',
    description: 'Decisao antes de publicar',
    type: 'aprovacao',
    x: 804,
    y: 132,
    accent: 'bg-amber-500',
    icon: ClipboardCheck,
    status: 'Pendente',
    details: {
      objetivo: 'Permitir que o cliente aprove, peca ajustes ou rejeite os ativos antes do uso.',
      entradas: ['Pacote revisado', 'Notas da YUX', 'Previa dos ativos'],
      saidas: ['Aprovado', 'Ajustes solicitados', 'Rejeitado'],
      aprovacao: 'Nada e publicado automaticamente sem liberacao quando o contrato exige aprovacao.',
    },
  },
  {
    id: 'central',
    label: 'Central de Conteudo',
    description: 'Tudo salvo e rastreavel',
    type: 'saida',
    x: 650,
    y: 308,
    width: 196,
    accent: 'bg-[#B449A6]',
    icon: Layers3,
    status: 'Saida padrao',
    details: {
      objetivo: 'Organizar tudo que foi criado em um acervo unico para consulta, aprovacao, publicacao e reuso.',
      entradas: ['Criativos', 'Copies', 'Briefs', 'Status de aprovacao'],
      saidas: ['Ativos filtraveis', 'Historico', 'Reuso em campanhas e organico'],
      aprovacao: 'Cada ativo preserva status: rascunho, em aprovacao, aprovado, publicado ou usado em campanha.',
    },
  },
  {
    id: 'campanhas',
    label: 'Campanhas',
    description: 'Rascunhos de ads',
    type: 'saida',
    x: 804,
    y: 292,
    accent: 'bg-blue-600',
    icon: Megaphone,
    status: 'Opcional',
    details: {
      objetivo: 'Levar ativos aprovados para rascunhos de campanha, sem publicar automaticamente.',
      entradas: ['Ativos aprovados', 'Publico', 'Objetivo', 'Orcamento sugerido'],
      saidas: ['Rascunho de campanha', 'Conjunto de criativos', 'Proximos passos'],
      aprovacao: 'Campanhas pagas continuam exigindo validacao final.',
    },
  },
  {
    id: 'biblioteca',
    label: 'Biblioteca de Criativos',
    description: 'Referencias e variacoes',
    type: 'saida',
    x: 804,
    y: 408,
    accent: 'bg-cyan-600',
    icon: Sparkles,
    status: 'Automatico',
    details: {
      objetivo: 'Guardar criativos aprovados para comparacao, inspiracao e criacao de novas variacoes.',
      entradas: ['Criativos aprovados', 'Prompts', 'Tags', 'Objetivo'],
      saidas: ['Colecoes', 'Variacoes futuras', 'Referencias visuais'],
      aprovacao: 'Criativos nao aprovados ficam sinalizados como rascunho ou ajuste pendente.',
    },
  },
]

const portalEdges: PortalFlowEdge[] = [
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
  { title: 'Criar pacote Meta Ads', status: 'Pronto', icon: Megaphone, description: 'Criativos, copies e rascunho de campanha.' },
  { title: 'Post organico multicanal', status: 'Pronto', icon: Send, description: 'Adapta uma ideia para Instagram, LinkedIn e e-mail.' },
  { title: 'Radar semanal de ideias', status: 'Ativo', icon: Zap, description: 'Sugere pautas com base em mercado e historico.' },
  { title: 'Relatorio mensal de performance', status: 'Em breve', icon: BarChart3, description: 'Resumo executivo com aprendizados e proximos passos.' },
]

const typeLabel: Record<PortalNodeType, string> = {
  entrada: 'Entrada',
  contexto: 'Contexto',
  agente: 'Agente IA',
  aprovacao: 'Aprovacao',
  saida: 'Saida',
}

export function PortalMarketingAutomationStudio({
  contents,
  settings,
  calendarItems,
  reviews,
}: PortalMarketingAutomationStudioProps) {
  const [selectedNodeId, setSelectedNodeId] = useState('criativos')
  const selectedNode = portalNodes.find(node => node.id === selectedNodeId) || portalNodes[4]
  const pendingReviews = reviews.filter(review => review.status === 'pending').length
  const approvedContents = contents.filter(content => content.status === 'approved' || content.status === 'published').length
  const scheduledItems = calendarItems.filter(item => item.status !== 'cancelled').length

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-3xl font-semibold text-[#141821]">Estudio de Automacoes</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Acompanhe como a YUX usa agentes para transformar estrategia, textos, criativos e aprovacoes em ativos prontos para campanha.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <HeaderChip label="Modo" value={operationModeLabel(settings?.operationMode)} />
            <HeaderChip label="Creditos" value={String(settings?.currentCreditBalance ?? 0)} />
            <HeaderChip label="Conteudos" value={String(contents.length)} />
            <HeaderChip label="Aprovacoes" value={String(pendingReviews)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex h-10 items-center gap-2 rounded-md bg-[#2563EB] px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700" type="button">
            <ClipboardCheck className="h-4 w-4" />
            Ver aprovacoes
          </button>
          <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50" type="button">
            <Layers3 className="h-4 w-4" />
            Abrir Central de Conteudo
          </button>
        </div>
      </div>

      <div className="rounded-md border border-slate-300 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600">Pulso do Marketing</p>
        </div>
        <div className="grid divide-y divide-slate-200 md:grid-cols-5 md:divide-x md:divide-y-0">
          <PulseMetric icon={Workflow} label="Fluxos ativos" value={4} detail="Rotinas acompanhadas pela YUX" />
          <PulseMetric icon={Image} label="Ativos gerados" value={contents.length || 12} detail="Posts, copies e criativos" tone="brand" />
          <PulseMetric icon={ClipboardCheck} label="Aprovacoes" value={pendingReviews} detail="Aguardando decisao" tone="warning" />
          <PulseMetric icon={CheckCircle2} label="Aprovados" value={approvedContents} detail="Prontos para uso" tone="success" />
          <PulseMetric icon={Send} label="Agendados" value={scheduledItems} detail="Publicacoes e entregas futuras" />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)] min-[1800px]:grid-cols-[280px_minmax(0,1fr)_340px]">
        <aside className="rounded-md border border-slate-300 bg-white">
          <div className="border-b border-slate-200 px-4 py-4">
            <p className="text-sm font-semibold text-[#141821]">Fluxos disponiveis</p>
            <p className="mt-1 text-xs text-slate-500">Automacoes que conectam criacao, revisao e campanha.</p>
          </div>
          <div className="space-y-2 p-3">
            {tactics.map(item => (
              <button
                key={item.title}
                type="button"
                className="flex w-full items-start gap-3 rounded-md border border-slate-200 bg-white p-3 text-left hover:border-blue-300 hover:bg-blue-50/40"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600">
                  <item.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[#141821]">{item.title}</span>
                  <span className="mt-1 block text-xs leading-snug text-slate-500">{item.description}</span>
                  <span className={statusClass(item.status)}>{item.status}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <div className="min-w-0 overflow-hidden rounded-md border border-slate-300 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Mapa do fluxo</p>
              <h3 className="mt-1 text-lg font-semibold text-[#141821]">Gerar pacote Meta Ads</h3>
              <p className="mt-1 text-xs text-slate-500">Tudo que o fluxo gera fica salvo na Central de Conteudo com status e origem.</p>
            </div>
            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">Em acompanhamento</span>
          </div>
          <div className="overflow-auto">
            <div className="relative h-[540px] min-w-[960px] overflow-hidden bg-[#f8fafc]">
              <div className="absolute inset-0 opacity-80 [background-image:radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:18px_18px]" />
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 960 540" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <marker id="portal-automation-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
                    <path d="M0,0 L8,4 L0,8 Z" fill="#64748b" />
                  </marker>
                </defs>
                {portalEdges.map(edge => (
                  <FlowConnector key={edge.id} edge={edge} />
                ))}
              </svg>
              {portalNodes.map(node => (
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
              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">Visivel ao cliente</span>
            </div>
          </div>
          <div className="space-y-4 p-4">
            <InspectorBlock title="O que acontece aqui">
              <p>{selectedNode.details.objetivo}</p>
            </InspectorBlock>
            <InspectorBlock title="Dados usados">
              <TagList items={selectedNode.details.entradas} />
            </InspectorBlock>
            <InspectorBlock title="O que pode gerar">
              <TagList items={selectedNode.details.saidas} />
            </InspectorBlock>
            <InspectorBlock title="Controle e aprovacao">
              <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{selectedNode.details.aprovacao}</p>
              </div>
            </InspectorBlock>
          </div>
        </aside>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <OutputCard
          icon={Layers3}
          title="Central de Conteudo"
          description="Tudo que a YUX cria para o contrato fica reunido com status, origem e destino."
          detail={`${contents.length || 12} ativos organizados`}
        />
        <OutputCard
          icon={Sparkles}
          title="Biblioteca de Criativos"
          description="Pecas aprovadas viram referencias para novas variacoes, campanhas e posts."
          detail="Criativos prontos para reuso"
        />
        <OutputCard
          icon={Megaphone}
          title="Campanhas"
          description="Ativos aprovados podem virar rascunhos de anuncios, sempre com validacao antes da publicacao."
          detail="Publicacao controlada"
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

function FlowConnector({ edge }: { edge: PortalFlowEdge }) {
  const source = portalNodes.find(node => node.id === edge.source)!
  const target = portalNodes.find(node => node.id === edge.target)!
  const sourceWidth = source.width || defaultNodeWidth
  const startX = source.x + sourceWidth
  const startY = source.y + 45
  const endX = target.x
  const endY = target.y + 45
  const midX = startX + Math.max((endX - startX) / 2, 36)
  const color = edge.variant === 'secondary' ? '#94a3b8' : '#64748b'
  const d = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX - 8} ${endY}`

  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeDasharray={edge.variant === 'secondary' ? '5 5' : undefined} strokeWidth="1.5" markerEnd="url(#portal-automation-arrow)" />
      {edge.label && (
        <text x={(startX + endX) / 2} y={(startY + endY) / 2 - 8} fill="#64748b" fontSize="11" fontWeight="600">
          {edge.label}
        </text>
      )}
    </g>
  )
}

function FlowNodeButton({ node, selected, onSelect }: { node: PortalFlowNode; selected: boolean; onSelect: () => void }) {
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

function statusClass(status: string) {
  const base = 'mt-2 inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium'
  if (status === 'Pronto' || status === 'Ativo') return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`
  if (status === 'Em breve') return `${base} border-slate-200 bg-slate-50 text-slate-600`
  return `${base} border-violet-200 bg-violet-50 text-violet-700`
}

function operationModeLabel(mode?: string) {
  if (mode === 'managed_by_yux') return 'Gerenciado pela YUX'
  if (mode === 'assisted_client') return 'Cliente assistido'
  if (mode === 'advanced_partner') return 'Parceiro avancado'
  return 'Cliente assistido'
}
