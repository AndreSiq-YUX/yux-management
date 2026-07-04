import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Image,
  Layers3,
  Megaphone,
  MousePointer2,
  Move,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  StickyNote,
  Target,
  Workflow,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'
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

type StudioNodeType = 'trigger' | 'context' | 'agent' | 'approval' | 'output' | 'note'

interface StudioNodeDetails {
  objetivo: string
  entradas: string[]
  saidas: string[]
  aprovacao: string
}

type StudioNodeData = {
  label: string
  description: string
  eyebrow: string
  status: string
  accent: string
  tone: 'slate' | 'blue' | 'violet' | 'emerald' | 'amber' | 'pink' | 'cyan'
  icon: LucideIcon
  details: StudioNodeDetails
} & Record<string, unknown>

type StudioFlowNode = Node<StudioNodeData, StudioNodeType>
type StudioFlowEdge = Edge
type FlowPointerEvent = { clientX: number; clientY: number; preventDefault?: () => void }

const initialNodes: StudioFlowNode[] = [
  {
    id: 'briefing',
    type: 'trigger',
    position: { x: 0, y: 220 },
    data: {
      label: 'Briefing aprovado',
      description: 'Pedido validado',
      eyebrow: 'Entrada',
      status: 'Pronto',
      accent: '#64748b',
      tone: 'slate',
      icon: MousePointer2,
      details: {
        objetivo: 'Iniciar a criacao quando o pedido estiver claro, aprovado e conectado ao objetivo da campanha.',
        entradas: ['Objetivo', 'Oferta', 'Publico', 'Prazo'],
        saidas: ['Fluxo iniciado', 'Contexto organizado'],
        aprovacao: 'O fluxo comeca apenas quando o briefing estiver aprovado.',
      },
    },
  },
  {
    id: 'contexto',
    type: 'context',
    position: { x: 260, y: 220 },
    data: {
      label: 'Preparar contexto',
      description: 'Marca, oferta e historico',
      eyebrow: 'Contexto',
      status: 'Sincronizado',
      accent: '#2563eb',
      tone: 'blue',
      icon: BookOpen,
      details: {
        objetivo: 'Usar base de marca, produtos, campanhas anteriores e informacoes do contrato para orientar os agentes.',
        entradas: ['Tom de voz', 'Produtos', 'Base de conhecimento', 'Historico aprovado'],
        saidas: ['Resumo para agentes', 'Limites de marca', 'Referencias permitidas'],
        aprovacao: 'Dados sensiveis ou incompletos bloqueiam a continuacao automatica.',
      },
    },
  },
  {
    id: 'estrategista',
    type: 'agent',
    position: { x: 560, y: 70 },
    data: {
      label: 'Estrategista de Campanha',
      description: 'Angulos, oferta e publico',
      eyebrow: 'Agente IA',
      status: 'Ativo',
      accent: '#4f46e5',
      tone: 'violet',
      icon: Target,
      details: {
        objetivo: 'Definir publico, angulo, promessa, objecoes e hipotese de conversao.',
        entradas: ['Briefing', 'Oferta', 'Persona', 'Objetivo comercial'],
        saidas: ['Estrategia da campanha', 'Angulos de anuncio', 'Pontos de prova'],
        aprovacao: 'A YUX revisa a estrategia antes de transformar em pecas finais.',
      },
    },
  },
  {
    id: 'redator',
    type: 'agent',
    position: { x: 560, y: 360 },
    data: {
      label: 'Redator Multicanal',
      description: 'Headlines, CTAs e variacoes',
      eyebrow: 'Agente IA',
      status: 'Ativo',
      accent: '#7c3aed',
      tone: 'violet',
      icon: FileText,
      details: {
        objetivo: 'Criar textos para anuncios, posts, landing pages e variacoes de abordagem conforme o canal.',
        entradas: ['Estrategia', 'Tom de voz', 'Objecoes', 'Provas'],
        saidas: ['Copies', 'Headlines', 'CTAs', 'Variacoes por canal'],
        aprovacao: 'Textos usados em campanha ou publicacao passam por aprovacao.',
      },
    },
  },
  {
    id: 'criativos',
    type: 'agent',
    position: { x: 880, y: 220 },
    data: {
      label: 'Gerador de Criativos',
      description: 'Imagens, carrosseis e briefs',
      eyebrow: 'Agente IA',
      status: 'Selecionado',
      accent: '#635bff',
      tone: 'blue',
      icon: Image,
      details: {
        objetivo: 'Gerar pecas visuais e briefs para designer a partir da estrategia aprovada e dos textos criados.',
        entradas: ['Estrategia', 'Copies', 'Guia visual', 'Referencias'],
        saidas: ['Imagens', 'Carrosseis', 'Prompts salvos', 'Brief para designer'],
        aprovacao: 'A YUX revisa antes de enviar para aprovacao do cliente ou campanha.',
      },
    },
  },
  {
    id: 'revisor',
    type: 'agent',
    position: { x: 1220, y: 220 },
    data: {
      label: 'Revisor de Marca',
      description: 'Qualidade e consistencia',
      eyebrow: 'Controle',
      status: 'Obrigatorio',
      accent: '#059669',
      tone: 'emerald',
      icon: ShieldCheck,
      details: {
        objetivo: 'Conferir se textos e criativos respeitam marca, clareza, promessa, qualidade e regras do contrato.',
        entradas: ['Criativos', 'Copies', 'Guia de marca', 'Regras de aprovacao'],
        saidas: ['Score de qualidade', 'Ajustes sugeridos', 'Bloqueios quando necessario'],
        aprovacao: 'Ativos com risco ou baixa qualidade nao avancam para publicacao.',
      },
    },
  },
  {
    id: 'aprovacao',
    type: 'approval',
    position: { x: 1540, y: 220 },
    data: {
      label: 'Aprovacao do cliente',
      description: 'Decisao antes de publicar',
      eyebrow: 'Aprovacao',
      status: 'Pendente',
      accent: '#f59e0b',
      tone: 'amber',
      icon: ClipboardCheck,
      details: {
        objetivo: 'Permitir que o cliente aprove, peca ajustes ou rejeite os ativos antes do uso.',
        entradas: ['Pacote revisado', 'Notas da YUX', 'Previa dos ativos'],
        saidas: ['Aprovado', 'Ajustes solicitados', 'Rejeitado'],
        aprovacao: 'Nada e publicado automaticamente sem liberacao quando o contrato exige aprovacao.',
      },
    },
  },
  {
    id: 'central',
    type: 'output',
    position: { x: 1880, y: 110 },
    data: {
      label: 'Central de Conteudo',
      description: 'Tudo salvo e rastreavel',
      eyebrow: 'Saida',
      status: 'Saida padrao',
      accent: '#b449a6',
      tone: 'pink',
      icon: Layers3,
      details: {
        objetivo: 'Organizar tudo que foi criado em um acervo unico para consulta, aprovacao, publicacao e reuso.',
        entradas: ['Criativos', 'Copies', 'Briefs', 'Status de aprovacao'],
        saidas: ['Ativos filtraveis', 'Historico', 'Reuso em campanhas e organico'],
        aprovacao: 'Cada ativo preserva status: rascunho, em aprovacao, aprovado, publicado ou usado em campanha.',
      },
    },
  },
  {
    id: 'campanhas',
    type: 'output',
    position: { x: 1880, y: 360 },
    data: {
      label: 'Campanhas',
      description: 'Rascunhos de ads',
      eyebrow: 'Saida',
      status: 'Opcional',
      accent: '#2563eb',
      tone: 'blue',
      icon: Megaphone,
      details: {
        objetivo: 'Levar ativos aprovados para rascunhos de campanha, sem publicar automaticamente.',
        entradas: ['Ativos aprovados', 'Publico', 'Objetivo', 'Orcamento sugerido'],
        saidas: ['Rascunho de campanha', 'Conjunto de criativos', 'Proximos passos'],
        aprovacao: 'Campanhas pagas continuam exigindo validacao final.',
      },
    },
  },
  {
    id: 'biblioteca',
    type: 'output',
    position: { x: 2200, y: 220 },
    data: {
      label: 'Biblioteca de Criativos',
      description: 'Referencias e variacoes',
      eyebrow: 'Saida',
      status: 'Automatico',
      accent: '#0891b2',
      tone: 'cyan',
      icon: Sparkles,
      details: {
        objetivo: 'Guardar criativos aprovados para comparacao, inspiracao e criacao de novas variacoes.',
        entradas: ['Criativos aprovados', 'Prompts', 'Tags', 'Objetivo'],
        saidas: ['Colecoes', 'Variacoes futuras', 'Referencias visuais'],
        aprovacao: 'Criativos nao aprovados ficam sinalizados como rascunho ou ajuste pendente.',
      },
    },
  },
]

