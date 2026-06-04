import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  addEdge,
  MiniMap
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { AlertCircle, HelpCircle, LayoutGrid, Plus, Save, Settings } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NodeConfigSidebar } from './NodeConfigSidebar'
import { automationTriggerCatalog } from '@/lib/automations/automationCatalog'
import type { AutomationFlow } from '@/types/automation'

interface AutomationNodeEditorProps {
  flow: AutomationFlow
  onSaveGraph: (graph: { nodes: any[]; edges: any[] }) => Promise<void>
}

const actionTypes = [
  { value: 'create_task', label: 'Criar tarefa' },
  { value: 'change_stage', label: 'Mover etapa' },
  { value: 'assign_owner', label: 'Atribuir responsável' },
  { value: 'send_whatsapp', label: 'Enviar WhatsApp' },
  { value: 'send_email', label: 'Enviar email' },
  { value: 'create_ticket', label: 'Criar ticket' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'call_api', label: 'Chamar API' },
]

// Custom Node: Trigger
function TriggerNode({ data }: { data: any }) {
  const triggerLabel = automationTriggerCatalog.find(t => t.key === data.triggerType)?.label || data.triggerType || 'Definir evento...'
  return (
    <div className="rounded-md border-2 border-blue-400 bg-blue-50 px-3 py-2.5 shadow-md w-48 text-center text-xs relative">
      <Badge variant="outline" className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-blue-500 text-white font-semibold text-[8px] py-0 px-1 border-0">
        GATILHO
      </Badge>
      <p className="font-semibold text-slate-800 truncate mt-1">{triggerLabel}</p>
      {data.triggerType && <p className="text-[8px] text-slate-500 truncate">{data.triggerType}</p>}
      <Handle type="source" position={Position.Bottom} className="w-2.5 h-2.5 bg-blue-500 border border-white" />
    </div>
  )
}

// Custom Node: Condition / Decision (Bifurcated)
function ConditionNode({ data }: { data: any }) {
  const opLabel = data.operator === 'exists' ? 'está preenchido' : data.operator === 'equals' ? 'é igual a' : data.operator || ''
  const ruleText = data.field ? `${data.field} ${opLabel} ${data.value !== undefined ? String(data.value) : ''}` : 'Configurar regras...'
  
  return (
    <div className="rounded-md border-2 border-amber-400 bg-amber-50 px-3 py-2 shadow-md w-48 text-center text-xs relative">
      <Badge variant="outline" className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-amber-500 text-white font-semibold text-[8px] py-0 px-1 border-0">
        FILTRO / REGRAS
      </Badge>
      <Handle type="target" position={Position.Top} className="w-2.5 h-2.5 bg-amber-400 border border-white" />
      <p className="font-semibold text-slate-800 truncate mt-1">{ruleText}</p>
      
      {/* Handles represent branches: left for true, right for false */}
      <div className="flex justify-between mt-2 pt-2 border-t border-amber-200 text-[8px] font-bold text-slate-500">
        <span className="text-green-600">SIM (True)</span>
        <span className="text-red-600">NÃO (False)</span>
      </div>
      <Handle type="source" position={Position.Bottom} id="true" style={{ left: '25%' }} className="w-2.5 h-2.5 bg-green-500 border border-white" />
      <Handle type="source" position={Position.Bottom} id="false" style={{ left: '75%' }} className="w-2.5 h-2.5 bg-red-500 border border-white" />
    </div>
  )
}

// Custom Node: Action
function ActionNode({ data }: { data: any }) {
  const label = actionTypes.find(a => a.value === data.actionType)?.label || data.actionType || 'Definir ação...'
  const attachments = data.payload?.attachments || []

  return (
    <div className="rounded-md border-2 border-emerald-400 bg-emerald-50 px-3 py-2 shadow-md w-48 text-center text-xs relative">
      <Badge variant="outline" className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-emerald-500 text-white font-semibold text-[8px] py-0 px-1 border-0">
        AÇÃO
      </Badge>
      <Handle type="target" position={Position.Top} className="w-2.5 h-2.5 bg-emerald-400 border border-white" />
      <div className="space-y-1 mt-1">
        <p className="font-semibold text-slate-800 truncate">{label}</p>
        {attachments.length > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1 py-0.5 text-[8px] text-emerald-800 border border-emerald-200">
            📎 {attachments.length} anexo(s)
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="w-2.5 h-2.5 bg-emerald-500 border border-white" />
    </div>
  )
}

const nodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  action: ActionNode,
}

