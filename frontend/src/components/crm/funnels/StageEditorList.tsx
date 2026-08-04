import { ArrowDown, ArrowUp, Plus, Save } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type {
  CrmPipelineStage,
  CrmPipelineStageCreateInput,
  CrmPipelineStagePatch,
} from '@/types/crm'

export interface StageEditorListProps {
  pipelineId: string
  stages: CrmPipelineStage[]
  canEdit: boolean
  leadCounts?: Record<string, number>
  busy?: boolean
  onCreateStage: (input: CrmPipelineStageCreateInput) => Promise<CrmPipelineStage>
  onUpdateStage: (stageId: string, patch: CrmPipelineStagePatch) => Promise<CrmPipelineStage>
  onReorderStages: (stageIds: string[]) => Promise<void>
}

interface StageDraft {
  name: string
  color: string
  isWon: boolean
  isLost: boolean
  isActive: boolean
}

const defaultStageColor = '#2563eb'

function slugifyStageKey(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'stage'
}

function stageDraftFromStage(stage: CrmPipelineStage): StageDraft {
  return {
    name: stage.name,
    color: stage.color,
    isWon: stage.isWon,
    isLost: stage.isLost,
    isActive: stage.isActive,
  }
}

function outcomeLabel(stage: Pick<CrmPipelineStage, 'isWon' | 'isLost'>) {
  if (stage.isWon) return 'Ganho'
  if (stage.isLost) return 'Perdido'
  return 'Em aberto'
}