const initialEdges: StudioFlowEdge[] = [
  { id: 'briefing-contexto', source: 'briefing', target: 'contexto', animated: true },
  { id: 'contexto-estrategista', source: 'contexto', target: 'estrategista' },
  { id: 'contexto-redator', source: 'contexto', target: 'redator' },
  { id: 'estrategista-criativos', source: 'estrategista', target: 'criativos' },
  { id: 'redator-criativos', source: 'redator', target: 'criativos' },
  { id: 'criativos-revisor', source: 'criativos', target: 'revisor', animated: true },
  { id: 'revisor-aprovacao', source: 'revisor', target: 'aprovacao' },
  { id: 'aprovacao-central', source: 'aprovacao', target: 'central', label: 'aprovado' },
  { id: 'central-campanhas', source: 'central', target: 'campanhas', label: 'ads' },
  { id: 'central-biblioteca', source: 'central', target: 'biblioteca', label: 'criativos' },
]

const tactics = [
  { title: 'Criar pacote Meta Ads', status: 'Pronto', icon: Megaphone, description: 'Criativos, copies e rascunho de campanha.' },
  { title: 'Post organico multicanal', status: 'Pronto', icon: Send, description: 'Adapta uma ideia para Instagram, LinkedIn e e-mail.' },
  { title: 'Radar semanal de ideias', status: 'Ativo', icon: Zap, description: 'Sugere pautas com base em mercado e historico.' },
  { title: 'Relatorio mensal de performance', status: 'Em breve', icon: BarChart3, description: 'Resumo executivo com aprendizados e proximos passos.' },
]

