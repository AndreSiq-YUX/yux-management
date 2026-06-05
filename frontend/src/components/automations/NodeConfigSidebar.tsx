import { FileText, Paperclip, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { MaterialLibraryDialog } from './MaterialLibraryDialog'
import { automationTriggerCatalog } from '@/lib/automations/automationCatalog'
import { crmService } from '@/services/crmService'
import { crmGovernanceService } from '@/services/crmGovernanceService'
import type { OrganizationMaterial } from '@/types/automation'

interface NodeConfigSidebarProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  node: any // Selected react-flow Node
  onUpdate: (nodeId: string, data: any) => void
  organizationId: string
}

const actionTypes = [
  { value: 'create_task', label: 'Criar tarefa', group: 'CRM' },
  { value: 'change_stage', label: 'Mover etapa', group: 'CRM' },
  { value: 'assign_owner', label: 'Atribuir responsável', group: 'CRM' },
  { value: 'send_whatsapp', label: 'Enviar WhatsApp', group: 'Comunicação' },
  { value: 'send_email', label: 'Enviar email', group: 'Comunicação' },
  { value: 'create_ticket', label: 'Criar ticket', group: 'Suporte' },
  { value: 'webhook', label: 'Webhook', group: 'Integração' },
  { value: 'call_api', label: 'Chamar API', group: 'Integração' },
]

const suggestedFields = [
  { value: 'source', label: 'Origem do lead', type: 'text' },
  { value: 'stage', label: 'Etapa do pipeline', type: 'text' },
  { value: 'status', label: 'Status do lead', type: 'text' },
  { value: 'owner', label: 'Responsável', type: 'text' },
  { value: 'temperature', label: 'Temperatura', type: 'text' },
  { value: 'value', label: 'Valor da proposta', type: 'number' },
  { value: 'days_in_stage', label: 'Dias na etapa', type: 'number' },
]

const operators = [
  { value: 'equals', label: 'igual a' },
  { value: 'not_equals', label: 'diferente de' },
  { value: 'contains', label: 'contém' },
  { value: 'greater_than', label: 'maior que' },
  { value: 'less_than', label: 'menor que' },
  { value: 'exists', label: 'existe/preenchido' },
]