export function StageEditorList({
  pipelineId,
  stages,
  canEdit,
  leadCounts = {},
  busy = false,
  onCreateStage,
  onUpdateStage,
  onReorderStages,
}: StageEditorListProps) {
  const orderedStages = useMemo(
    () => [...stages].sort((left, right) => left.orderIndex - right.orderIndex),
    [stages],
  )
  const [drafts, setDrafts] = useState<Record<string, StageDraft>>({})
  const [newStageName, setNewStageName] = useState('')
  const [newStageColor, setNewStageColor] = useState(defaultStageColor)
  const [newStageOutcome, setNewStageOutcome] = useState<'open' | 'won' | 'lost'>('open')
  const [savingStageId, setSavingStageId] = useState<string | null>(null)
  const [creatingStage, setCreatingStage] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDrafts(Object.fromEntries(stages.map(stage => [stage.id, stageDraftFromStage(stage)])))
  }, [stages])

  const updateDraft = (stageId: string, patch: Partial<StageDraft>) => {
    setDrafts(current => ({
      ...current,
      [stageId]: { ...current[stageId], ...patch },
    }))
  }

  const setOutcome = (stageId: string, outcome: 'open' | 'won' | 'lost') => {
    setDrafts(current => {
      const next = { ...current }
      Object.keys(next).forEach(id => {
        next[id] = {
          ...next[id],
          ...(outcome === 'won' ? { isWon: id === stageId } : {}),
          ...(outcome === 'lost' ? { isLost: id === stageId } : {}),
          ...(id === stageId && outcome === 'open' ? { isWon: false, isLost: false } : {}),
          ...(id === stageId && outcome === 'won' ? { isLost: false } : {}),
          ...(id === stageId && outcome === 'lost' ? { isWon: false } : {}),
        }
      })
      return next
    })
  }

  const moveStage = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction
    if (!canEdit || targetIndex < 0 || targetIndex >= orderedStages.length || busy) return

    setError(null)
    const nextIds = orderedStages.map(stage => stage.id)
    const [stageId] = nextIds.splice(index, 1)
    nextIds.splice(targetIndex, 0, stageId)

    try {
      await onReorderStages(nextIds)
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Não foi possível reordenar as etapas.')
    }
  }

  const saveStage = async (stage: CrmPipelineStage) => {
    const draft = drafts[stage.id]
    if (!draft?.name.trim()) {
      setError('Informe o nome da etapa antes de salvar.')
      return
    }

    if (!draft.isActive && (leadCounts[stage.id] || 0) > 0) {
      const confirmed = typeof window === 'undefined'
        || window.confirm(`A etapa "${stage.name}" possui leads. Deseja desativá-la mesmo assim?`)
      if (!confirmed) return
    }

    setSavingStageId(stage.id)
    setError(null)
    try {
      await onUpdateStage(stage.id, draft)
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Não foi possível salvar a etapa.')
    } finally {
      setSavingStageId(null)
    }
  }

  const createStage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!newStageName.trim()) {
      setError('Informe o nome da nova etapa.')
      return
    }

    setCreatingStage(true)
    setError(null)
    try {
      const created = await onCreateStage({
        pipelineId,
        name: newStageName.trim(),
        key: slugifyStageKey(newStageName),
        color: newStageColor,
        isWon: newStageOutcome === 'won',
        isLost: newStageOutcome === 'lost',
        isActive: true,
      })

      if (created.isWon || created.isLost) {
        setDrafts(current => {
          const next = { ...current }
          Object.keys(next).forEach(id => {
            next[id] = {
              ...next[id],
              ...(created.isWon ? { isWon: false } : {}),
              ...(created.isLost ? { isLost: false } : {}),
            }
          })
          return next
        })
      }
      setNewStageName('')
      setNewStageOutcome('open')
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Não foi possível criar a etapa.')
    } finally {
      setCreatingStage(false)
    }
  }

  if (!canEdit) {
    return (
      <div className="space-y-3" aria-label="Etapas do funil">
        {orderedStages.map(stage => (
          <div key={stage.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-gray-50 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: stage.color }} aria-hidden="true" />
              <span className="text-sm font-medium text-gray-900">{stage.name}</span>
              {!stage.isActive && <span className="text-xs text-gray-500">Inativa</span>}
            </div>
            <span className="text-xs text-gray-600">{leadCounts[stage.id] || 0} leads · {outcomeLabel(stage)}</span>
          </div>
        ))}
        {!orderedStages.length && <p className="text-sm text-gray-600">Nenhuma etapa cadastrada.</p>}
      </div>
    )
  }

  return (
    <div className="space-y-4" aria-label="Editor de etapas">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

      <div className="space-y-3">
        {orderedStages.map((stage, index) => {
          const draft = drafts[stage.id] || stageDraftFromStage(stage)
          const stageBusy = busy || savingStageId === stage.id
          const outcome = draft.isWon ? 'won' : draft.isLost ? 'lost' : 'open'

          return (
            <article key={stage.id} className="rounded-md border bg-gray-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: draft.color }} aria-hidden="true" />
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Etapa {index + 1}</span>
                  <span className="text-xs text-gray-500">{leadCounts[stage.id] || 0} leads</span>
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={index === 0 || stageBusy}
                    onClick={() => moveStage(index, -1)}
                    aria-label={`Mover etapa ${stage.name} para cima`}
                    title="Mover etapa para cima"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={index === orderedStages.length - 1 || stageBusy}
                    onClick={() => moveStage(index, 1)}
                    aria-label={`Mover etapa ${stage.name} para baixo`}
                    title="Mover etapa para baixo"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
                <div>
                  <label htmlFor={`stage-name-${stage.id}`} className="text-xs font-medium text-gray-700">Nome</label>
                  <Input
                    id={`stage-name-${stage.id}`}
                    value={draft.name}
                    disabled={stageBusy}
                    onChange={event => updateDraft(stage.id, { name: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor={`stage-color-${stage.id}`} className="text-xs font-medium text-gray-700">Cor</label>
                  <Input
                    id={`stage-color-${stage.id}`}
                    type="color"
                    className="w-16 cursor-pointer p-1"
                    value={draft.color}
                    disabled={stageBusy}
                    onChange={event => updateDraft(stage.id, { color: event.target.value })}
                    aria-label={`Cor da etapa ${stage.name}`}
                  />
                </div>
                <div>
                  <label htmlFor={`stage-outcome-${stage.id}`} className="text-xs font-medium text-gray-700">Resultado</label>
                  <select
                    id={`stage-outcome-${stage.id}`}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={outcome}
                    disabled={stageBusy}
                    onChange={event => setOutcome(stage.id, event.target.value as 'open' | 'won' | 'lost')}
                  >
                    <option value="open">Em aberto</option>
                    <option value="won">Ganho</option>
                    <option value="lost">Perdido</option>
                  </select>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={draft.isActive}
                    disabled={stageBusy}
                    onChange={event => updateDraft(stage.id, { isActive: event.target.checked })}
                  />
                  Etapa ativa
                </label>
                <Button type="button" size="sm" disabled={stageBusy} onClick={() => saveStage(stage)}>
                  <Save className="mr-2 h-3.5 w-3.5" />
                  {savingStageId === stage.id ? 'Salvando...' : 'Salvar etapa'}
                </Button>
              </div>
            </article>
          )
        })}
        {!orderedStages.length && <p className="text-sm text-gray-600">Nenhuma etapa cadastrada.</p>}
      </div>

      <form className="rounded-md border border-dashed p-3" onSubmit={createStage}>
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-yux-700" />
          <h3 className="text-sm font-semibold text-gray-900">Adicionar etapa</h3>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
          <div>
            <label htmlFor="new-stage-name" className="text-xs font-medium text-gray-700">Nome da etapa</label>
            <Input
              id="new-stage-name"
              value={newStageName}
              onChange={event => setNewStageName(event.target.value)}
              placeholder="Ex.: Diagnóstico"
              disabled={creatingStage || busy}
            />
          </div>
          <div>
            <label htmlFor="new-stage-color" className="text-xs font-medium text-gray-700">Cor</label>
            <Input
              id="new-stage-color"
              type="color"
              className="w-16 cursor-pointer p-1"
              value={newStageColor}
              onChange={event => setNewStageColor(event.target.value)}
              disabled={creatingStage || busy}
              aria-label="Cor da nova etapa"
            />
          </div>
          <div>
            <label htmlFor="new-stage-outcome" className="text-xs font-medium text-gray-700">Resultado</label>
            <select
              id="new-stage-outcome"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={newStageOutcome}
              onChange={event => setNewStageOutcome(event.target.value as 'open' | 'won' | 'lost')}
              disabled={creatingStage || busy}
            >
              <option value="open">Em aberto</option>
              <option value="won">Ganho</option>
              <option value="lost">Perdido</option>
            </select>
          </div>
        </div>
        <Button type="submit" size="sm" className="mt-3" disabled={creatingStage || busy}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          {creatingStage ? 'Adicionando...' : 'Adicionar etapa'}
        </Button>
      </form>
    </div>
  )
}