const nodeTypes = {
  trigger: StudioNode,
  context: StudioNode,
  agent: StudioNode,
  approval: StudioNode,
  output: StudioNode,
  note: NoteNode,
}

const quickLinks = [
  { label: 'Central de Conteudo', href: './conteudo', icon: Layers3 },
  { label: 'Biblioteca de Criativos', href: './criativos', icon: Sparkles },
  { label: 'Campanhas', href: './campanhas', icon: Megaphone },
]

export function PortalMarketingAutomationStudio(props: PortalMarketingAutomationStudioProps) {
  return (
    <ReactFlowProvider>
      <PortalMarketingAutomationStudioContent {...props} />
    </ReactFlowProvider>
  )
}

function PortalMarketingAutomationStudioContent({
  contents,
  settings,
  calendarItems,
  reviews,
}: PortalMarketingAutomationStudioProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<StudioFlowNode>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<StudioFlowEdge>(initialEdges)
  const [selectedNodeId, setSelectedNodeId] = useState('criativos')
  const [noteCount, setNoteCount] = useState(0)
  const { fitView, screenToFlowPosition } = useReactFlow<StudioFlowNode, StudioFlowEdge>()

  const selectedNode = nodes.find(node => node.id === selectedNodeId) || nodes.find(node => node.id === 'criativos') || nodes[0]
  const pendingReviews = reviews.filter(review => review.status === 'pending').length
  const approvedContents = contents.filter(content => content.status === 'approved' || content.status === 'published').length
  const scheduledItems = calendarItems.filter(item => item.status !== 'cancelled').length

  const onConnect = useCallback(
    (connection: Connection) => setEdges(current => addEdge({ ...connection, animated: true }, current)),
    [setEdges],
  )

  const handleNodeClick = useCallback((_event: unknown, node: StudioFlowNode) => {
    setSelectedNodeId(node.id)
  }, [])

  const handleAddNote = useCallback((event?: FlowPointerEvent) => {
    const nextCount = noteCount + 1
    const position = event
      ? screenToFlowPosition({ x: event.clientX, y: event.clientY })
      : { x: 1090 + nextCount * 28, y: 20 + nextCount * 28 }

    const noteNode: StudioFlowNode = {
      id: `nota-${Date.now()}`,
      type: 'note',
      position,
      data: {
        label: `Nota ${nextCount}`,
        description: 'Clique e arraste para posicionar. Use notas para registrar ajustes do fluxo.',
        eyebrow: 'Nota',
        status: 'Editavel',
        accent: '#f59e0b',
        tone: 'amber',
        icon: StickyNote,
        details: {
          objetivo: 'Registrar uma observacao visual dentro do fluxo.',
          entradas: ['Comentario manual'],
          saidas: ['Nota de revisao'],
          aprovacao: 'Notas nao disparam execucao e servem apenas como orientacao.',
        },
      },
    }

    setNoteCount(nextCount)
    setNodes(current => [...current, noteNode])
    setSelectedNodeId(noteNode.id)
  }, [noteCount, screenToFlowPosition, setNodes])

  const handlePaneContextMenu = useCallback((event: FlowPointerEvent) => {
    event.preventDefault?.()
    handleAddNote(event)
  }, [handleAddNote])

  useEffect(() => {
    window.setTimeout(() => fitView({ padding: 0.18, duration: 500 }), 50)
  }, [fitView])

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Marketing Studio</p>
          <h1 className="mt-1 text-3xl font-semibold text-[#141821]">Estudio de Automacoes</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Crie e acompanhe fluxos de agentes que transformam estrategia, textos, criativos e aprovacoes em ativos prontos para campanha.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <HeaderChip label="Modo" value={operationModeLabel(settings?.operationMode)} />
            <HeaderChip label="Creditos" value={String(settings?.currentCreditBalance ?? 0)} />
            <HeaderChip label="Conteudos" value={String(contents.length)} />
            <HeaderChip label="Aprovacoes" value={String(pendingReviews)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {quickLinks.map(item => (
            <a
              key={item.label}
              href={item.href}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </a>
          ))}
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Editor de nos</p>
              <h2 className="mt-1 text-lg font-semibold text-[#141821]">Gerar pacote Meta Ads</h2>
              <p className="mt-1 text-xs text-slate-500">Arraste os nos, use scroll para zoom e clique com o botao direito no canvas para adicionar uma nota.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleAddNote()}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-100"
              >
                <Plus className="h-4 w-4" />
                Adicionar nota
              </button>
              <button
                type="button"
                onClick={() => fitView({ padding: 0.18, duration: 500 })}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Move className="h-4 w-4" />
                Ajustar visao
              </button>
            </div>
          </div>

          <div className="h-[680px] bg-[#f8fafc]">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={handleNodeClick}
              onPaneContextMenu={handlePaneContextMenu}
              fitView
              minZoom={0.22}
              maxZoom={1.45}
              panOnDrag
              zoomOnScroll
              zoomOnPinch
              nodesDraggable
              nodesConnectable
              className="bg-[#f8fafc]"
            >
              <Background color="#cbd5e1" gap={18} />
              <Controls position="bottom-right" />
              <MiniMap
                pannable
                zoomable
                position="bottom-left"
                nodeColor={node => String(node.data?.accent || '#94a3b8')}
                className="!border !border-slate-200 !bg-white/90"
              />
            </ReactFlow>
          </div>
        </div>

        <aside className="rounded-md border border-slate-300 bg-white xl:col-span-2 min-[1800px]:col-span-1">
          <div className="border-b border-slate-200 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className={`flex h-10 w-10 items-center justify-center rounded-md border ${toneClass(selectedNode.data.tone)}`}>
                  <selectedNode.data.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#141821]">{selectedNode.data.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{selectedNode.data.eyebrow} / {selectedNode.data.status}</p>
                </div>
              </div>
              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">Visivel ao cliente</span>
            </div>
          </div>
          <div className="space-y-4 p-4">
            <InspectorBlock title="O que acontece aqui">
              <p>{selectedNode.data.details.objetivo}</p>
            </InspectorBlock>
            <InspectorBlock title="Dados usados">
              <TagList items={selectedNode.data.details.entradas} />
            </InspectorBlock>
            <InspectorBlock title="O que pode gerar">
              <TagList items={selectedNode.data.details.saidas} />
            </InspectorBlock>
            <InspectorBlock title="Controle e aprovacao">
              <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{selectedNode.data.details.aprovacao}</p>
              </div>
            </InspectorBlock>
          </div>
        </aside>
      </div>
    </section>
  )
}