// Convert traditional database rows into a linear React Flow nodes/edges
function convertLinearFlowToGraph(flow: AutomationFlow) {
  const nodes: any[] = []
  const edges: any[] = []
  let currentY = 50

  // 1. Trigger
  if (flow.triggers && flow.triggers.length > 0) {
    const trigger = flow.triggers[0]
    nodes.push({
      id: `trigger-${trigger.id || 'initial'}`,
      type: 'trigger',
      position: { x: 250, y: currentY },
      data: { triggerType: trigger.triggerType, config: trigger.config },
    })
  } else {
    // Default trigger node if empty
    nodes.push({
      id: 'trigger-default',
      type: 'trigger',
      position: { x: 250, y: currentY },
      data: { triggerType: '', config: {} },
    })
  }
  currentY += 120

  // 2. Condition node
  let lastNodeId = nodes[0].id
  if (flow.conditions && flow.conditions.length > 0) {
    const condId = 'condition-group'
    const firstCond = flow.conditions[0]
    nodes.push({
      id: condId,
      type: 'condition',
      position: { x: 250, y: currentY },
      data: { field: firstCond.field, operator: firstCond.operator, value: firstCond.value },
    })
    edges.push({
      id: `e-${lastNodeId}-${condId}`,
      source: lastNodeId,
      target: condId,
    })
    lastNodeId = condId
    currentY += 140
  }

  // 3. Actions sequential chain
  if (flow.actions && flow.actions.length > 0) {
    const sorted = [...flow.actions].sort((a, b) => a.orderIndex - b.orderIndex)
    sorted.forEach((action, idx) => {
      const actId = `action-${action.id}`
      nodes.push({
        id: actId,
        type: 'action',
        position: { x: 250, y: currentY },
        data: { actionType: action.actionType, payload: action.payload },
      })

      edges.push({
        id: `e-${lastNodeId}-${actId}`,
        source: lastNodeId,
        // If coming out of a condition node, target the 'true' path as default
        sourceHandle: lastNodeId === 'condition-group' ? 'true' : undefined,
        target: actId,
      })

      lastNodeId = actId
      currentY += 120
    })
  }

  return { nodes, edges }
}

