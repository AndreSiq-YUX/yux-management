import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { crmRecordProfileService } from '@/services/crmRecordProfileService'
import { useCrmProfileConfiguration } from '@/hooks/useCrmProfileConfiguration'
import { customFieldTypeLabels } from '@/types/crmRecordProfile'
import type { CrmCustomField, CrmRecordType, CustomFieldType } from '@/types/crmRecordProfile'

const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50'
const emptyField = { label: '', fieldType: 'text' as CustomFieldType, required: false, optionsText: '' }

export function CrmRecordConfiguration({ crmInstanceId, onChanged }: { crmInstanceId: string; onChanged?: () => void }) {
  const { configuration, loading, error: loadError, reload } = useCrmProfileConfiguration(crmInstanceId)
  const [selectedType, setSelectedType] = useState('')
  const [typeName, setTypeName] = useState('')
  const [editingType, setEditingType] = useState<string>()
  const [field, setField] = useState(emptyField)
  const [editingField, setEditingField] = useState<CrmCustomField>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mutate = async (work: () => Promise<unknown>) => {
    setBusy(true); setError('')
    try { await work(); reload(); onChanged?.(); return true }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a configuração.'); return false }
    finally { setBusy(false) }
  }
  const saveType = async (event: FormEvent) => {
    event.preventDefault()
    if (await mutate(() => editingType
      ? crmRecordProfileService.patchRecordType(editingType, { name: typeName.trim() })
      : crmRecordProfileService.createRecordType(crmInstanceId, typeName.trim()))) {
      setTypeName(''); setEditingType(undefined)
    }
  }
  const saveField = async (event: FormEvent) => {
    event.preventDefault()
    const options = field.optionsText.split('\n').map(option => option.trim()).filter(Boolean)
    if (!editingField && field.fieldType === 'select' && (!options.length || new Set(options).size !== options.length)) {
      setError('Informe pelo menos uma opção, sem repetir os valores.'); return
    }
    if (await mutate(() => editingField
      ? crmRecordProfileService.patchField(editingField.id, { label: field.label.trim(), required: field.required })
      : crmRecordProfileService.createField({ crmInstanceId, recordTypeId: selectedType || null, label: field.label.trim(),
        fieldType: field.fieldType, required: field.required, options: field.fieldType === 'select' ? options : [],
        orderIndex: configuration?.fields.length || 0 }))) {
      setField(emptyField); setEditingField(undefined)
    }
  }
  const toggleType = (type: CrmRecordType) => mutate(() => crmRecordProfileService.patchRecordType(type.id, { isActive: !type.isActive }))
  const editField = (item: CrmCustomField) => {
    setEditingField(item)
    setField({ label: item.label, fieldType: item.fieldType, required: item.required, optionsText: (item.options || []).join('\n') })
  }

  if (loading) return <p className="text-sm text-muted-foreground">Carregando configuração...</p>
  if (loadError) return <div className="flex flex-col gap-3"><p role="alert">{loadError}</p><Button type="button" variant="outline" onClick={reload}>Tentar novamente</Button></div>
  if (!configuration) return null
  if (!configuration.canConfigure) return <p className="text-sm text-muted-foreground">A configuração de tipos e campos está disponível para administradores autorizados do CRM.</p>
  const scopedFields = configuration.fields.filter(item => (item.recordTypeId || '') === selectedType)
  const activeCount = configuration.fields.filter(item => item.isActive).length
  const selectedArchived = Boolean(selectedType && !configuration.recordTypes.find(type => type.id === selectedType)?.isActive)
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">Crie tipos como Cozinha industrial, Mercado ou Hotel. Cada tipo pode ter seus próprios campos; os campos comuns aparecem em todas as fichas deste CRM.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <section className="flex flex-col gap-3">
        <h3 className="font-semibold">Tipos de cliente</h3>
        <form onSubmit={saveType} className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium" htmlFor="crm-type-name">Nome do tipo
            <Input id="crm-type-name" required maxLength={100} placeholder="Ex.: Cozinha industrial" value={typeName} disabled={busy}
              onChange={event => setTypeName(event.target.value)} />
          </label>
          <Button type="submit" disabled={busy || !typeName.trim()}>{editingType ? 'Salvar nome' : 'Adicionar tipo'}</Button>
          {editingType && <Button type="button" variant="outline" onClick={() => { setEditingType(undefined); setTypeName('') }}>Cancelar</Button>}
        </form>
        <ul className="flex flex-col gap-2">
          {configuration.recordTypes.map(type => (
            <li key={type.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
              <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">{type.name}{!type.isActive && <Badge variant="secondary">Arquivado</Badge>}</span>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { setEditingType(type.id); setTypeName(type.name) }} aria-label={`Renomear ${type.name}`}>Renomear</Button>
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void toggleType(type)} aria-label={`${type.isActive ? 'Arquivar' : 'Restaurar'} tipo ${type.name}`}>{type.isActive ? 'Arquivar' : 'Restaurar'}</Button>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">Arquivar um tipo impede novas seleções e preserva as fichas e respostas existentes.</p>
      </section>
      <section className="flex flex-col gap-4 border-t pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Campos personalizados</h3><Badge variant="secondary">{activeCount} / {configuration.maxFieldCount} campos ativos</Badge></div>
        <div className="flex flex-col gap-1 text-sm font-medium"><label htmlFor="crm-field-scope">Mostrar campos de</label>
          <select id="crm-field-scope" className={selectClass} value={selectedType} disabled={busy || Boolean(editingField)} onChange={event => setSelectedType(event.target.value)}>
            <option value="">Todos os tipos (campos comuns)</option>
            {configuration.recordTypes.map(type => <option key={type.id} value={type.id}>{type.name}{!type.isActive ? ' (arquivado)' : ''}</option>)}
          </select>
        </div>
        <ul className="flex flex-col gap-2">
          {scopedFields.map(item => (
            <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="break-words text-sm font-medium">{item.label}{item.required ? ' *' : ''} {!item.isActive && <Badge variant="secondary">Arquivado</Badge>}</span>
                <span className="text-xs text-muted-foreground">{customFieldTypeLabels[item.fieldType] || item.fieldType}{item.fieldType === 'select' ? ` · ${(item.options || []).join(', ')}` : ''}</span>
                <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Chave para formulários externos</summary><code className="break-all">{item.stableKey}</code></details>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => editField(item)} aria-label={`Editar ${item.label}`}>Editar</Button>
                <Button type="button" size="sm" variant="outline" disabled={busy || (!item.isActive && activeCount >= configuration.maxFieldCount)}
                  onClick={() => void mutate(() => crmRecordProfileService.patchField(item.id, { isActive: !item.isActive }))}
                  aria-label={`${item.isActive ? 'Arquivar' : 'Restaurar'} campo ${item.label}`}>{item.isActive ? 'Arquivar' : 'Restaurar'}</Button>
              </div>
            </li>
          ))}
        </ul>
        {!scopedFields.length && <p className="text-sm text-muted-foreground">Nenhum campo cadastrado para esta seleção.</p>}
        <form onSubmit={saveField} className="flex flex-col gap-4 rounded-md border p-4">
          <fieldset disabled={busy || (!editingField && (activeCount >= configuration.maxFieldCount || selectedArchived))} className="flex min-w-0 flex-col gap-4">
            <legend className="mb-3 text-sm font-semibold">{editingField ? 'Editar campo' : 'Novo campo'}</legend>
            <label htmlFor="crm-field-label" className="flex flex-col gap-1 text-sm font-medium">Nome do campo
              <Input id="crm-field-label" required maxLength={120} placeholder="Ex.: Refeições diárias" value={field.label} onChange={event => setField(current => ({ ...current, label: event.target.value }))} />
            </label>
            <div className="flex flex-col gap-1 text-sm font-medium"><label htmlFor="crm-field-type">Formato da resposta</label>
              <select id="crm-field-type" className={selectClass} disabled={Boolean(editingField)} value={field.fieldType} onChange={event => setField(current => ({ ...current, fieldType: event.target.value as CustomFieldType }))}>
                {Object.entries(customFieldTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            {field.fieldType === 'select' && <label htmlFor="crm-field-options" className="flex flex-col gap-1 text-sm font-medium">Opções (uma por linha)
              <Textarea id="crm-field-options" required disabled={Boolean(editingField)} value={field.optionsText} onChange={event => setField(current => ({ ...current, optionsText: event.target.value }))} />
            </label>}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={field.required} onChange={event => setField(current => ({ ...current, required: event.target.checked }))} />Preenchimento obrigatório</label>
            {editingField && <p className="text-xs text-muted-foreground">O formato e as opções são preservados para manter o significado das respostas já registradas. Para mudar o formato, crie outro campo.</p>}
            <Button type="submit" className="self-start" disabled={!field.label.trim()}>{busy ? 'Salvando...' : editingField ? 'Salvar campo' : 'Adicionar campo'}</Button>
          </fieldset>
          {editingField && <Button type="button" variant="outline" className="self-start" disabled={busy} onClick={() => { setEditingField(undefined); setField(emptyField) }}>Cancelar edição</Button>}
        </form>
        {!editingField && activeCount >= configuration.maxFieldCount && <p className="text-sm text-muted-foreground">O limite de campos do contrato foi atingido. Arquive um campo ou solicite a ampliação do limite.</p>}
        {selectedArchived && <p className="text-sm text-muted-foreground">Restaure o tipo de cliente para adicionar novos campos.</p>}
      </section>
    </div>
  )
}
