import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { getSectorTemplate, sectorTemplateCatalog } from '@/lib/automations/sectorTemplateCatalog'
import type { AutomationFlowInput } from '@/types/automation'

const sectorTemplates = [
  { key: 'none', label: 'Do zero' },
  ...sectorTemplateCatalog.map(t => ({ key: t.key, label: t.label })),
]

interface AutomationCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: Omit<AutomationFlowInput, 'organizationId'>) => void
  disabled?: boolean
}

export function AutomationCreateDialog({ open, onOpenChange, onSubmit, disabled }: AutomationCreateDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sectorTemplateKey, setSectorTemplateKey] = useState('none')

  const canSubmit = name.trim().length > 0
  const selectedTemplate = sectorTemplateKey !== 'none' ? getSectorTemplate(sectorTemplateKey) : null

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      sectorTemplateKey: sectorTemplateKey !== 'none' ? sectorTemplateKey : undefined,
    })
    setName('')
    setDescription('')
    setSectorTemplateKey('none')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo fluxo de automação</DialogTitle>
          <DialogDescription>
            Configure o nome, a descrição e o modelo inicial do fluxo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="flow-name">Nome</Label>
            <Input
              id="flow-name"
              placeholder="Ex: Follow-up Instagram"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="flow-description">Descrição</Label>
            <Textarea
              id="flow-description"
              placeholder="Descreva o objetivo deste fluxo..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Modelo por setor</Label>
            <Select value={sectorTemplateKey} onValueChange={setSectorTemplateKey}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um modelo ou comece do zero" />
              </SelectTrigger>
              <SelectContent>
                {sectorTemplates.map(template => (
                  <SelectItem key={template.key} value={template.key}>
                    {template.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedTemplate && (
            <div className="rounded-md border border-yx-line-strong bg-yx-blue-soft p-3 space-y-2">
              <p className="text-xs font-semibold text-yx-blue">{selectedTemplate.label}</p>
              <p className="text-xs text-yx-blue">{selectedTemplate.description}</p>
              <div className="text-xs text-yx-blue">
                <p>{selectedTemplate.triggers.length} gatilho(s), {selectedTemplate.conditions.length} condição(ões), {selectedTemplate.actions.length} ação(ões)</p>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit || disabled}>
            Criar fluxo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