export function AutomationNodeEditor({ flow, onSaveGraph }: AutomationNodeEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedNode, setSelectedNode] = useState<any | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Initialize nodes and edges
  useEffect(() => {
    if (flow.graph && flow.graph.nodes && flow.graph.nodes.length > 0) {
      setNodes(flow.graph.nodes)
      setEdges(flow.graph.edges || [])
    } else {
      const graph = convertLinearFlowToGraph(flow)
      setNodes(graph.nodes)
      setEdges(graph.edges)
    }
  }, [flow.id])

  const onConnect = useCallback(
    (connection: any) => setEdges(eds => addEdge({ ...connection, animated: true }, eds)),
    [setEdges]
  )

  const onNodeClick = useCallback((_e: any, node: any) => {
    setSelectedNode(node)
    setSidebarOpen(true)
  }, [])

  const handleUpdateNodeData = (nodeId: string, updatedData: any) => {
    setNodes(nds =>
      nds.map(node => {
        if (node.id === nodeId) {
          return { ...node, data: updatedData }
        }
        return node
      })
    )
  }

  const handleAddNode = (type: 'trigger' | 'condition' | 'action') => {
    const id = `${type}-${Date.now()}`
    let initialData = {}
    if (type === 'trigger') initialData = { triggerType: '', config: {} }
    if (type === 'condition') initialData = { field: 'source', operator: 'equals', value: '' }
    if (type === 'action') initialData = { actionType: 'send_whatsapp', payload: { body: '' } }

    const newNode = {
      id,
      type,
      position: { x: 100 + Math.random() * 200, y: 150 + Math.random() * 200 },
      data: initialData,
    }

    setNodes(nds => [...nds, newNode])
    setSelectedNode(newNode)
    setSidebarOpen(true)
  }

  const handleDeleteSelected = () => {
    // Delete selected nodes or edges
    setNodes(nds => nds.filter(n => !n.selected))
    setEdges(eds => eds.filter(e => !e.selected))
    setSidebarOpen(false)
    setSelectedNode(null)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSaveGraph({ nodes, edges })
      toast.success('Estrutura de nós salva com sucesso!')
    } catch (err) {
      console.error('Erro ao salvar grafo:', err)
      toast.error('Erro ao salvar as conexões no servidor')
    } finally {
      setSaving(false)
    }
  }

  const handleAutoLayout = () => {
    // Very simple vertical layout recalculation
    setNodes(nds => {
      const triggers = nds.filter(n => n.type === 'trigger')
      const conditions = nds.filter(n => n.type === 'condition')
      const actions = nds.filter(n => n.type === 'action')
      
      const newNodes = [...nds]
      let currentY = 50

      triggers.forEach((node, idx) => {
        const item = newNodes.find(n => n.id === node.id)
        if (item) item.position = { x: 250 + (idx * 240), y: currentY }
      })
      currentY += 130

      conditions.forEach((node, idx) => {
        const item = newNodes.find(n => n.id === node.id)
        if (item) item.position = { x: 250 + (idx * 240), y: currentY }
      })
      currentY += 150

      actions.forEach((node, idx) => {
        const item = newNodes.find(n => n.id === node.id)
        if (item) item.position = { x: 250 + (idx * 240), y: currentY }
      })

      return newNodes
    })
    toast.success('Layout realinhado verticalmente!')
  }

  return (
    <div className="relative h-[600px] border rounded bg-slate-50 overflow-hidden flex flex-col">
      <header className="flex h-12 items-center justify-between border-b bg-white px-4 shrink-0">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-slate-100 hover:bg-slate-200">
            Modo Nós / Editor Visual
          </Badge>
          <span className="text-[10px] text-slate-500 flex items-center gap-1">
            <HelpCircle className="h-3.5 w-3.5" />
            Selecione um nó para configurar. Use as conexões "SIM" e "NÃO" nos Filtros para bifurcar.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleAutoLayout}
            title="Auto layout vertical"
          >
            <LayoutGrid className="h-4 w-4 mr-1" />
            Auto Layout
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving}
          >
            <Save className="h-4 w-4 mr-1" />
            Salvar Nós
          </Button>
        </div>
      </header>

      <div className="flex-1 min-w-0 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background color="#cbd5e1" gap={16} />
          <Controls />
          <MiniMap />
        </ReactFlow>

        {/* Floating panel for actions */}
        <div className="absolute left-4 bottom-4 flex flex-col gap-2 bg-white/95 p-3 rounded-lg border shadow-lg z-10">
          <p className="text-[10px] font-bold text-slate-500 uppercase">Adicionar Blocos</p>
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => handleAddNode('trigger')}
              className="text-[10px] border-blue-200 text-blue-700 bg-blue-50/50 hover:bg-blue-50"
            >
              + Gatilho
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => handleAddNode('condition')}
              className="text-[10px] border-amber-200 text-amber-700 bg-amber-50/50 hover:bg-amber-50"
            >
              + Filtro
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => handleAddNode('action')}
              className="text-[10px] border-emerald-200 text-emerald-700 bg-emerald-50/50 hover:bg-emerald-50"
            >
              + Ação
            </Button>
          </div>
          <div className="border-t pt-2 mt-1">
            <Button
              type="button"
              size="xs"
              variant="destructive"
              onClick={handleDeleteSelected}
              className="text-[10px] w-full"
            >
              Remover Selecionado
            </Button>
          </div>
        </div>
      </div>

      <NodeConfigSidebar
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        node={selectedNode}
        onUpdate={handleUpdateNodeData}
        organizationId={flow.organizationId}
      />
    </div>
  )
}
