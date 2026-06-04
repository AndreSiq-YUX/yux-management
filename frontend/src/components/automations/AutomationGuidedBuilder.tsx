import { AlertCircle, ArrowDown, CheckCircle2, GitBranch, GripVertical, Pencil, Play, Plus, Trash2, Workflow } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { automationTriggerCatalog } from '@/lib/automations/automationCatalog'
import { validateFlow } from '@/lib/automations/automationValidation'
import { Tooltip } from './Tooltip'
import type { AutomationAction, AutomationCondition, AutomationFlow, AutomationTrigger } from '@/types/automation'
import type { AutomationModule } from '@/types/intelligentAutomation'

interface AutomationGuidedBuilderProps {
  flow?: AutomationFlow
  onAddTrigger?: (triggerType: string, config: Record<string, unknown>) => void
  onUpdateTrigger?: (triggerId: string, triggerType: string, config: Record<string, unknown>) => void
  onDeleteTrigger?: (triggerId: string) => void
  onAddCondition?: (field: string, operator: string, value?: unknown) => void
  onUpdateCondition?: (conditionId: string, field: string, operator: string, value?: unknown) => void
  onDeleteCondition?: (conditionId: string) => void
  onAddAction?: (actionType: string, payload: Record<string, unknown>) => void
  onUpdateAction?: (actionId: string, actionType: string, payload: Record<string, unknown>) => void
  onDeleteAction?: (actionId: string) => void
  onReorderActions?: (actions: AutomationAction[]) => void
  disabled?: boolean
}

const conditionOperators = [
  { value: 'equals', label: 'igual a', description: 'Verifica se o valor é exatamente igual' },
  { value: 'not_equals', label: 'diferente de', description: 'Verifica se o valor é diferente' },
  { value: 'contains', label: 'contém', description: 'Verifica se o valor contém o texto' },
  { value: 'greater_than', label: 'maior que', description: 'Verifica se é maior (números)' },
  { value: 'less_than', label: 'menor que', description: 'Verifica se é menor (números)' },
  { value: 'exists', label: 'existe', description: 'Verifica se o campo tem valor (não vazio)' },
]

const suggestedFields = [
  { value: 'source', label: 'Origem do lead', example: 'instagram, google, indicacao', type: 'text' },
  { value: 'stage', label: 'Etapa do pipeline', example: 'novo, qualificado, proposta', type: 'text' },
  { value: 'status', label: 'Status do lead', example: 'active, won, lost', type: 'text' },
  { value: 'owner', label: 'Responsável', example: 'user-id ou nome', type: 'text' },
  { value: 'temperature', label: 'Temperatura', example: 'hot, warm, cold', type: 'text' },
  { value: 'value', label: 'Valor da proposta', example: '1000, 5000', type: 'number' },
  { value: 'days_in_stage', label: 'Dias na etapa', example: '5, 10, 30', type: 'number' },
  { value: 'email', label: 'Email', example: 'contato@empresa.com', type: 'text' },
  { value: 'phone', label: 'Telefone', example: '+5511999999999', type: 'text' },
  { value: 'company', label: 'Empresa', example: 'Nome da empresa', type: 'text' },
]

const actionTypes = [
  { value: 'create_task', label: 'Criar tarefa', group: 'CRM' },
  { value: 'change_stage', label: 'Mover etapa', group: 'CRM' },
  { value: 'assign_owner', label: 'Atribuir responsavel', group: 'CRM' },
  { value: 'update_field', label: 'Atualizar campo', group: 'CRM' },
  { value: 'register_activity', label: 'Registrar atividade', group: 'CRM' },
  { value: 'send_whatsapp', label: 'Enviar WhatsApp', group: 'Comunicacao' },
  { value: 'send_email', label: 'Enviar email', group: 'Comunicacao' },
  { value: 'create_ticket', label: 'Criar ticket', group: 'Suporte' },
  { value: 'webhook', label: 'Webhook', group: 'Integracao' },
  { value: 'call_api', label: 'Chamar API', group: 'Integracao' },
  { value: 'ai_classify_lead', label: 'Classificar lead (IA)', group: 'IA' },
  { value: 'ai_generate_message', label: 'Gerar mensagem (IA)', group: 'IA' },
  { value: 'ai_generate_proposal', label: 'Gerar proposta (IA)', group: 'IA' },
]

