import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { crmRecordProfileService } from '@/services/crmRecordProfileService'
import { applicableProfileValues } from '@/types/crmRecordProfile'
import type { LeadProfile, LeadProfileInput } from '@/types/crmRecordProfile'
import { LeadProfileFields } from './LeadProfileFields'

export function LeadProfilePanel({ leadId }: { leadId: string }) {
  const [profile, setProfile] = useState<LeadProfile>()
  const [draft, setDraft] = useState<LeadProfileInput>({ recordTypeId: null, values: {} })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let cancelled = false
    setProfile(undefined); setError(''); setSaved(false)
    crmRecordProfileService.getProfile(leadId).then(result => {
      if (!cancelled) { setProfile(result); setDraft({ recordTypeId: result.recordTypeId, values: result.values }) }
    }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a ficha.') })
    return () => { cancelled = true }
  }, [leadId, revision])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!profile) return
    setSaving(true); setError(''); setSaved(false)
    try {
      const result = await crmRecordProfileService.saveProfile(leadId, {
        recordTypeId: draft.recordTypeId,
        values: applicableProfileValues(profile.fields, draft.recordTypeId, draft.values),
      })
      setDraft(result); setSaved(true)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar os campos.') }
    finally { setSaving(false) }
  }
  if (!profile) return (
    <section className="flex flex-col gap-3 rounded-md border bg-background p-4">
      <h3 className="font-semibold">Perfil do cliente</h3>
      {error ? <><p role="alert" className="text-sm text-destructive">{error}</p><Button type="button" variant="outline" onClick={() => setRevision(value => value + 1)}>Tentar novamente</Button></> : <p className="text-sm text-muted-foreground">Carregando campos personalizados...</p>}
    </section>
  )
  const knownKeys = new Set(profile.fields.map(field => field.stableKey))
  const imported = Object.entries(profile.values).filter(([key]) => !knownKeys.has(key))
  return (
    <form className="flex flex-col gap-4 rounded-md border bg-background p-4" onSubmit={save}>
      <LeadProfileFields configuration={profile} recordTypeId={draft.recordTypeId} values={draft.values} disabled={saving}
        onTypeChange={recordTypeId => { setDraft(current => ({ ...current, recordTypeId })); setSaved(false) }}
        onValuesChange={values => { setDraft(current => ({ ...current, values })); setSaved(false) }} />
      <p className="text-xs text-muted-foreground">Ao trocar o tipo, as respostas anteriores ficam preservadas e reaparecem se você voltar ao tipo original.</p>
      {imported.length > 0 && <details><summary className="cursor-pointer text-sm font-medium">Outros dados recebidos por formulário</summary><dl className="mt-3 grid gap-3 sm:grid-cols-2">{imported.map(([key, value]) => <div key={key}><dt className="break-words text-xs text-muted-foreground">{key}</dt><dd className="break-words text-sm">{typeof value === 'boolean' ? value ? 'Sim' : 'Não' : value === null ? 'Não informado' : typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>)}</dl></details>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {saved && <p role="status" className="text-sm">Perfil salvo.</p>}
      <Button type="submit" className="self-start" disabled={saving}>{saving ? 'Salvando...' : 'Salvar perfil'}</Button>
    </form>
  )
}
