import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { LeadScoringModel } from '@/types/crm'

export function ScoringModelForm({ model, onSave }: { model: LeadScoringModel; onSave: (input: Pick<LeadScoringModel, 'name' | 'fitWeight' | 'intentWeight' | 'thresholds'>) => Promise<void> }) {
  const [name, setName] = useState(model.name)
  const [fitWeight, setFitWeight] = useState(String(model.fitWeight))
  const [intentWeight, setIntentWeight] = useState(String(model.intentWeight))
  const [thresholds, setThresholds] = useState(model.thresholds.join(', '))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setName(model.name); setFitWeight(String(model.fitWeight)); setIntentWeight(String(model.intentWeight)); setThresholds(model.thresholds.join(', ')) }, [model])
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const fit = Number(fitWeight); const intent = Number(intentWeight)
    if (!Number.isInteger(fit) || !Number.isInteger(intent) || fit + intent !== 100) { setError('Os pesos de fit e intenção devem somar 100.'); return }
    setSaving(true); setError(null)
    try { await onSave({ name: name.trim(), fitWeight: fit, intentWeight: intent, thresholds: thresholds.split(',').map(item => Number(item.trim())).filter(Number.isFinite) }) } catch (saveError) { console.error(saveError); setError('Não foi possível salvar o modelo.') } finally { setSaving(false) }
  }
  return <form className="space-y-3 rounded-md border bg-gray-50 p-4" onSubmit={submit}><div><label htmlFor="scoring-model-name" className="text-sm font-medium">Nome do modelo</label><Input id="scoring-model-name" value={name} onChange={event => setName(event.target.value)} /></div><div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="fit-weight" className="text-sm font-medium">Peso de fit</label><Input id="fit-weight" type="number" min="0" max="100" value={fitWeight} onChange={event => setFitWeight(event.target.value)} /></div><div><label htmlFor="intent-weight" className="text-sm font-medium">Peso de intenção</label><Input id="intent-weight" type="number" min="0" max="100" value={intentWeight} onChange={event => setIntentWeight(event.target.value)} /></div></div><div><label htmlFor="score-thresholds" className="text-sm font-medium">Limiares</label><Input id="score-thresholds" value={thresholds} onChange={event => setThresholds(event.target.value)} placeholder="Ex.: 40, 70, 90" /></div>{error && <p className="text-sm text-red-600" role="alert">{error}</p>}<Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar modelo'}</Button></form>
}