const triggersByModule = automationTriggerCatalog.reduce<Record<string, typeof automationTriggerCatalog>>((acc, trigger) => {
  if (!acc[trigger.module]) acc[trigger.module] = []
  acc[trigger.module].push(trigger)
  return acc
}, {})

const moduleLabels: Record<AutomationModule, string> = {
  crm: 'CRM',
  omnichannel: 'Omnichannel',
  landing_pages: 'Landing Pages',
  proposals: 'Propostas',
  projects: 'Projetos',
  finance: 'Financeiro',
  campaigns: 'Campanhas',
  reports: 'Relatorios',
  support: 'Suporte',
}

export function AutomationGuidedBuilder({
  flow,
  onAddTrigger,
  onUpdateTrigger,
  onDeleteTrigger,
  onAddCondition,
  onUpdateCondition,
  onDeleteCondition,
  onAddAction,
  onUpdateAction,
  onDeleteAction,
  onReorderActions,
  disabled,
}: AutomationGuidedBuilderProps) {
  if (!flow) {
    return (
      <section className="rounded-md border bg-white p-4">
        <div className="flex items-center justify-center min-h-[200px] text-sm text-gray-500">
          Selecione um fluxo para editar ou crie um novo.
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Builder guiado</h2>
          <p className="text-sm text-slate-600">Configure o trigger, condicoes e acoes do fluxo.</p>
        </div>
      </div>
      <div className="space-y-3">
        <TriggerStep
          triggers={flow.triggers}
          onAdd={onAddTrigger}
          onUpdate={onUpdateTrigger}
          onDelete={onDeleteTrigger}
          disabled={disabled}
        />
        <StepConnector />
        <ConditionStep
          conditions={flow.conditions}
          onAdd={onAddCondition}
          onUpdate={onUpdateCondition}
          onDelete={onDeleteCondition}
          disabled={disabled}
        />
        <StepConnector />
        <ActionStep
          actions={flow.actions}
          onAdd={onAddAction}
          onUpdate={onUpdateAction}
          onDelete={onDeleteAction}
          onReorder={onReorderActions}
          disabled={disabled}
        />
      </div>
    </section>
  )
}

function StepConnector() {
  return (
    <div className="flex justify-center">
      <ArrowDown className="h-4 w-4 text-slate-300" />
    </div>
  )
}

function TriggerStep({
  triggers,
  onAdd,
  onUpdate,
  onDelete,
  disabled,
}: {
  triggers: AutomationTrigger[]
  onAdd?: (triggerType: string, config: Record<string, unknown>) => void
  onUpdate?: (triggerId: string, triggerType: string, config: Record<string, unknown>) => void
  onDelete?: (triggerId: string) => void
  disabled?: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="rounded-md border bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <GitBranch className="h-4 w-4" />
          Quando (Trigger)
        </div>
        {!adding && (
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-3 w-3" />
            {triggers.length ? 'Adicionar' : 'Configurar'}
          </Button>
        )}
      </div>
      {triggers.length === 0 && !adding && (
        <p className="text-sm text-slate-500">Nenhum trigger configurado.</p>
      )}
      <div className="space-y-2">
        {triggers.map(trigger => (
          <div key={trigger.id}>
            {editingId === trigger.id ? (
              <TriggerEditor
                trigger={trigger}
                onSave={(triggerType, config) => {
                  onUpdate?.(trigger.id, triggerType, config)
                  setEditingId(null)
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {automationTriggerCatalog.find(t => t.key === trigger.triggerType)?.label || trigger.triggerType}
                  </p>
                  <p className="text-xs text-slate-500">{trigger.triggerType}</p>
                </div>
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(trigger.id)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => onDelete?.(trigger.id)}>
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
        {adding && (
          <TriggerEditor
            onSave={(triggerType, config) => {
              onAdd?.(triggerType, config)
              setAdding(false)
            }}
            onCancel={() => setAdding(false)}
          />
        )}
      </div>
    </div>
  )
}

function TriggerEditor({
  trigger,
  onSave,
  onCancel,
}: {
  trigger?: AutomationTrigger
  onSave: (triggerType: string, config: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [triggerType, setTriggerType] = useState(trigger?.triggerType || '')

  return (
    <div className="rounded-md border border-blue-200 bg-blue-50 p-3 space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Evento</Label>
        <Select value={triggerType} onValueChange={setTriggerType}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Selecione um evento" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(triggersByModule).map(([module, triggers]) => (
              <div key={module}>
                <div className="px-2 py-1 text-xs font-semibold text-slate-500">
                  {moduleLabels[module as AutomationModule] || module}
                </div>
                {triggers.map(t => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label}
                  </SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={() => onSave(triggerType, {})} disabled={!triggerType}>
          Salvar
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

function ConditionStep({
  conditions,
  onAdd,
  onUpdate,
  onDelete,
  disabled,
}: {
  conditions: AutomationCondition[]
  onAdd?: (field: string, operator: string, value?: unknown) => void
  onUpdate?: (conditionId: string, field: string, operator: string, value?: unknown) => void
  onDelete?: (conditionId: string) => void
  disabled?: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="rounded-md border bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Workflow className="h-4 w-4" />
          Se (Condicoes)
        </div>
        {!adding && (
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-3 w-3" />
            {conditions.length ? 'Adicionar' : 'Configurar'}
          </Button>
        )}
      </div>
      {conditions.length === 0 && !adding && (
        <p className="text-sm text-slate-500">Nenhuma condicao configurada. Todas as execucoes prosseguem sem filtro.</p>
      )}
      <div className="space-y-2">
        {conditions.map(condition => (
          <div key={condition.id}>
            {editingId === condition.id ? (
              <ConditionEditor
                condition={condition}
                onSave={(field, operator, value) => {
                  onUpdate?.(condition.id!, field, operator, value)
                  setEditingId(null)
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {condition.field}{' '}
                    <span className="text-slate-500">{conditionOperators.find(op => op.value === condition.operator)?.label || condition.operator}</span>{' '}
                    {condition.value !== undefined && condition.value !== null ? String(condition.value) : ''}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(condition.id!)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => onDelete?.(condition.id!)}>
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
        {adding && (
          <ConditionEditor
            onSave={(field, operator, value) => {
              onAdd?.(field, operator, value)
              setAdding(false)
            }}
            onCancel={() => setAdding(false)}
          />
        )}
      </div>
    </div>
  )
}

function ConditionEditor({
  condition,
  onSave,
  onCancel,
}: {
  condition?: AutomationCondition
  onSave: (field: string, operator: string, value?: unknown) => void
  onCancel: () => void
}) {
  const [field, setField] = useState(condition?.field || '')
  const [operator, setOperator] = useState<string>(condition?.operator || 'equals')
  const [value, setValue] = useState(condition?.value !== undefined ? String(condition.value) : '')
  const [useCustomField, setUseCustomField] = useState(false)

  const needsValue = operator !== 'exists'
  const selectedField = suggestedFields.find(f => f.value === field)
  const isNumberField = selectedField?.type === 'number' || field === 'value' || field === 'days_in_stage'
  const selectedOperator = conditionOperators.find(op => op.value === operator)

  return (
    <div className="rounded-md border border-blue-200 bg-blue-50 p-3 space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Campo para verificar</Label>
        {!useCustomField ? (
          <div className="space-y-2">
            <Select value={field} onValueChange={setField}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Selecione um campo" />
              </SelectTrigger>
              <SelectContent>
                {suggestedFields.map(f => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
                <div className="border-t my-1" />
                <button
                  type="button"
                  className="w-full text-left px-2 py-1.5 text-xs text-blue-600 hover:bg-blue-50"
                  onClick={() => setUseCustomField(true)}
                >
                  + Usar campo personalizado
                </button>
              </SelectContent>
            </Select>
            {selectedField && (
              <p className="text-xs text-slate-600">
                Exemplo: <code className="bg-slate-100 px-1 rounded">{selectedField.example}</code>
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Input
              className="h-8 text-xs"
              placeholder="Nome do campo (ex: custom_field)"
              value={field}
              onChange={e => setField(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => { setUseCustomField(false); setField('') }}
            >
              ← Voltar para campos sugeridos
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Operador</Label>
        <Select value={operator} onValueChange={setOperator}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {conditionOperators.map(op => (
              <div key={op.value} className="px-2 py-1">
                <SelectItem value={op.value}>{op.label}</SelectItem>
                <p className="text-xs text-slate-500 pl-8 pb-1">{op.description}</p>
              </div>
            ))}
          </SelectContent>
        </Select>
        {selectedOperator && (
          <p className="text-xs text-slate-600">{selectedOperator.description}</p>
        )}
      </div>

      {needsValue && (
        <div className="space-y-1">
          <Label className="text-xs">Valor</Label>
          <Input
            className="h-8 text-xs"
            placeholder={selectedField?.example || 'Digite o valor'}
            value={value}
            onChange={e => setValue(e.target.value)}
            type={isNumberField ? 'number' : 'text'}
          />
        </div>
      )}

      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={() => onSave(field, operator, needsValue ? (isNumberField ? Number(value) : value) : undefined)} disabled={!field}>
          Salvar
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

function ActionStep({
  actions,
  onAdd,
  onUpdate,
  onDelete,
  onReorder,
  disabled,
}: {
  actions: AutomationAction[]
  onAdd?: (actionType: string, payload: Record<string, unknown>) => void
  onUpdate?: (actionId: string, actionType: string, payload: Record<string, unknown>) => void
  onDelete?: (actionId: string) => void
  onReorder?: (actions: AutomationAction[]) => void
  disabled?: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const sorted = [...actions].sort((a, b) => a.orderIndex - b.orderIndex)

  const handleDragStart = (actionId: string) => {
    setDraggedId(actionId)
  }

  const handleDragOver = (e: React.DragEvent, actionId: string) => {
    e.preventDefault()
    setDragOverId(actionId)
  }

  const handleDragLeave = () => {
    setDragOverId(null)
  }

  const handleDrop = (targetId: string) => {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null)
      setDragOverId(null)
      return
    }

    const newSorted = [...sorted]
    const draggedIndex = newSorted.findIndex(a => a.id === draggedId)
    const targetIndex = newSorted.findIndex(a => a.id === targetId)

    if (draggedIndex === -1 || targetIndex === -1) return

    const [dragged] = newSorted.splice(draggedIndex, 1)
    newSorted.splice(targetIndex, 0, dragged)

    const reordered = newSorted.map((action, index) => ({
      ...action,
      orderIndex: index + 1,
    }))

    onReorder?.(reordered)
    setDraggedId(null)
    setDragOverId(null)
  }

  const handleDragEnd = () => {
    setDraggedId(null)
    setDragOverId(null)
  }

  const validation = validateFlow({ triggers: [], conditions: [], actions: sorted })

  return (
    <div className="rounded-md border bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Play className="h-4 w-4" />
          Entao (Acoes)
          <Tooltip content="Arraste para reordenar as ações. Elas executam na ordem definida." />
        </div>
        {!adding && (
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-3 w-3" />
            {actions.length ? 'Adicionar' : 'Configurar'}
          </Button>
        )}
      </div>

      {validation.errors.length > 0 && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-2">
          {validation.errors.map((error, index) => (
            <div key={index} className="flex items-start gap-1 text-xs text-red-800">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          ))}
        </div>
      )}

      {validation.warnings.length > 0 && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2">
          {validation.warnings.map((warning, index) => (
            <div key={index} className="flex items-start gap-1 text-xs text-amber-800">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}

      {actions.length === 0 && !adding && (
        <p className="text-sm text-slate-500">Nenhuma acao configurada.</p>
      )}
      <div className="space-y-2">
        {sorted.map((action, index) => {
          const isDragged = draggedId === action.id
          const isDragOver = dragOverId === action.id

          return (
            <div
              key={action.id}
              draggable
              onDragStart={() => handleDragStart(action.id)}
              onDragOver={e => handleDragOver(e, action.id)}
              onDragLeave={handleDragLeave}
              onDrop={() => handleDrop(action.id)}
              onDragEnd={handleDragEnd}
              className={`transition-all ${
                isDragged ? 'opacity-50' : ''
              } ${
                isDragOver ? 'border-2 border-blue-400 rounded-md' : ''
              }`}
            >
              {editingId === action.id ? (
                <ActionEditor
                  action={action}
                  onSave={(actionType, payload) => {
                    onUpdate?.(action.id, actionType, payload)
                    setEditingId(null)
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 cursor-move hover:bg-slate-100">
                  <GripVertical className="h-4 w-4 text-slate-400 shrink-0" />
                  <Badge variant="outline" className="text-xs shrink-0">{index + 1}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {actionTypes.find(t => t.value === action.actionType)?.label || action.actionType}
                    </p>
                    {Object.keys(action.payload).length > 0 && (
                      <p className="text-xs text-slate-500 truncate">
                        {Object.entries(action.payload).map(([k, v]) => `${k}: ${String(v)}`).join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(action.id)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => onDelete?.(action.id)}>
                      <Trash2 className="h-3 w-3 text-red-500" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {adding && (
          <ActionEditor
            orderIndex={actions.length + 1}
            onSave={(actionType, payload) => {
              onAdd?.(actionType, payload)
              setAdding(false)
            }}
            onCancel={() => setAdding(false)}
          />
        )}
      </div>

      {actions.length > 0 && (
        <div className="mt-3 flex items-center gap-1 text-xs text-slate-500">
          <CheckCircle2 className="h-3 w-3" />
          <span>{actions.length} ação(ões) configurada(s) - arraste para reordenar</span>
        </div>
      )}
    </div>
  )
}

function ActionEditor({
  action,
  orderIndex,
  onSave,
  onCancel,
}: {
  action?: AutomationAction
  orderIndex?: number
  onSave: (actionType: string, payload: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [actionType, setActionType] = useState(action?.actionType || '')
  const [payload, setPayload] = useState<Record<string, unknown>>(action?.payload || {})

  const updatePayload = (key: string, value: unknown) => {
    setPayload(prev => ({ ...prev, [key]: value }))
  }

  const actionGroups = actionTypes.reduce<Record<string, typeof actionTypes>>((acc, action) => {
    if (!acc[action.group]) acc[action.group] = []
    acc[action.group].push(action)
    return acc
  }, {})

  return (
    <div className="rounded-md border border-blue-200 bg-blue-50 p-3 space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Tipo de acao</Label>
        <Select value={actionType} onValueChange={setActionType}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Selecione uma acao" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(actionGroups).map(([group, actions]) => (
              <div key={group}>
                <div className="px-2 py-1 text-xs font-semibold text-slate-500">{group}</div>
                {actions.map(a => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>
      </div>

      {actionType && <ActionPayloadFields actionType={actionType} payload={payload} onUpdate={updatePayload} />}

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => onSave(actionType, { ...payload, orderIndex })}
          disabled={!actionType}
        >
          Salvar
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

function ActionPayloadFields({
  actionType,
  payload,
  onUpdate,
}: {
  actionType: string
  payload: Record<string, unknown>
  onUpdate: (key: string, value: unknown) => void
}) {
  switch (actionType) {
    case 'create_task':
      return (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">Titulo da tarefa</Label>
            <Input className="h-8 text-xs" placeholder="Ex: Follow-up comercial" value={String(payload.title || '')} onChange={e => onUpdate('title', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Descricao</Label>
            <Textarea className="text-xs min-h-[60px]" placeholder="Detalhes da tarefa..." value={String(payload.description || '')} onChange={e => onUpdate('description', e.target.value)} />
          </div>
        </div>
      )
    case 'change_stage':
      return (
        <div className="space-y-1">
          <Label className="text-xs">ID da etapa de destino</Label>
          <Input className="h-8 text-xs" placeholder="stage-id" value={String(payload.stageId || '')} onChange={e => onUpdate('stageId', e.target.value)} />
        </div>
      )
    case 'assign_owner':
      return (
        <div className="space-y-1">
          <Label className="text-xs">ID do responsavel</Label>
          <Input className="h-8 text-xs" placeholder="user-id" value={String(payload.ownerId || '')} onChange={e => onUpdate('ownerId', e.target.value)} />
        </div>
      )
    case 'send_whatsapp':
      return (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">Mensagem ou Template ID</Label>
            <Textarea className="text-xs min-h-[60px]" placeholder="Corpo da mensagem..." value={String(payload.body || payload.templateId || '')} onChange={e => onUpdate('body', e.target.value)} />
          </div>
        </div>
      )
    case 'send_email':
      return (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">Assunto</Label>
            <Input className="h-8 text-xs" placeholder="Assunto do email" value={String(payload.subject || '')} onChange={e => onUpdate('subject', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Corpo</Label>
            <Textarea className="text-xs min-h-[60px]" placeholder="Corpo do email..." value={String(payload.body || '')} onChange={e => onUpdate('body', e.target.value)} />
          </div>
        </div>
      )
    case 'create_ticket':
      return (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">Titulo do ticket</Label>
            <Input className="h-8 text-xs" placeholder="Ex: Suporte pos-venda" value={String(payload.title || '')} onChange={e => onUpdate('title', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Prioridade</Label>
            <Select value={String(payload.priority || 'medium')} onValueChange={v => onUpdate('priority', v)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Baixa</SelectItem>
                <SelectItem value="medium">Media</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )
    case 'update_field':
      return (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Campo</Label>
            <Input className="h-8 text-xs" placeholder="Ex: status" value={String(payload.field || '')} onChange={e => onUpdate('field', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Valor</Label>
            <Input className="h-8 text-xs" placeholder="Ex: qualified" value={String(payload.value || '')} onChange={e => onUpdate('value', e.target.value)} />
          </div>
        </div>
      )
    case 'register_activity':
      return (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">Tipo de atividade</Label>
            <Input className="h-8 text-xs" placeholder="Ex: follow_up" value={String(payload.activityType || '')} onChange={e => onUpdate('activityType', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Descricao</Label>
            <Textarea className="text-xs min-h-[60px]" placeholder="Detalhes da atividade..." value={String(payload.description || '')} onChange={e => onUpdate('description', e.target.value)} />
          </div>
        </div>
      )
    case 'webhook':
      return (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">URL</Label>
            <Input className="h-8 text-xs" placeholder="https://..." value={String(payload.url || '')} onChange={e => onUpdate('url', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Metodo</Label>
            <Select value={String(payload.method || 'POST')} onValueChange={v => onUpdate('method', v)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )
    case 'call_api':
      return (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">URL</Label>
            <Input className="h-8 text-xs" placeholder="https://api..." value={String(payload.url || '')} onChange={e => onUpdate('url', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Metodo</Label>
            <Select value={String(payload.method || 'POST')} onValueChange={v => onUpdate('method', v)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )
    case 'ai_classify_lead':
      return (
        <div className="space-y-1">
          <Label className="text-xs">Modelo / criterios</Label>
          <Input className="h-8 text-xs" placeholder="Ex: BANT scoring" value={String(payload.model || '')} onChange={e => onUpdate('model', e.target.value)} />
        </div>
      )
    case 'ai_generate_message':
      return (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">Prompt / instrucao</Label>
            <Textarea className="text-xs min-h-[60px]" placeholder="Instrucoes para geracao da mensagem..." value={String(payload.prompt || '')} onChange={e => onUpdate('prompt', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Canal</Label>
            <Select value={String(payload.channel || 'whatsapp')} onValueChange={v => onUpdate('channel', v)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )
    case 'ai_generate_proposal':
      return (
        <div className="space-y-1">
          <Label className="text-xs">Template ID da proposta</Label>
          <Input className="h-8 text-xs" placeholder="proposal-template-id" value={String(payload.templateId || '')} onChange={e => onUpdate('templateId', e.target.value)} />
        </div>
      )
    default:
      return null
  }
}
