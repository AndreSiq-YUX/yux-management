import { useId, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  priorityChannelLabels,
  prioritySignalLabels,
  type PriorityAlternative,
  type PriorityBand,
  type PriorityCondition,
  type PriorityConfiguration,
  type PriorityDefinition,
  type PriorityField,
  type PriorityOperator,
  type PriorityRange,
  type PrioritySignalRule,
} from '@/types/crmPriority'

export const blankPriorityDraft = (): PriorityDefinition => ({
  fitWeight: 50,
  temperatureWeight: 50,
  minimumCoverage: 50,
  historyDays: 90,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  fitGroups: [],
  interestGroups: [],
  inactivity: [],
  exclusions: [],
  fitBands: [{ id: 'fit', label: 'Potencial', min: 0 }],
  temperatureBands: [
    { id: 'cold', label: 'Frio', min: 0 },
    { id: 'warm', label: 'Morno', min: 40 },
    { id: 'hot', label: 'Quente', min: 70 },
  ],
  queues: [{ id: 'review', label: 'Acompanhar' }],
  matrix: ['cold', 'warm', 'hot'].map((temperatureBandId) => ({
    fitBandId: 'fit',
    temperatureBandId,
    queueId: 'review',
  })),
})

const replace = <T,>(list: T[], index: number, value: T) =>
  list.map((item, i) => (i === index ? value : item))
const remove = <T,>(list: T[], index: number) => list.filter((_, i) => i !== index)
const id = () => crypto.randomUUID()
const outline = 'flex min-w-0 flex-col gap-3 rounded-lg border p-3'
const grid = 'grid grid-cols-1 gap-3 sm:grid-cols-2'
const selectClass =
  'h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50'
const ops: Record<PriorityOperator, string> = {
  exists: 'Tem valor',
  equals: 'Igual a',
  not_equals: 'Diferente de',
  contains: 'Contém',
  not_contains: 'Não contém',
  greater_than: 'Maior que',
  less_than: 'Menor que',
  at_least: 'Pelo menos',
  at_most: 'No máximo',
}
const conditionsFor = (type?: string): PriorityOperator[] => [
  'exists',
  'equals',
  'not_equals',
  ...(type === 'number' ? (['greater_than', 'less_than', 'at_least', 'at_most'] as const) : []),
  ...(type === 'text' || type === 'textarea' ? (['contains', 'not_contains'] as const) : []),
]

