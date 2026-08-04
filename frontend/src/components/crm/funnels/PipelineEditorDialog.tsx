import { Settings2 } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { StageEditorList } from './StageEditorList'
import type {
  CrmPipeline,
  CrmPipelineCreateInput,
  CrmPipelinePatch,
  CrmPipelineStage,
  CrmPipelineStageCreateInput,
  CrmPipelineStagePatch,
} from '@/types/crm'

export interface PipelineEditorDialogProps {
  open: boolean
  pipeline?: CrmPipeline | null
  pipelines: CrmPipeline[]
  organizationId: string
  crmInstanceId: string
  maxPipelineCount: number
  canEdit: boolean
  pipelineLeadCount?: number
  leadCountsByStage?: Record<string, number>
  onOpenChange: (open: boolean) => void
  onCreatePipeline: (input: CrmPipelineCreateInput) => Promise<CrmPipeline>
  onUpdatePipeline: (id: string, patch: CrmPipelinePatch) => Promise<CrmPipeline>
  onCreateStage: (input: CrmPipelineStageCreateInput) => Promise<CrmPipelineStage>
  onUpdateStage: (stageId: string, patch: CrmPipelineStagePatch) => Promise<CrmPipelineStage>
  onReorderStages: (pipelineId: string, stageIds: string[]) => Promise<CrmPipeline>
}

export function PipelineEditorDialog({
  open,
  pipeline,
  pipelines,
  organizationId,
  crmInstanceId,
  maxPipelineCount,
  canEdit,
  pipelineLeadCount = 0,
  leadCountsByStage = {},
  onOpenChange,
  onCreatePipeline,
  onUpdatePipeline,
  onCreateStage,
  onUpdateStage,
  onReorderStages,
}: PipelineEditorDialogProps) {
  const [workingPipeline, setWorkingPipeline] = useState<CrmPipeline | null>(pipeline || null)
  const [name, setName] = useState(pipeline?.name || '')
  const [description, setDescription] = useState(pipeline?.description || '')
  const [isDefault, setIsDefault] = useState(pipeline?.isDefault || false)
  const [isActive, setIsActive] = useState(pipeline?.isActive ?? true)
  const [savingPipeline, setSavingPipeline] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isNew = !pipeline
  const reachedPipelineLimit = isNew && pipelines.length >= maxPipelineCount

  useEffect(() => {
    if (!open) return
    setWorkingPipeline(pipeline || null)
    setName(pipeline?.name || '')
    setDescription(pipeline?.description || '')
    setIsDefault(pipeline?.isDefault || false)
    setIsActive(pipeline?.isActive ?? true)
    setError(null)
  }, [open, pipeline])

  const savePipeline = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canEdit) return
    if (!name.trim()) {
      setError('Informe o nome do funil.')
      return
    }
    if (reachedPipelineLimit) {
      setError('O limite de funis ativos deste CRM foi atingido.')
      return
    }
    if (pipeline && !isActive && pipelineLeadCount > 0) {
      const confirmed = typeof window === 'undefined'
        || window.confirm(`Este funil possui ${pipelineLeadCount} leads. Deseja desativá-lo mesmo assim?`)
      if (!confirmed) return
    }

    setSavingPipeline(true)
    setError(null)
    try {
      const saved = pipeline
        ? await onUpdatePipeline(pipeline.id, {
            name: name.trim(),
            description: description.trim(),
            isDefault,
            isActive,
          })
        : await onCreatePipeline({
            organizationId,
            crmInstanceId,
            name: name.trim(),
            description: description.trim(),
            isDefault,
            isActive,
          })
      setWorkingPipeline(saved)
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Não foi possível salvar o funil.')
    } finally {
      setSavingPipeline(false)
    }
  }

  const stages = workingPipeline?.stages || pipeline?.stages || []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-yux-700" aria-hidden="true" />
            <DialogTitle>{canEdit ? (isNew ? 'Criar funil comercial' : 'Configurar funil comercial') : 'Funil comercial'}</DialogTitle>
          </div>
          <DialogDescription>
            {canEdit
              ? 'Defina a estrutura do funil e mantenha as etapas organizadas para o time comercial.'
              : 'Visualização da estrutura do funil. Seu perfil não pode alterar esta configuração.'}
          </DialogDescription>
        </DialogHeader>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

        <form className="space-y-4" onSubmit={savePipeline}>
          <div className="rounded-md border bg-gray-50 p-3 text-sm text-gray-700">
            <span className="font-medium">Limite de funis:</span> {pipelines.length} / {maxPipelineCount}
            {reachedPipelineLimit && <span className="ml-2 text-amber-700">Limite atingido</span>}
          </div>

          <div className="grid gap-4">
            <div>
              <label htmlFor="pipeline-name" className="text-sm font-medium text-gray-700">Nome do funil</label>
              <Input
                id="pipeline-name"
                value={name}
                onChange={event => setName(event.target.value)}
                disabled={!canEdit || savingPipeline}
                placeholder="Ex.: Novos negócios"
                autoFocus={canEdit}
              />
            </div>
            <div>
              <label htmlFor="pipeline-description" className="text-sm font-medium text-gray-700">Descrição</label>
              <Textarea
                id="pipeline-description"
                value={description}
                onChange={event => setDescription(event.target.value)}
                disabled={!canEdit || savingPipeline}
                placeholder="Descreva quando este funil deve ser usado."
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-5 text-sm text-gray-700">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={event => setIsDefault(event.target.checked)}
                disabled={!canEdit || savingPipeline}
              />
              Funil padrão
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isActive}
                onChange={event => setIsActive(event.target.checked)}
                disabled={!canEdit || savingPipeline}
              />
              Funil ativo
            </label>
          </div>

          {workingPipeline && (
            <section className="space-y-3 border-t pt-4" aria-labelledby="pipeline-stages-title">
              <div>
                <h2 id="pipeline-stages-title" className="text-base font-semibold text-gray-900">Etapas do funil</h2>
                <p className="mt-1 text-sm text-gray-600">A ordem define como os leads avançam no processo comercial.</p>
              </div>
              <StageEditorList
                pipelineId={workingPipeline.id}
                stages={stages}
                canEdit={canEdit}
                leadCounts={leadCountsByStage}
                busy={savingPipeline}
                onCreateStage={async input => {
                  const created = await onCreateStage(input)
                  setWorkingPipeline(current => current ? { ...current, stages: [...(current.stages || []), created] } : current)
                  return created
                }}
                onUpdateStage={async (stageId, patch) => {
                  const updated = await onUpdateStage(stageId, patch)
                  setWorkingPipeline(current => current ? {
                    ...current,
                    stages: (current.stages || []).map(stage => stage.id === stageId ? updated : stage),
                  } : current)
                  return updated
                }}
                onReorderStages={async stageIds => {
                  const reordered = await onReorderStages(workingPipeline.id, stageIds)
                  setWorkingPipeline(reordered)
                }}
              />
            </section>
          )}

          {canEdit && (
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={savingPipeline}>
                Fechar
              </Button>
              <Button type="submit" disabled={savingPipeline || reachedPipelineLimit}>
                {savingPipeline ? 'Salvando...' : isNew ? 'Criar funil' : 'Salvar funil'}
              </Button>
            </DialogFooter>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
