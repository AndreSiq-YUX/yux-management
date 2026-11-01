import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { crmQualificationService as service } from '@/services/crmQualificationService'
import { crmRecordProfileService } from '@/services/crmRecordProfileService'
import {
  qualificationEvents,
  type QualificationRule,
  type QualificationField,
} from '@/types/crmQualification'
const initial: QualificationRule = {
  name: '',
  kind: 'profile',
  dimension: 'fit',
  fieldKey: '',
  recordTypeId: null,
  operator: 'exists',
  points: 10,
  bands: [],
  maxContribution: 100,
}
const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm'
const activityFields: QualificationField[] = [
  {
    key: 'activity.channel',
    label: 'Canal da resposta',
    type: 'select',
    options: [
      { value: 'whatsapp', label: 'WhatsApp' },
      { value: 'email', label: 'E-mail (registro manual)' },
    ],
    recordTypeId: null,
  },
  {
    key: 'activity.text',
    label: 'Texto da resposta/interação',
    type: 'text',
    options: [],
    recordTypeId: null,
  },
  {
    key: 'activity.stageId',
    label: 'Etapa de destino',
    type: 'select',
    options: [],
    recordTypeId: null,
  },
  {
    key: 'activity.interactionType',
    label: 'Tipo de interação',
    type: 'select',
    options: [
      { value: 'email', label: 'E-mail' },
      { value: 'whatsapp', label: 'WhatsApp' },
      { value: 'call', label: 'Chamada' },
      { value: 'note', label: 'Nota' },
    ],
    recordTypeId: null,
  },
]
export function QualificationSettings({
  crmInstanceId,
  warmThreshold = 40,
  hotThreshold = 70,
  onChanged,
}: {
  crmInstanceId: string
  warmThreshold?: number
  hotThreshold?: number
  onChanged: () => void
}) {
  const [fields, setFields] = useState<QualificationField[]>([]),
    [types, setTypes] = useState<Array<{ id: string; name: string }>>([]),
    [rules, setRules] = useState<QualificationRule[]>([])
  const [draft, setDraft] = useState<QualificationRule>(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [progress, setProgress] = useState(''),
    [warm, setWarm] = useState(warmThreshold),
    [hot, setHot] = useState(hotThreshold)
  const [preview, setPreview] = useState<
    Array<{ leadId: string; score: number }>
  >([])
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    setFields([])
    setRules([])
    setPreview([])
    setError('')
    Promise.all([
      service.fields(crmInstanceId),
      service.rules(crmInstanceId),
      crmRecordProfileService.getConfiguration(crmInstanceId),
    ])
      .then(([f, r, c]) => {
        if (active) {
          setFields(f)
          setRules(r)
          setTypes(c.recordTypes.filter((t) => t.isActive))
        }
      })
      .catch(() => {
        if (active)
          setError('Não foi possível carregar as regras. Tente novamente.')
      })
    return () => {
      active = false
    }
  }, [crmInstanceId, revision])
  const mutate = async (work: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await work()
      setRevision((v) => v + 1)
      onChanged()
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Não foi possível salvar.',
      )
    } finally {
      setBusy(false)
    }
  }
  const choices =
    draft.kind === 'profile'
      ? fields
      : [
          ...fields,
          ...activityFields.map((f) =>
            f.key === 'activity.stageId'
              ? {
                  ...f,
                  options:
                    fields.find((x) => x.key === 'lead.stage_id')?.options ||
                    [],
                }
              : f,
          ),
        ]
  const field = choices.find((f) => f.key === draft.fieldKey)
  const save = async (event: FormEvent) => {
    event.preventDefault()
    await mutate(async () => {
      await service.create(crmInstanceId, draft)
      setDraft(initial)
      setProgress(
        'Regra salva. Confira a prévia e recalcule os leads existentes.',
      )
    })
  }
  const recalculate = async (previewOnly: boolean) => {
    setBusy(true)
    setError('')
    setPreview([])
    let afterId: string | undefined
    let count = 0
    const examples: Array<{ leadId: string; score: number }> = []
    try {
      do {
        const result = await service.recalculate(
          crmInstanceId,
          previewOnly,
          afterId,
        )
        count += result.results.length
        examples.push(
          ...result.results
            .filter((v): v is NonNullable<typeof v> => v !== null)
            .slice(0, Math.max(0, 5 - examples.length)),
        )
        afterId = result.nextCursor || undefined
        setProgress(
          `${previewOnly ? 'Prévia' : 'Atualização'}: ${count} leads processados.`,
        )
      } while (afterId)
      setPreview(examples)
      if (!previewOnly) {
        window.dispatchEvent(new Event('crm-leads-changed'))
        onChanged()
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Não foi possível recalcular. Tente novamente.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <section
      className="flex flex-col gap-5"
      aria-label="Regras de qualificação"
    >
      <p className="text-sm text-muted-foreground">
        Some pontos pelo perfil e pelas atividades. O total vai de 0 a 100.
        Editar a mesma ficha não repete pontos. As notas do Radar não entram
        neste cálculo.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
          <Button variant="outline" onClick={() => setRevision((v) => v + 1)}>
            Tentar novamente
          </Button>
        </p>
      )}
      <form
        onSubmit={save}
        className="flex flex-col gap-4 rounded-md border p-4"
      >
        <h3 className="font-semibold">
          {draft.id ? 'Editar regra' : 'Adicionar regra'}
        </h3>
        <label className="flex flex-col gap-1 text-sm">
          Nome da regra
          <Input
            required
            minLength={2}
            maxLength={120}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Ex.: Capacidade de refeições"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Pontuar por
            <select
              aria-label="Pontuar por"
              className={selectClass}
              disabled={Boolean(draft.id)}
              value={draft.kind}
              onChange={(e) =>
                setDraft({
                  ...initial,
                  name: draft.name,
                  kind: e.target.value as QualificationRule['kind'],
                  dimension: e.target.value === 'profile' ? 'fit' : 'intent',
                  eventType:
                    e.target.value === 'activity'
                      ? 'lead.task_completed'
                      : undefined,
                })
              }
            >
              <option value="profile">Dados do perfil</option>
              <option value="activity">Atividade ou resposta</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Tipo de cliente
            <select
              aria-label="Tipo de cliente"
              className={selectClass}
              value={draft.recordTypeId || ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  recordTypeId: e.target.value || null,
                  fieldKey: '',
                  bands: [],
                })
              }
            >
              <option value="">Todos os tipos</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {draft.kind === 'activity' && (
          <label className="flex flex-col gap-1 text-sm">
            Atividade
            <select
              aria-label="Atividade"
              className={selectClass}
              value={draft.eventType}
              onChange={(e) =>
                setDraft({ ...draft, eventType: e.target.value })
              }
            >
              {qualificationEvents.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          Campo ou condição
          <select
            aria-label="Campo ou condição"
            required={draft.kind === 'profile'}
            className={selectClass}
            value={draft.fieldKey}
            onChange={(e) =>
              setDraft({
                ...draft,
                fieldKey: e.target.value,
                comparisonValue: undefined,
                operator: 'exists',
                bands: [],
              })
            }
          >
            <option value="">
              {draft.kind === 'activity'
                ? 'Sempre que ocorrer a atividade'
                : 'Selecione um campo'}
            </option>
            {choices
              .filter(
                (f) => !f.recordTypeId || f.recordTypeId === draft.recordTypeId,
              )
              .map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
          </select>
        </label>
        {field?.type === 'number' && (
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() =>
              setDraft({
                ...draft,
                bands: draft.bands.length
                  ? []
                  : [
                      { min: null, max: 500, points: 10 },
                      { min: 500, max: 1000, points: 20 },
                      { min: 1000, max: null, points: 30 },
                    ],
              })
            }
          >
            {draft.bands.length
              ? 'Usar condição simples'
              : 'Configurar faixas numéricas'}
          </Button>
        )}
        {draft.bands.length ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm">
              Início incluído · fim não incluído · vazio significa sem limite
            </legend>
            {draft.bands.map((b, i) => (
              <div key={i} className="grid grid-cols-3 gap-2">
                {(['min', 'max', 'points'] as const).map((key) => (
                  <label key={key} className="text-xs">
                    {key === 'min'
                      ? 'A partir de'
                      : key === 'max'
                        ? 'Abaixo de'
                        : 'Pontos'}
                    <Input
                      type="number"
                      step="any"
                      aria-label={`${key === 'min' ? 'Início' : key === 'max' ? 'Fim' : 'Pontos'} da faixa ${i + 1}`}
                      required={key === 'points'}
                      value={b[key] ?? ''}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          bands: draft.bands.map((v, j) =>
                            j === i
                              ? {
                                  ...v,
                                  [key]:
                                    e.target.value === ''
                                      ? null
                                      : Number(e.target.value),
                                }
                              : v,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            ))}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setDraft({
                    ...draft,
                    bands: [
                      ...draft.bands,
                      {
                        min: draft.bands.at(-1)?.max ?? null,
                        max: null,
                        points: 10,
                      },
                    ],
                  })
                }
              >
                Adicionar faixa
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setDraft({ ...draft, bands: draft.bands.slice(0, -1) })
                }
              >
                Remover última
              </Button>
            </div>
          </fieldset>
        ) : (
          <>
            {draft.fieldKey && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  Condição
                  <select
                    aria-label="Condição"
                    className={selectClass}
                    value={draft.operator}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        operator: e.target
                          .value as QualificationRule['operator'],
                      })
                    }
                  >
                    <option value="exists">Preenchido</option>
                    <option value="equals">Igual a</option>
                    <option value="not_equals">Diferente de</option>
                    {['text', 'textarea'].includes(field?.type || '') && (
                      <>
                        <option value="contains">Contém</option>
                        <option value="not_contains">Não contém</option>
                      </>
                    )}
                    {field?.type === 'number' && (
                      <>
                        <option value="at_least">Maior ou igual a</option>
                        <option value="at_most">Menor ou igual a</option>
                        <option value="greater_than">Maior que</option>
                        <option value="less_than">Menor que</option>
                      </>
                    )}
                  </select>
                </label>
                {draft.operator !== 'exists' && (
                  <label className="flex flex-col gap-1 text-sm">
                    Valor da condição
                    {field?.type === 'boolean' ? (
                      <select
                        required
                        className={selectClass}
                        value={
                          draft.comparisonValue === undefined
                            ? ''
                            : String(draft.comparisonValue)
                        }
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            comparisonValue: e.target.value === 'true',
                          })
                        }
                      >
                        <option value="">Selecione</option>
                        <option value="true">Sim</option>
                        <option value="false">Não</option>
                      </select>
                    ) : field?.options.length ? (
                      <select
                        required
                        className={selectClass}
                        value={String(draft.comparisonValue ?? '')}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            comparisonValue: e.target.value,
                          })
                        }
                      >
                        <option value="">Selecione</option>
                        {field.options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        required
                        type={
                          field?.type === 'number'
                            ? 'number'
                            : field?.type === 'date'
                              ? 'date'
                              : 'text'
                        }
                        value={String(draft.comparisonValue ?? '')}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            comparisonValue:
                              field?.type === 'number'
                                ? Number(e.target.value)
                                : e.target.value,
                          })
                        }
                      />
                    )}
                  </label>
                )}
              </div>
            )}
            <label className="flex flex-col gap-1 text-sm">
              Pontos (negativos reduzem a nota)
              <Input
                required
                type="number"
                min={-100}
                max={100}
                value={draft.points}
                onChange={(e) =>
                  setDraft({ ...draft, points: Number(e.target.value) })
                }
              />
            </label>
          </>
        )}
        {draft.kind === 'activity' && (
          <label className="flex flex-col gap-1 text-sm">
            Limite de pontos acumulados por esta regra
            <Input
              required
              type="number"
              min={1}
              max={100}
              value={draft.maxContribution}
              onChange={(e) =>
                setDraft({ ...draft, maxContribution: Number(e.target.value) })
              }
            />
          </label>
        )}
        <Button disabled={busy} className="self-start">
          {busy
            ? 'Salvando...'
            : draft.id
              ? 'Salvar alterações'
              : 'Adicionar regra'}
        </Button>
        {draft.id && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setDraft(initial)}
          >
            Cancelar edição
          </Button>
        )}
      </form>
      <ul className="flex flex-col gap-2">
        {rules.map((rule) => (
          <li
            key={rule.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
          >
            <div>
              <p className="font-medium">{rule.name}</p>
              <p className="text-sm text-muted-foreground">
                {rule.kind === 'profile'
                  ? 'Perfil atual'
                  : qualificationEvents.find(
                      ([v]) => v === rule.eventType,
                    )?.[1]}{' '}
                ·{' '}
                {rule.bands.length
                  ? `${rule.bands.length} faixas`
                  : `${rule.points > 0 ? '+' : ''}${rule.points} pontos`}
                {rule.fieldKey
                  ? ` · ${[...fields, ...activityFields].find((f) => f.key === rule.fieldKey)?.label || 'Campo indisponível'}`
                  : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => setDraft(rule)}
              >
                Editar {rule.name}
              </Button>
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => void mutate(() => service.remove(rule.id!))}
              >
                Desativar {rule.name}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {!rules.length && (
        <p className="text-sm text-muted-foreground">
          Nenhuma regra cadastrada. Adicione a primeira acima.
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void mutate(() => service.temperature(crmInstanceId, warm, hot))
        }}
        className="flex flex-col gap-3 rounded-md border p-4"
      >
        <h3 className="font-semibold">Temperatura por pontuação</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Morno a partir de
            <Input
              type="number"
              required
              min={0}
              max={99}
              value={warm}
              onChange={(e) => setWarm(Number(e.target.value))}
            />
          </label>
          <label className="text-sm">
            Quente a partir de
            <Input
              type="number"
              required
              min={1}
              max={100}
              value={hot}
              onChange={(e) => setHot(Number(e.target.value))}
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Abaixo do limite morno, o lead é frio. A temperatura sugere ações e
          não muda a etapa automaticamente.
        </p>
        <Button disabled={busy || warm >= hot} className="self-start">
          Salvar temperatura
        </Button>
      </form>
      <div className="flex flex-col gap-3">
        <h3 className="font-semibold">Aplicar aos leads existentes</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy}
            variant="outline"
            onClick={() => void recalculate(true)}
          >
            Ver prévia
          </Button>
          <Button
            disabled={busy || !preview.length}
            onClick={() => void recalculate(false)}
          >
            Recalcular pontuação
          </Button>
        </div>
        {progress && (
          <p role="status" className="text-sm">
            {progress}
          </p>
        )}
        {preview.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Amostra das notas calculadas:{' '}
            {preview.map((v) => v.score).join(', ')}. A atualização processa
            todos os leads deste CRM.
          </p>
        )}
      </div>
    </section>
  )
}