function Text({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const input = useId()
  return (
    <Field>
      <FieldLabel htmlFor={input}>{label}</FieldLabel>
      <Input id={input} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}
function Num({
  label,
  value,
  onChange,
  min,
  max,
  disabled,
}: {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  min?: number
  max?: number
  disabled?: boolean
}) {
  const input = useId()
  return (
    <Field>
      <FieldLabel htmlFor={input}>{label}</FieldLabel>
      <Input
        id={input}
        type="number"
        value={value ?? ''}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
    </Field>
  )
}
function Pick({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  const input = useId()
  return (
    <Field>
      <FieldLabel htmlFor={input}>{label}</FieldLabel>
      <select
        id={input}
        className={selectClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </Field>
  )
}
function Check({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}
function Delete({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="self-start" onClick={onClick}>
      {label}
    </Button>
  )
}

function Ranges({
  items,
  onChange,
}: {
  items: PriorityRange[]
  onChange: (items: PriorityRange[]) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        O mínimo é incluído, o máximo é excluído. Deixe um limite em branco para uma faixa aberta.
      </p>
      {items.map((row, i) => (
        <div key={i} className={outline}>
          <FieldGroup className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Num
              label="Mínimo"
              value={row.min}
              onChange={(min) => onChange(replace(items, i, { ...row, min }))}
            />
            <Num
              label="Máximo"
              value={row.max}
              onChange={(max) => onChange(replace(items, i, { ...row, max }))}
            />
            <Num
              label="Pontos da faixa"
              value={row.points}
              min={0}
              max={100}
              onChange={(points) => onChange(replace(items, i, { ...row, points: points ?? 0 }))}
            />
          </FieldGroup>
          <Delete label="Remover faixa" onClick={() => onChange(remove(items, i))} />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() =>
          onChange([...items, { min: items.at(-1)?.max ?? null, max: null, points: 0 }])
        }
      >
        Adicionar faixa numérica
      </Button>
    </div>
  )
}

function Condition({
  value,
  fields,
  onChange,
  hideOperator = false,
}: {
  value: PriorityCondition
  fields: PriorityField[]
  onChange: (value: PriorityCondition) => void
  hideOperator?: boolean
}) {
  const field = fields.find((item) => item.key === value.fieldKey)
  const change = (patch: Partial<PriorityCondition>) => onChange({ ...value, ...patch })
  return (
    <FieldGroup className={grid}>
      <Pick
        label="Campo avaliado"
        value={value.fieldKey}
        onChange={(fieldKey) =>
          change({ fieldKey, operator: 'exists', comparisonValue: undefined })
        }
      >
        <option value="">Selecione um campo</option>
        {value.fieldKey && !field && <option value={value.fieldKey}>Campo indisponível</option>}
        {fields.map((item) => (
          <option key={item.key} value={item.key}>
            {item.label}
          </option>
        ))}
      </Pick>
      {!hideOperator && (
        <Pick
          label="Condição"
          value={value.operator}
          onChange={(operator) =>
            change({ operator: operator as PriorityOperator, comparisonValue: undefined })
          }
        >
          {conditionsFor(field?.type).map((operator) => (
            <option key={operator} value={operator}>
              {ops[operator]}
            </option>
          ))}
        </Pick>
      )}
      {!hideOperator &&
        value.operator !== 'exists' &&
        (field?.type === 'number' ? (
          <Num
            label="Valor de comparação"
            value={typeof value.comparisonValue === 'number' ? value.comparisonValue : null}
            onChange={(comparisonValue) => change({ comparisonValue })}
          />
        ) : field?.type === 'boolean' || field?.type === 'select' ? (
          <Pick
            label="Valor de comparação"
            value={String(value.comparisonValue ?? '')}
            onChange={(option) =>
              change({
                comparisonValue:
                  field.type === 'boolean'
                    ? option === ''
                      ? undefined
                      : option === 'true'
                    : option,
              })
            }
          >
            <option value="">Selecione</option>
            {(field.type === 'boolean'
              ? [
                  { value: 'true', label: 'Sim' },
                  { value: 'false', label: 'Não' },
                ]
              : field.options
            ).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Pick>
        ) : (
          <Text
            label={field?.type === 'date' ? 'Data (AAAA-MM-DD)' : 'Valor de comparação'}
            value={String(value.comparisonValue ?? '')}
            onChange={(comparisonValue) => change({ comparisonValue })}
          />
        ))}
    </FieldGroup>
  )
}
const emptyCondition = (): PriorityCondition => ({
  fieldKey: '',
  recordTypeId: null,
  operator: 'exists',
})
const alternative = (): PriorityAlternative => ({
  ...emptyCondition(),
  points: 0,
  estimated: false,
  bands: [],
})
const signalRule = (): PrioritySignalRule => ({
  kind: 'buyer_reply',
  points: 0,
  buyerRelevant: false,
  purchaseBands: [],
})
const fieldsFor = (fields: PriorityField[], type: string | null) =>
  fields.filter((field) => !field.recordTypeId || field.recordTypeId === type)

function SignalRules({
  rules,
  onChange,
}: {
  rules: PrioritySignalRule[]
  onChange: (rules: PrioritySignalRule[]) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      {rules.map((rule, i) => {
        const patch = (next: Partial<PrioritySignalRule>) =>
          onChange(replace(rules, i, { ...rule, ...next }))
        return (
          <div key={i} className={outline}>
            <FieldGroup className={grid}>
              <Pick
                label="Sinal"
                value={rule.kind}
                onChange={(kind) =>
                  patch({
                    kind: kind as PrioritySignalRule['kind'],
                    purchaseBands:
                      kind === 'purchase_window' ? [{ min: 0, max: null, points: 0 }] : [],
                  })
                }
              >
                {Object.entries(prioritySignalLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Pick>
              <Pick
                label="Canal"
                value={rule.channel ?? ''}
                onChange={(channel) =>
                  patch({ channel: (channel || undefined) as PrioritySignalRule['channel'] })
                }
              >
                <option value="">Todos os canais</option>
                {Object.entries(priorityChannelLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Pick>
              {rule.kind !== 'purchase_window' && (
                <Num
                  label="Pontos do sinal"
                  value={rule.points}
                  min={0}
                  max={100}
                  onChange={(points) => patch({ points: points ?? 0 })}
                />
              )}
              <Num
                label="Validade em dias (opcional)"
                value={rule.validForDays ?? null}
                min={1}
                max={730}
                onChange={(validForDays) => patch({ validForDays: validForDays ?? undefined })}
              />
            </FieldGroup>
            {rule.kind === 'purchase_window' && (
              <Ranges
                items={rule.purchaseBands}
                onChange={(purchaseBands) => patch({ purchaseBands })}
              />
            )}
            {!['task_completed', 'stage_changed'].includes(rule.kind) && (
              <Check
                label="Considerar como interação relevante do comprador"
                value={rule.buyerRelevant}
                onChange={(buyerRelevant) => patch({ buyerRelevant })}
              />
            )}
            <Delete label="Remover regra de sinal" onClick={() => onChange(remove(rules, i))} />
          </div>
        )
      })}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start"
        onClick={() => onChange([...rules, signalRule()])}
      >
        Adicionar regra de sinal
      </Button>
    </div>
  )
}

function Bands({
  label,
  bands,
  onChange,
}: {
  label: string
  bands: PriorityBand[]
  onChange: (items: PriorityBand[]) => void
}) {
  return (
    <div className={outline}>
      <h4 className="font-medium">{label}</h4>
      {bands.map((band, i) => (
        <div key={band.id} className={outline}>
          <FieldGroup className={grid}>
            <Text
              label="Nome da faixa"
              value={band.label}
              onChange={(label) => onChange(replace(bands, i, { ...band, label }))}
            />
            <Num
              label="Nota inicial"
              value={band.min}
              min={0}
              max={100}
              disabled={i === 0}
              onChange={(min) => onChange(replace(bands, i, { ...band, min: min ?? 0 }))}
            />
          </FieldGroup>
          {i > 0 && <Delete label="Remover faixa" onClick={() => onChange(remove(bands, i))} />}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() =>
          onChange([
            ...bands,
            { id: id(), label: '', min: Math.min(100, (bands.at(-1)?.min ?? 0) + 1) },
          ])
        }
      >
        Adicionar faixa
      </Button>
    </div>
  )
}

export function PriorityRulesEditor({
  value,
  onChange,
  fields,
  recordTypes,
}: {
  value: PriorityDefinition
  onChange: (value: PriorityDefinition) => void
  fields: PriorityField[]
  recordTypes: NonNullable<PriorityConfiguration['recordTypes']>
}) {
  const patch = (next: Partial<PriorityDefinition>) => onChange({ ...value, ...next })
  const classification = (
    next: Partial<Pick<PriorityDefinition, 'fitBands' | 'temperatureBands' | 'queues'>>,
  ) => {
    const changed = { ...value, ...next }
    changed.matrix = changed.fitBands.flatMap((fit) =>
      changed.temperatureBands.map((temperature) => {
        const prior = value.matrix.find(
          (cell) => cell.fitBandId === fit.id && cell.temperatureBandId === temperature.id,
        )
        return {
          fitBandId: fit.id,
          temperatureBandId: temperature.id,
          queueId: changed.queues.some((queue) => queue.id === prior?.queueId)
            ? prior!.queueId
            : changed.queues[0].id,
        }
      }),
    )
    onChange(changed)
  }
  const types = (
    <>
      <option value="">Todos os tipos</option>
      {recordTypes.map((type) => (
        <option key={type.id} value={type.id}>
          {type.name}
        </option>
      ))}
    </>
  )
  return (
    <div className="flex flex-col gap-4">
      <FieldGroup className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Num
          label="Peso do potencial (%)"
          value={value.fitWeight}
          min={0}
          max={100}
          onChange={(fitWeight) =>
            patch({ fitWeight: fitWeight ?? 0, temperatureWeight: 100 - (fitWeight ?? 0) })
          }
        />
        <Num
          label="Peso da temperatura (%)"
          value={value.temperatureWeight}
          min={0}
          max={100}
          onChange={(temperatureWeight) =>
            patch({
              temperatureWeight: temperatureWeight ?? 0,
              fitWeight: 100 - (temperatureWeight ?? 0),
            })
          }
        />
        <Num
          label="Cobertura mínima (%)"
          value={value.minimumCoverage}
          min={0}
          max={100}
          onChange={(minimumCoverage) => patch({ minimumCoverage: minimumCoverage ?? 0 })}
        />
      </FieldGroup>
      <Tabs defaultValue="fit" className="min-w-0">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="fit">Potencial</TabsTrigger>
          <TabsTrigger value="intent">Temperatura</TabsTrigger>
          <TabsTrigger value="queues">Filas</TabsTrigger>
          <TabsTrigger value="exclusions">Impedimentos</TabsTrigger>
        </TabsList>
        <TabsContent value="fit" className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Cada grupo usa a primeira alternativa com dado conhecido.
          </p>
          {value.fitGroups.map((group, i) => {
            const update = (next: Partial<typeof group>) =>
              patch({ fitGroups: replace(value.fitGroups, i, { ...group, ...next }) })
            return (
              <div key={group.id} className={outline}>
                <FieldGroup className={grid}>
                  <Text
                    label="Nome do critério"
                    value={group.label}
                    onChange={(label) => update({ label })}
                  />
                  <Num
                    label="Teto do grupo"
                    value={group.maxPoints}
                    min={1}
                    max={100}
                    onChange={(maxPoints) => update({ maxPoints: maxPoints ?? 1 })}
                  />
                  <Pick
                    label="Tipo de lead do grupo"
                    value={group.recordTypeId ?? ''}
                    onChange={(recordTypeId) => update({ recordTypeId: recordTypeId || null })}
                  >
                    {types}
                  </Pick>
                </FieldGroup>
                {group.alternatives.map((rule, j) => {
                  const edit = (next: Partial<typeof rule>) =>
                    update({ alternatives: replace(group.alternatives, j, { ...rule, ...next }) })
                  const applicable = fieldsFor(fields, rule.recordTypeId ?? group.recordTypeId)
                  return (
                    <div key={j} className={outline}>
                      <div className="flex flex-wrap items-center gap-2">
                        <h5 className="text-sm font-medium">Alternativa {j + 1}</h5>
                        {j > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const ordered = [...group.alternatives]
                              ;[ordered[j - 1], ordered[j]] = [ordered[j], ordered[j - 1]]
                              update({ alternatives: ordered })
                            }}
                          >
                            Subir alternativa
                          </Button>
                        )}
                      </div>
                      {!group.recordTypeId && (
                        <Pick
                          label="Tipo de lead da alternativa"
                          value={rule.recordTypeId ?? ''}
                          onChange={(recordTypeId) => edit({ recordTypeId: recordTypeId || null })}
                        >
                          {types}
                        </Pick>
                      )}
                      <Condition
                        value={rule}
                        fields={applicable}
                        onChange={(next) =>
                          edit({
                            ...next,
                            ...(next.fieldKey !== rule.fieldKey ? { bands: [] } : {}),
                          })
                        }
                        hideOperator={rule.bands.length > 0}
                      />
                      {applicable.some(
                        (field) => field.key === rule.fieldKey && field.type === 'number',
                      ) && (
                        <Check
                          label="Pontuar por faixas numéricas"
                          value={Boolean(rule.bands.length)}
                          onChange={(enabled) =>
                            edit({ bands: enabled ? [{ min: null, max: null, points: 0 }] : [] })
                          }
                        />
                      )}
                      {rule.bands.length ? (
                        <Ranges items={rule.bands} onChange={(bands) => edit({ bands })} />
                      ) : (
                        <Num
                          label="Pontos da alternativa"
                          value={rule.points}
                          min={0}
                          max={group.maxPoints}
                          onChange={(points) => edit({ points: points ?? 0 })}
                        />
                      )}
                      <Check
                        label="Dado estimado"
                        value={rule.estimated}
                        onChange={(estimated) => edit({ estimated })}
                      />
                      <Delete
                        label="Remover alternativa"
                        onClick={() => update({ alternatives: remove(group.alternatives, j) })}
                      />
                    </div>
                  )
                })}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => update({ alternatives: [...group.alternatives, alternative()] })}
                  >
                    Adicionar alternativa
                  </Button>
                  <Delete
                    label="Remover critério"
                    onClick={() => patch({ fitGroups: remove(value.fitGroups, i) })}
                  />
                </div>
              </div>
            )
          })}
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() =>
              patch({
                fitGroups: [
                  ...value.fitGroups,
                  {
                    id: id(),
                    label: '',
                    maxPoints: 10,
                    recordTypeId: null,
                    alternatives: [alternative()],
                  },
                ],
              })
            }
          >
            Adicionar critério
          </Button>
        </TabsContent>
        <TabsContent value="intent" className="flex flex-col gap-3">
          <FieldGroup className={grid}>
            <Num
              label="Janela histórica (dias)"
              value={value.historyDays}
              min={1}
              max={730}
              onChange={(historyDays) => patch({ historyDays: historyDays ?? 1 })}
            />
            <Text
              label="Fuso horário"
              value={value.timeZone}
              onChange={(timeZone) => patch({ timeZone })}
            />
          </FieldGroup>
          {value.interestGroups.map((group, i) => {
            const update = (next: Partial<typeof group>) =>
              patch({ interestGroups: replace(value.interestGroups, i, { ...group, ...next }) })
            return (
              <div key={group.id} className={outline}>
                <FieldGroup className={grid}>
                  <Text
                    label="Nome do grupo de sinais"
                    value={group.label}
                    onChange={(label) => update({ label })}
                  />
                  <Num
                    label="Teto de interesse"
                    value={group.maxPoints}
                    min={1}
                    max={100}
                    onChange={(maxPoints) => update({ maxPoints: maxPoints ?? 1 })}
                  />
                  <Pick
                    label="Combinação"
                    value={group.strategy}
                    onChange={(strategy) => update({ strategy: strategy as typeof group.strategy })}
                  >
                    <option value="max">Sinal mais forte</option>
                    <option value="sumCapped">Somar até o teto</option>
                  </Pick>
                </FieldGroup>
                <SignalRules rules={group.rules} onChange={(rules) => update({ rules })} />
                <Delete
                  label="Remover grupo de sinais"
                  onClick={() => patch({ interestGroups: remove(value.interestGroups, i) })}
                />
              </div>
            )
          })}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="self-start"
            onClick={() =>
              patch({
                interestGroups: [
                  ...value.interestGroups,
                  { id: id(), label: '', maxPoints: 20, strategy: 'max', rules: [signalRule()] },
                ],
              })
            }
          >
            Adicionar grupo de sinais
          </Button>
          <div className={outline}>
            <h4 className="font-medium">Inatividade do comprador</h4>
            <p className="text-sm text-muted-foreground">
              A faixa mais recente de inatividade aplica a perda de pontos. A validade de cada sinal
              é calculada separadamente.
            </p>
            {value.inactivity.map((row, i) => (
              <div key={i} className={outline}>
                <FieldGroup className={grid}>
                  <Num
                    label="Após quantos dias"
                    value={row.afterDays}
                    min={1}
                    max={730}
                    onChange={(afterDays) =>
                      patch({
                        inactivity: replace(value.inactivity, i, {
                          ...row,
                          afterDays: afterDays ?? 1,
                        }),
                      })
                    }
                  />
                  <Num
                    label="Pontos a descontar"
                    value={row.points}
                    min={0}
                    max={100}
                    onChange={(points) =>
                      patch({
                        inactivity: replace(value.inactivity, i, { ...row, points: points ?? 0 }),
                      })
                    }
                  />
                </FieldGroup>
                <Delete
                  label="Remover faixa de inatividade"
                  onClick={() => patch({ inactivity: remove(value.inactivity, i) })}
                />
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() =>
                patch({
                  inactivity: [
                    ...value.inactivity,
                    { afterDays: (value.inactivity.at(-1)?.afterDays ?? 0) + 1, points: 0 },
                  ],
                })
              }
            >
              Adicionar faixa de inatividade
            </Button>
          </div>
          <div className={outline}>
            <Check
              label="Configurar descontos por sinais"
              value={Boolean(value.penalties)}
              onChange={(enabled) =>
                patch({ penalties: enabled ? { maxPoints: 20, rules: [signalRule()] } : undefined })
              }
            />
            {value.penalties && (
              <>
                <Num
                  label="Teto de desconto"
                  value={value.penalties.maxPoints}
                  min={1}
                  max={100}
                  onChange={(maxPoints) =>
                    patch({ penalties: { ...value.penalties!, maxPoints: maxPoints ?? 1 } })
                  }
                />
                <SignalRules
                  rules={value.penalties.rules}
                  onChange={(rules) => patch({ penalties: { ...value.penalties!, rules } })}
                />
              </>
            )}
          </div>
        </TabsContent>
        <TabsContent value="queues" className="flex flex-col gap-3">
          <Bands
            label="Faixas de potencial"
            bands={value.fitBands}
            onChange={(fitBands) => classification({ fitBands })}
          />
          <Bands
            label="Faixas de temperatura"
            bands={value.temperatureBands}
            onChange={(temperatureBands) => classification({ temperatureBands })}
          />
          <div className={outline}>
            <div>
              <h4 className="font-medium">Filas em ordem de atendimento</h4>
              <p className="text-sm text-muted-foreground">
                Preencha o prazo para usar a ação sugerida como tarefa quando um lead entrar na fila.
                Deixe o prazo em branco para manter apenas a sugestão.
              </p>
            </div>
            {value.queues.map((queue, i) => (
              <div key={queue.id} className={outline}>
                <FieldGroup className={grid}>
                  <Text
                    label="Nome da fila"
                    value={queue.label}
                    onChange={(label) =>
                      classification({ queues: replace(value.queues, i, { ...queue, label }) })
                    }
                  />
                  <Text
                    label="Próxima ação sugerida"
                    value={queue.recommendation ?? ''}
                    onChange={(recommendation) =>
                      classification({
                        queues: replace(value.queues, i, { ...queue, recommendation }),
                      })
                    }
                  />
                  <Num
                    label="Prazo da tarefa automática (dias)"
                    value={queue.taskDueDays ?? null}
                    min={1}
                    max={730}
                    onChange={(days) =>
                      classification({
                        queues: replace(value.queues, i, { ...queue, taskDueDays: days ?? undefined }),
                      })
                    }
                  />
                </FieldGroup>
                <div className="flex flex-wrap gap-2">
                  {i > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const queues = [...value.queues]
                        ;[queues[i - 1], queues[i]] = [queues[i], queues[i - 1]]
                        classification({ queues })
                      }}
                    >
                      Subir fila
                    </Button>
                  )}
                  {value.queues.length > 1 && (
                    <Delete
                      label="Remover fila"
                      onClick={() => classification({ queues: remove(value.queues, i) })}
                    />
                  )}
                </div>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() => classification({ queues: [...value.queues, { id: id(), label: '' }] })}
            >
              Adicionar fila
            </Button>
          </div>
          <div className={outline}>
            <h4 className="font-medium">Fila por combinação de faixas</h4>
            <FieldGroup className={grid}>
              {value.matrix.map((cell, i) => (
                <Pick
                  key={cell.fitBandId + cell.temperatureBandId}
                  label={`${value.fitBands.find((b) => b.id === cell.fitBandId)?.label} / ${value.temperatureBands.find((b) => b.id === cell.temperatureBandId)?.label}`}
                  value={cell.queueId}
                  onChange={(queueId) =>
                    patch({ matrix: replace(value.matrix, i, { ...cell, queueId }) })
                  }
                >
                  {value.queues.map((queue) => (
                    <option key={queue.id} value={queue.id}>
                      {queue.label || 'Fila sem nome'}
                    </option>
                  ))}
                </Pick>
              ))}
            </FieldGroup>
          </div>
        </TabsContent>
        <TabsContent value="exclusions" className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Quando a condição é atendida, o lead fica fora da fila de contato.
          </p>
          {value.exclusions.map((rule, i) => {
            const edit = (next: Partial<typeof rule>) =>
              patch({ exclusions: replace(value.exclusions, i, { ...rule, ...next }) })
            return (
              <div key={rule.id} className={outline}>
                <FieldGroup className={grid}>
                  <Text
                    label="Motivo do impedimento"
                    value={rule.label}
                    onChange={(label) => edit({ label })}
                  />
                  <Pick
                    label="Tipo de lead"
                    value={rule.recordTypeId ?? ''}
                    onChange={(recordTypeId) => edit({ recordTypeId: recordTypeId || null })}
                  >
                    {types}
                  </Pick>
                </FieldGroup>
                <Condition
                  value={rule}
                  fields={fieldsFor(fields, rule.recordTypeId)}
                  onChange={edit}
                />
                <Delete
                  label="Remover impedimento"
                  onClick={() => patch({ exclusions: remove(value.exclusions, i) })}
                />
              </div>
            )
          })}
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() =>
              patch({
                exclusions: [...value.exclusions, { id: id(), label: '', ...emptyCondition() }],
              })
            }
          >
            Adicionar impedimento
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  )
}