function StudioNode({ data, selected }: NodeProps<StudioFlowNode>) {
  const Icon = data.icon

  return (
    <div className={`w-64 overflow-hidden rounded-md border bg-white text-left shadow-sm transition ${selected ? 'border-blue-500 ring-4 ring-blue-100' : 'border-slate-300'}`}>
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-white" style={{ background: data.accent }} />
      <span className="block h-1.5" style={{ background: data.accent }} />
      <div className="flex gap-3 p-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${toneClass(data.tone)}`}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{data.eyebrow}</span>
          <span className="mt-1 block text-sm font-semibold leading-snug text-[#141821]">{data.label}</span>
          <span className="mt-1 block text-xs leading-snug text-slate-500">{data.description}</span>
          <span className="mt-2 inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">{data.status}</span>
        </span>
      </div>
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-white" style={{ background: data.accent }} />
    </div>
  )
}

function NoteNode({ data, selected }: NodeProps<StudioFlowNode>) {
  return (
    <div className={`w-60 rounded-md border bg-amber-50 p-3 shadow-sm ${selected ? 'border-amber-500 ring-4 ring-amber-100' : 'border-amber-200'}`}>
      <div className="flex items-start gap-2">
        <StickyNote className="mt-0.5 h-4 w-4 text-amber-600" />
        <div>
          <p className="text-sm font-semibold text-amber-950">{data.label}</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-800">{data.description}</p>
        </div>
      </div>
    </div>
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
  icon: LucideIcon
  label: string
  value: number | string
  detail: string
  tone?: 'neutral' | 'warning' | 'success' | 'brand'
}) {
  const className = {
    neutral: 'text-slate-600 border-slate-200 bg-white',
    warning: 'text-amber-600 border-amber-200 bg-amber-50/70',
    success: 'text-emerald-600 border-emerald-200 bg-emerald-50/70',
    brand: 'text-blue-600 border-blue-200 bg-blue-50/70',
  }[tone]

  return (
    <div className="flex items-center gap-4 p-4">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${className}`}>
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

function statusClass(status: string) {
  const base = 'mt-2 inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium'
  if (status === 'Pronto' || status === 'Ativo') return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`
  if (status === 'Em breve') return `${base} border-slate-200 bg-slate-50 text-slate-600`
  return `${base} border-violet-200 bg-violet-50 text-violet-700`
}

function toneClass(tone: StudioNodeData['tone']) {
  const classes = {
    slate: 'border-slate-200 bg-slate-50 text-slate-600',
    blue: 'border-blue-200 bg-blue-50 text-blue-600',
    violet: 'border-violet-200 bg-violet-50 text-violet-600',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-600',
    amber: 'border-amber-200 bg-amber-50 text-amber-600',
    pink: 'border-pink-200 bg-pink-50 text-pink-600',
    cyan: 'border-cyan-200 bg-cyan-50 text-cyan-600',
  }

  return classes[tone]
}

function operationModeLabel(mode?: string) {
  if (mode === 'managed_by_yux') return 'Gerenciado pela YUX'
  if (mode === 'assisted_client') return 'Cliente assistido'
  if (mode === 'advanced_partner') return 'Parceiro avancado'
  return 'Cliente assistido'
}
