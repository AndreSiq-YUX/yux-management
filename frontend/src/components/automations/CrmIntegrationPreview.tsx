import { Building2, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { AutomationAction } from '@/types/automation'

interface CrmIntegrationPreviewProps {
  action: AutomationAction
}

export function CrmIntegrationPreview({ action }: CrmIntegrationPreviewProps) {
  if (action.actionType === 'change_stage') {
    return (
      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-blue-600" />
          <p className="text-xs font-semibold text-blue-900">Preview do Pipeline</p>
        </div>
        <div className="text-xs text-blue-800">
          <p>Esta ação moverá o lead para a etapa especificada no pipeline do CRM.</p>
          <p className="mt-2">
            <span className="font-semibold">Stage ID:</span>{' '}
            <code className="rounded bg-blue-100 px-1 py-0.5">{String(action.payload.stageId || 'Não definido')}</code>
          </p>
          <p className="mt-1 text-blue-700">
            O lead será movido para a etapa correspondente no pipeline ativo.
          </p>
        </div>
        <div className="flex gap-1">
          <Badge variant="outline" className="text-xs">CRM</Badge>
          <Badge variant="outline" className="text-xs">Pipeline</Badge>
        </div>
      </div>
    )
  }

  if (action.actionType === 'assign_owner') {
    return (
      <div className="rounded-md border border-purple-200 bg-purple-50 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-purple-600" />
          <p className="text-xs font-semibold text-purple-900">Atribuição de Responsável</p>
        </div>
        <div className="text-xs text-purple-800">
          <p>Esta ação atribuirá o lead ao responsável especificado.</p>
          <p className="mt-2">
            <span className="font-semibold">Owner ID:</span>{' '}
            <code className="rounded bg-purple-100 px-1 py-0.5">{String(action.payload.ownerId || 'Não definido')}</code>
          </p>
          <p className="mt-1 text-purple-700">
            O responsável receberá notificação e o lead aparecerá em sua lista de trabalho.
          </p>
        </div>
        <div className="flex gap-1">
          <Badge variant="outline" className="text-xs">CRM</Badge>
          <Badge variant="outline" className="text-xs">Usuários</Badge>
        </div>
      </div>
    )
  }

  if (action.actionType === 'create_task') {
    return (
      <div className="rounded-md border border-green-200 bg-green-50 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-green-600" />
          <p className="text-xs font-semibold text-green-900">Criação de Tarefa</p>
        </div>
        <div className="text-xs text-green-800">
          <p>Esta ação criará uma tarefa no CRM para o lead.</p>
          {action.payload.title !== undefined && action.payload.title !== null && (
            <p className="mt-2">
              <span className="font-semibold">Título:</span>{' '}
              <code className="rounded bg-green-100 px-1 py-0.5">{String(action.payload.title)}</code>
            </p>
          )}
          {action.payload.description !== undefined && action.payload.description !== null && (
            <p className="mt-1">
              <span className="font-semibold">Descrição:</span>{' '}
              <span className="text-green-700">{String(action.payload.description)}</span>
            </p>
          )}
        </div>
        <div className="flex gap-1">
          <Badge variant="outline" className="text-xs">CRM</Badge>
          <Badge variant="outline" className="text-xs">Tarefas</Badge>
        </div>
      </div>
    )
  }

  return null
}
