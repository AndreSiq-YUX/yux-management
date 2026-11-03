import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { crmPriorityService } from '@/services/crmPriorityService'
import type {
  PriorityConfiguration,
  PriorityDefinition,
  PriorityPreview,
} from '@/types/crmPriority'
import { blankPriorityDraft, PriorityRulesEditor } from './PriorityRulesEditor'

type Confirmation =
  | { kind: 'publish'; requestId: string }
  | { kind: 'activate'; versionId: string | null; requestId: string }
const note = (value: number | null) => (value === null ? '—' : String(value))
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Não foi possível concluir a operação.'

export function PrioritySettings({
  crmInstanceId,
  onActiveChange,
}: {
  crmInstanceId: string
  onActiveChange?: (active: boolean) => void
}) {
  const [configuration, setConfiguration] = useState<PriorityConfiguration | null>(null)
  const [draft, setDraft] = useState<PriorityDefinition | null>(null)
  const [preview, setPreview] = useState<PriorityPreview | null>(null)
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [rollbackVersion, setRollbackVersion] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    crmPriorityService
      .model(crmInstanceId)
      .then((value) => {
        if (!active) return
        setConfiguration(value)
        setDraft(value.draft ?? blankPriorityDraft())
        onActiveChange?.(Boolean(value.activeActivationId))
      })
      .catch((error) => {
        if (active) setError(message(error))
      })
    return () => {
      active = false
    }
  }, [crmInstanceId, onActiveChange, reload])

  const dirty = Boolean(draft && JSON.stringify(draft) !== JSON.stringify(configuration?.draft))
  const ready = Boolean(
    preview && !preview.nextCursor && !dirty && preview.revision === configuration?.revision,
  )
  const action = async (run: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError('')
    setStatus('')
    try {
      await run()
    } catch (error) {
      setError(message(error))
    } finally {
      setBusy(false)
    }
  }
  const save = () =>
    void action(async () => {
      if (!draft || !configuration) return
      setPreview(null)
      const saved = await crmPriorityService.save({
        crmInstanceId,
        expectedRevision: configuration.revision,
        definition: draft,
      })
      setConfiguration({ ...configuration, ...saved })
      setDraft(saved.draft)
      setStatus('Rascunho salvo.')
    })
  const simulate = () =>
    void action(async () => {
      if (!configuration || dirty) return
      const { revision } = configuration
      setPreview(null)
      setProgress(0)
      let page = await crmPriorityService.preview({ crmInstanceId, revision })
      const results = page.results.slice(0, 50)
      setProgress(page.totals.processed)
      while (page.nextCursor) {
        page = await crmPriorityService.preview({
          crmInstanceId,
          revision,
          runId: page.runId,
          afterId: page.nextCursor,
        })
        results.push(...page.results.slice(0, Math.max(0, 50 - results.length)))
        setProgress(page.totals.processed)
      }
      setPreview({ ...page, results })
      setStatus('Simulação concluída.')
    })
  const confirm = () =>
    void action(async () => {
      if (!confirmation || !configuration) return
      const input = {
        crmInstanceId,
        expectedActivationId: configuration.activeActivationId,
        requestId: confirmation.requestId,
      }
      let result
      if (confirmation.kind === 'publish') {
        if (!preview || !ready) return
        result = await crmPriorityService.publish({
          ...input,
          revision: preview.revision,
          runId: preview.runId,
        })
      } else
        result = await crmPriorityService.activate({ ...input, versionId: confirmation.versionId })
      const versions =
        result.versionId &&
        !configuration.versions.some((version) => version.id === result.versionId)
          ? [
              {
                id: result.versionId,
                revision: configuration.revision,
                createdAt: new Date().toISOString(),
              },
              ...configuration.versions,
            ]
          : configuration.versions
      setConfiguration({
        ...configuration,
        activeActivationId: result.activationId,
        activeVersionId: result.versionId,
        versions,
      })
      onActiveChange?.(Boolean(result.activationId))
      setConfirmation(null)
      setPreview(null)
      setRollbackVersion('')
      setStatus(
        result.activationId
          ? 'Modelo ativo. A carteira está sendo recalculada.'
          : 'Modelo de prioridade desativado.',
      )
      window.dispatchEvent(new Event('crm-leads-changed'))
    })

  if (!configuration || !draft)
    return error ? (
      <div className="flex flex-col items-start gap-2">
        <p role="alert">{error}</p>
        <Button
          variant="outline"
          onClick={() => {
            setError('')
            setReload((value) => value + 1)
          }}
        >
          Tentar novamente
        </Button>
      </div>
    ) : (
      <p role="status">Carregando modelo de prioridade…</p>
    )
  if (!configuration.canEdit)
    return (
      <p className="text-sm text-muted-foreground">
        Administradores autorizados podem configurar e publicar o modelo. Consulte a prioridade dos
        seus leads na carteira.
      </p>
    )

  const isActive = Boolean(configuration.activeActivationId)
  const isPublishing = confirmation?.kind === 'publish'
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant={isActive ? 'default' : 'secondary'}>
          {isActive ? 'Modelo ativo' : 'Modelo em configuração'}
        </Badge>
        {configuration.revision > 0 && (
          <span className="text-xs text-muted-foreground">
            Rascunho · revisão {configuration.revision}
          </span>
        )}
      </div>
      <fieldset disabled={busy} className="min-w-0">
        <PriorityRulesEditor
          value={draft}
          fields={configuration.fields ?? []}
          recordTypes={configuration.recordTypes ?? []}
          onChange={(value) => {
            setDraft(value)
            setPreview(null)
            setStatus('')
          }}
        />
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy || !dirty} onClick={save}>
          Salvar rascunho
        </Button>
        <Button
          variant="outline"
          disabled={busy || dirty || configuration.revision === 0}
          onClick={simulate}
        >
          Simular carteira
        </Button>
        <Button
          disabled={busy || !ready}
          onClick={() => setConfirmation({ kind: 'publish', requestId: crypto.randomUUID() })}
        >
          Publicar modelo
        </Button>
      </div>
      {error && !confirmation && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {status && (
        <p role="status" className="text-sm">
          {status}
        </p>
      )}
      {busy && progress > 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          {progress} leads simulados…
        </p>
      )}
      {preview && (
        <section
          aria-label="Resultado da simulação"
          className="flex min-w-0 flex-col gap-3 rounded-lg border p-4"
        >
          <h3 className="font-semibold">Resultado da simulação</h3>
          <p className="text-sm text-muted-foreground">
            {preview.totals.processed} leads · {preview.totals.ranked} em filas ·{' '}
            {preview.totals.needsData} para qualificar · {preview.totals.excluded} com impedimentos.
            Histórico de {preview.historyDays} dias.
          </p>
          <div className="flex flex-wrap gap-2">
            {draft.queues.map((queue) => (
              <Badge key={queue.id} variant="outline">
                {queue.label} · {preview.totals.byQueue[queue.id] ?? 0}
              </Badge>
            ))}
          </div>
          {preview.results.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                Ver notas e motivos de até 50 leads
              </summary>
              <ul className="mt-2 flex flex-col gap-2">
                {preview.results.map((result) => (
                  <li
                    key={result.leadId}
                    className="flex flex-col gap-1 rounded-md border p-2 text-sm"
                  >
                    <strong>{result.name}</strong>
                    <span>
                      Potencial {note(result.fitScore)} · Temperatura{' '}
                      {note(result.temperatureScore)} · Prioridade {note(result.priorityScore)}
                    </span>
                    {result.previousPriorityScore !== undefined && (
                      <span className="text-muted-foreground">
                        Prioridade atual {note(result.previousPriorityScore)} → prevista{' '}
                        {note(result.priorityScore)}
                      </span>
                    )}
                    <span>
                      {draft.queues.find((queue) => queue.id === result.queueId)?.label ??
                        (result.state === 'excluded' ? 'Fora da fila' : 'Qualificar dados')}{' '}
                      · cobertura {result.coveragePercent ?? 0}%
                    </span>
                    {result.reasons.map((reason, i) => (
                      <span key={i} className="text-muted-foreground">
                        {reason.label} ·{' '}
                        {reason.kind === 'missing_data'
                          ? reason.archivedFieldKeys?.length
                            ? 'campo arquivado'
                            : 'dados pendentes'
                          : reason.kind === 'expired_signal'
                            ? 'sinal expirado'
                            : reason.points !== undefined
                              ? `${reason.points} pontos${reason.estimated ? ' (estimativa)' : ''}`
                              : 'impedimento'}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
      {configuration.versions.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            Versão anterior
            <select
              className="h-9 rounded-md border bg-background px-2"
              value={rollbackVersion}
              onChange={(event) => setRollbackVersion(event.target.value)}
            >
              <option value="">Selecione uma versão</option>
              {configuration.versions
                .filter((version) => version.id !== configuration.activeVersionId)
                .map((version) => (
                  <option key={version.id} value={version.id}>
                    Revisão {version.revision}
                  </option>
                ))}
            </select>
          </label>
          <Button
            variant="outline"
            disabled={busy || !rollbackVersion}
            onClick={() =>
              setConfirmation({
                kind: 'activate',
                versionId: rollbackVersion,
                requestId: crypto.randomUUID(),
              })
            }
          >
            Restaurar versão
          </Button>
          {isActive && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                setConfirmation({
                  kind: 'activate',
                  versionId: null,
                  requestId: crypto.randomUUID(),
                })
              }
            >
              Desativar prioridade
            </Button>
          )}
        </div>
      )}
      <Dialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmation(null)
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isPublishing
                ? 'Publicar modelo de prioridade'
                : confirmation?.versionId
                  ? 'Restaurar versão'
                  : 'Desativar prioridade'}
            </DialogTitle>
            <DialogDescription>
              {isPublishing
                ? `A revisão ${preview?.revision} será ativada neste CRM e as fichas serão recalculadas em segundo plano.`
                : confirmation?.versionId
                  ? 'A versão selecionada será recalculada com os dados atuais.'
                  : 'A carteira voltará a usar a pontuação anterior.'}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>
              Cancelar
            </Button>
            <Button disabled={busy} onClick={confirm}>
              {isPublishing ? 'Confirmar publicação' : 'Confirmar alteração'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