export function NodeConfigSidebar({ open, onOpenChange, node, onUpdate, organizationId }: NodeConfigSidebarProps) {
  const [nodeData, setNodeData] = useState<any>({})
  const [stages, setStages] = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [libraryOpen, setLibraryOpen] = useState(false)

  // Fetch CRM Stages and Members on Mount
  useEffect(() => {
    if (!organizationId) return

    const loadCrmMetadata = async () => {
      try {
        // 1. Fetch Stages
        const pipelines = await crmService.getPipelines(organizationId)
        const allStages = pipelines.flatMap(p => p.stages || [])
        setStages(allStages)

        // 2. Fetch Members
        const instance = await crmGovernanceService.getActiveInstanceForOrganization(organizationId)
        if (instance) {
          const context = await crmGovernanceService.getGovernanceContext(instance.id)
          setMembers(context.members || [])
        }
      } catch (error) {
        console.error('Erro ao carregar metadados do CRM para a barra lateral:', error)
      }
    }

    loadCrmMetadata()
  }, [organizationId])

  // Sync state with selected node
  useEffect(() => {
    if (node) {
      setNodeData(node.data || {})
    }
  }, [node])

  if (!node || !open) return null

  const handleFieldChange = (key: string, value: any) => {
    const updated = { ...nodeData, [key]: value }
    setNodeData(updated)
    onUpdate(node.id, updated)
  }

  const handlePayloadChange = (key: string, value: any) => {
    const updatedPayload = { ...(nodeData.payload || {}), [key]: value }
    handleFieldChange('payload', updatedPayload)
  }

  const handleAddAttachment = (material: OrganizationMaterial) => {
    const attachments = nodeData.payload?.attachments || []
    if (attachments.some((a: any) => a.id === material.id)) {
      toast.error('Material já anexado a este nó!')
      return
    }

    const updatedAttachments = [
      ...attachments,
      {
        id: material.id,
        name: material.name,
        fileUrl: material.fileUrl,
        fileType: material.fileType,
        byteSize: material.byteSize,
      },
    ]

    handlePayloadChange('attachments', updatedAttachments)
    setLibraryOpen(false)
  }

  const handleRemoveAttachment = (attachmentId: string) => {
    const attachments = nodeData.payload?.attachments || []
    const updatedAttachments = attachments.filter((a: any) => a.id !== attachmentId)
    handlePayloadChange('attachments', updatedAttachments)
  }

  const renderConfigFields = () => {
    if (node.type === 'trigger') {
      const selectedTriggerType = nodeData.triggerType || ''
      const isStageChanged = selectedTriggerType === 'lead.stage_changed'
      const isStatusChanged = selectedTriggerType === 'lead.status_changed'

      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Evento Gatilho</Label>
            <Select
              value={selectedTriggerType}
              onValueChange={val => handleFieldChange('triggerType', val)}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Selecione um evento" />
              </SelectTrigger>
              <SelectContent>
                {automationTriggerCatalog.map(t => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label} ({t.module.toUpperCase()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isStageChanged && (
            <div className="space-y-1.5">
              <Label className="text-xs">Filtro por Etapa Comercial (Opcional)</Label>
              <Select
                value={nodeData.config?.stageId || 'all'}
                onValueChange={val =>
                  handleFieldChange('config', { ...(nodeData.config || {}), stageId: val === 'all' ? undefined : val })
                }
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Qualquer etapa</SelectItem>
                  {stages.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isStatusChanged && (
            <div className="space-y-1.5">
              <Label className="text-xs">Filtro por Status do Lead (Opcional)</Label>
              <Select
                value={nodeData.config?.status || 'all'}
                onValueChange={val =>
                  handleFieldChange('config', { ...(nodeData.config || {}), status: val === 'all' ? undefined : val })
                }
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Qualquer status</SelectItem>
                  <SelectItem value="active">Ativo / Aberto</SelectItem>
                  <SelectItem value="won">Ganho (Vendido)</SelectItem>
                  <SelectItem value="lost">Perdido</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )
    }

    if (node.type === 'condition') {
      const selectedField = nodeData.field || ''
      const isNumberField = selectedField === 'value' || selectedField === 'days_in_stage'
      const operator = nodeData.operator || 'equals'

      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Campo a validar</Label>
            <Select value={selectedField} onValueChange={val => handleFieldChange('field', val)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Selecione um campo" />
              </SelectTrigger>
              <SelectContent>
                {suggestedFields.map(f => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Operador Lógico</Label>
            <Select value={operator} onValueChange={val => handleFieldChange('operator', val)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {operators.map(op => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {operator !== 'exists' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Valor Comparado</Label>
              <Input
                value={nodeData.value !== undefined ? String(nodeData.value) : ''}
                onChange={e => handleFieldChange('value', isNumberField ? Number(e.target.value) : e.target.value)}
                type={isNumberField ? 'number' : 'text'}
                className="h-9 text-xs"
                placeholder="Ex: 5000, instagram..."
              />
            </div>
          )}
        </div>
      )
    }

    if (node.type === 'action') {
      const selectedActionType = nodeData.actionType || ''
      const payload = nodeData.payload || {}

      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Ação a executar</Label>
            <Select
              value={selectedActionType}
              onValueChange={val => handleFieldChange('actionType', val)}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Selecione uma ação" />
              </SelectTrigger>
              <SelectContent>
                {actionTypes.map(a => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedActionType === 'create_task' && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Título da Tarefa</Label>
                <Input
                  value={payload.title || ''}
                  onChange={e => handlePayloadChange('title', e.target.value)}
                  className="h-9 text-xs"
                  placeholder="Ex: Ligar para agendar reunião"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Descrição</Label>
                <Textarea
                  value={payload.description || ''}
                  onChange={e => handlePayloadChange('description', e.target.value)}
                  className="text-xs min-h-[80px]"
                  placeholder="Instruções adicionais da tarefa..."
                />
              </div>
            </>
          )}

          {selectedActionType === 'change_stage' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Mover para Etapa Comercial</Label>
              <Select
                value={payload.stageId || ''}
                onValueChange={val => handlePayloadChange('stageId', val)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Selecione a etapa" />
                </SelectTrigger>
                <SelectContent>
                  {stages.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedActionType === 'assign_owner' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Responsável Comercial</Label>
              <Select
                value={payload.ownerId || ''}
                onValueChange={val => handlePayloadChange('ownerId', val)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Escolha um usuário" />
                </SelectTrigger>
                <SelectContent>
                  {members.map(m => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.displayName || m.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedActionType === 'send_whatsapp' && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Mensagem</Label>
                <Textarea
                  value={payload.body || ''}
                  onChange={e => handlePayloadChange('body', e.target.value)}
                  className="text-xs min-h-[100px]"
                  placeholder="Texto do WhatsApp. Ex: Olá! Como posso te ajudar?"
                />
              </div>
              {renderAttachmentsSection()}
            </>
          )}

          {selectedActionType === 'send_email' && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Assunto</Label>
                <Input
                  value={payload.subject || ''}
                  onChange={e => handlePayloadChange('subject', e.target.value)}
                  className="h-9 text-xs"
                  placeholder="Assunto do email"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Mensagem (HTML)</Label>
                <Textarea
                  value={payload.body || ''}
                  onChange={e => handlePayloadChange('body', e.target.value)}
                  className="text-xs min-h-[120px] font-mono"
                  placeholder="<p>Olá, tudo bem?</p>"
                />
              </div>
              {renderAttachmentsSection()}
            </>
          )}
        </div>
      )
    }

    return null
  }

  const renderAttachmentsSection = () => {
    const attachments = nodeData.payload?.attachments || []

    return (
      <div className="space-y-2 border-t pt-4">
        <div className="flex items-center justify-between">
          <Label className="text-xs flex items-center gap-1.5">
            <Paperclip className="h-3.5 w-3.5" />
            Materiais Anexados ({attachments.length})
          </Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setLibraryOpen(true)}
            className="h-7 text-[10px]"
          >
            <Plus className="h-3 w-3 mr-1" />
            Anexar
          </Button>
        </div>

        {attachments.length === 0 ? (
          <p className="text-[10px] text-slate-500 italic">Nenhum arquivo anexado a este envio.</p>
        ) : (
          <div className="space-y-1">
            {attachments.map((file: any) => (
              <div
                key={file.id}
                className="flex items-center justify-between rounded border bg-slate-50 p-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                  <span className="truncate text-[11px] font-medium text-slate-700" title={file.name}>
                    {file.name}
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                  onClick={() => handleRemoveAttachment(file.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const translateTitle = () => {
    switch (node.type) {
      case 'trigger':
        return 'Configurar Gatilho (Quando)'
      case 'condition':
        return 'Configurar Filtros (Se)'
      case 'action':
        return 'Configurar Ação (Então)'
      default:
        return 'Configurações do Bloco'
    }
  }

  return (
    <>
      <div className="fixed inset-y-0 right-0 z-40 w-80 border-l bg-white shadow-xl flex flex-col">
        <header className="flex h-14 items-center justify-between border-b px-4">
          <h3 className="text-sm font-bold text-slate-900">{translateTitle()}</h3>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="text-[10px] text-slate-500">
            <span className="font-semibold">ID do Bloco:</span> <code className="bg-slate-100 px-1 rounded">{node.id.slice(0, 8)}</code>
          </div>
          {renderConfigFields()}
        </div>
      </div>

      <MaterialLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        onSelect={handleAddAttachment}
        organizationId={organizationId}
      />
    </>
  )
}
