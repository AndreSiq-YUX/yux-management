import { Plus, Trash2, Clock, MessageSquare, CheckSquare } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { calculateSequenceConversionRate } from '@/lib/automations/sequenceRules'
import type { AutomationSequence, AutomationSequenceChannel, AutomationSequenceStatus, AutomationSequenceStepKind } from '@/types/automationSequence'

interface SequencesWorkspaceProps {
  sequences?: AutomationSequence[]
  loading?: boolean
  onCreateSequence?: (input: { name: string; description?: string; channel: AutomationSequenceChannel }) => void
  onDeleteSequence?: (sequenceId: string) => void
  onToggleSequence?: (sequenceId: string, status: AutomationSequenceStatus) => void
  onAddStep?: (sequenceId: string, step: { stepKind: AutomationSequenceStepKind; channel?: 'email' | 'whatsapp'; delayMinutes: number; subject?: string; body?: string }) => void
  onDeleteStep?: (sequenceId: string, stepId: string) => void
}

const stepKindLabels: Record<AutomationSequenceStepKind, string> = {
  message: 'Mensagem',
  delay: 'Aguardar',
  task: 'Tarefa',
  ai: 'IA',
  webhook: 'Webhook',
}

const stepKindIcons: Record<AutomationSequenceStepKind, React.ReactNode> = {
  message: <MessageSquare className="h-4 w-4" />,
  delay: <Clock className="h-4 w-4" />,
  task: <CheckSquare className="h-4 w-4" />,
  ai: <span className="text-xs">IA</span>,
  webhook: <span className="text-xs">⚡</span>,
}

export function SequencesWorkspace({
  sequences = [],
  loading,
  onCreateSequence,
  onDeleteSequence,
  onToggleSequence,
  onAddStep,
  onDeleteStep,
}: SequencesWorkspaceProps) {
  const [expandedSequenceId, setExpandedSequenceId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newSequenceName, setNewSequenceName] = useState('')
  const [newSequenceDescription, setNewSequenceDescription] = useState('')
  const [newSequenceChannel, setNewSequenceChannel] = useState<AutomationSequenceChannel>('whatsapp')

  const [addingStepToSequenceId, setAddingStepToSequenceId] = useState<string | null>(null)
  const [newStepKind, setNewStepKind] = useState<AutomationSequenceStepKind>('message')
  const [newStepDelay, setNewStepDelay] = useState('1440')
  const [newStepSubject, setNewStepSubject] = useState('')
  const [newStepBody, setNewStepBody] = useState('')
  const [newStepChannel, setNewStepChannel] = useState<'email' | 'whatsapp'>('whatsapp')

  const handleCreateSequence = () => {
    if (!newSequenceName.trim()) return
    onCreateSequence?.({
      name: newSequenceName.trim(),
      description: newSequenceDescription.trim() || undefined,
      channel: newSequenceChannel,
    })
    setNewSequenceName('')
    setNewSequenceDescription('')
    setNewSequenceChannel('whatsapp')
    setShowCreateForm(false)
  }

  const handleAddStep = (sequenceId: string) => {
    onAddStep?.(sequenceId, {
      stepKind: newStepKind,
      channel: newStepKind === 'message' ? newStepChannel : undefined,
      delayMinutes: Number(newStepDelay) || 0,
      subject: newStepSubject.trim() || undefined,
      body: newStepBody.trim() || undefined,
    })
    setNewStepKind('message')
    setNewStepDelay('1440')
    setNewStepSubject('')
    setNewStepBody('')
    setAddingStepToSequenceId(null)
  }

  const formatDelay = (minutes: number) => {
    if (minutes < 60) return `${minutes}min`
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h`
    return `${Math.floor(minutes / 1440)}d`
  }

  if (loading) {
    return (
      <section className="rounded-md border bg-white p-4">
        <p className="text-sm text-gray-500">Carregando sequências...</p>
      </section>
    )
  }

  return (
    <section className="rounded-md border bg-white space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <span>Sequências</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{sequences.length} configuradas</Badge>
          <Button
            type="button"
            size="sm"
            onClick={() => setShowCreateForm(true)}
          >
            <Plus className="mr-1 h-3 w-3" />
            Nova sequência
          </Button>
        </div>
      </header>

      {showCreateForm && (
        <div className="border-b p-3 bg-slate-50 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Nome da sequência</Label>
            <Input
              className="h-8 text-sm"
              placeholder="Ex: Nutrição pós-contato"
              value={newSequenceName}
              onChange={e => setNewSequenceName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Descrição (opcional)</Label>
            <Textarea
              className="text-sm min-h-[60px]"
              placeholder="Descreva o objetivo desta sequência..."
              value={newSequenceDescription}
              onChange={e => setNewSequenceDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Canal principal</Label>
            <Select value={newSequenceChannel} onValueChange={v => setNewSequenceChannel(v as AutomationSequenceChannel)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="mixed">Misto (WhatsApp + Email)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={handleCreateSequence} disabled={!newSequenceName.trim()}>
              Criar sequência
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setShowCreateForm(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <div className="divide-y">
        {sequences.length === 0 && !showCreateForm && (
          <div className="p-6 text-center space-y-3">
            <p className="text-sm text-gray-600">Nenhuma sequência configurada.</p>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              Sequências são fluxos de nutrição com múltiplos passos ao longo do tempo.
              Exemplo: enviar mensagem → aguardar 2 dias → enviar follow-up → criar tarefa para vendedor.
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => setShowCreateForm(true)}>
              <Plus className="mr-1 h-3 w-3" />
              Criar primeira sequência
            </Button>
          </div>
        )}

        {sequences.map(sequence => {
          const isExpanded = expandedSequenceId === sequence.id
          const conversionRate = calculateSequenceConversionRate({
            enrolled: sequence.activeEnrollmentCount + sequence.convertedEnrollmentCount,
            converted: sequence.convertedEnrollmentCount,
          })
          const sortedSteps = [...sequence.steps].sort((a, b) => a.orderIndex - b.orderIndex)

          return (
            <article key={sequence.id} className="space-y-2">
              <div
                className="flex cursor-pointer items-start justify-between gap-3 p-3 hover:bg-slate-50"
                onClick={() => setExpandedSequenceId(isExpanded ? null : sequence.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{sequence.name}</p>
                    <Badge variant={sequence.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                      {sequence.status}
                    </Badge>
                  </div>
                  {sequence.description && (
                    <p className="text-xs text-gray-500 mt-1">{sequence.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                    <Badge variant="outline" className="text-xs">{sequence.channel}</Badge>
                    <span>{sortedSteps.length} passo(s)</span>
                    <span>{sequence.activeEnrollmentCount} ativo(s)</span>
                    <span className="text-green-600">{conversionRate}% conversão</span>
                  </div>
                </div>
                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onToggleSequence?.(sequence.id, sequence.status === 'active' ? 'paused' : 'active')}
                  >
                    {sequence.status === 'active' ? 'Pausar' : 'Ativar'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onDeleteSequence?.(sequence.id)}
                  >
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t bg-slate-50 p-3 space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-slate-700">Passos da sequência</h4>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setAddingStepToSequenceId(addingStepToSequenceId === sequence.id ? null : sequence.id)}
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Adicionar passo
                      </Button>
                    </div>

                    {sortedSteps.length === 0 && (
                      <p className="text-xs text-slate-500">Nenhum passo adicionado. Adicione o primeiro passo abaixo.</p>
                    )}

                    <div className="relative">
                      {sortedSteps.map((step, index) => {
                        const isFirst = index === 0
                        const isLast = index === sortedSteps.length - 1
                        
                        return (
                          <div key={step.id} className="relative">
                            {!isFirst && (
                              <div className="absolute left-3 -top-2 w-0.5 h-2 bg-slate-300" />
                            )}
                            
                            <div className="flex items-start gap-3 rounded-md border bg-white p-2 relative">
                              <div className="flex flex-col items-center">
                                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-slate-100 text-xs font-semibold text-slate-600 shrink-0">
                                  {index + 1}
                                </div>
                                {!isLast && (
                                  <div className="w-0.5 h-full bg-slate-300 mt-1" />
                                )}
                              </div>
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm">{stepKindIcons[step.stepKind]}</span>
                                  <span className="text-xs font-medium text-slate-900">{stepKindLabels[step.stepKind]}</span>
                                  {step.channel && (
                                    <Badge variant="outline" className="text-xs">{step.channel}</Badge>
                                  )}
                                </div>
                                {step.stepKind === 'delay' && (
                                  <p className="text-xs text-slate-600 mt-1">Aguardar {formatDelay(step.delayMinutes)}</p>
                                )}
                                {step.stepKind === 'message' && step.subject && (
                                  <p className="text-xs text-slate-600 mt-1 font-medium">{step.subject}</p>
                                )}
                                {step.stepKind === 'message' && step.body && (
                                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{step.body}</p>
                                )}
                              </div>
                              
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => onDeleteStep?.(sequence.id, step.id)}
                              >
                                <Trash2 className="h-3 w-3 text-red-500" />
                              </Button>
                            </div>
                            
                            {!isLast && step.stepKind !== 'delay' && (
                              <div className="flex items-center gap-2 my-1 ml-3">
                                <div className="w-0.5 h-4 bg-slate-300" />
                                <span className="text-xs text-slate-400">↓</span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {addingStepToSequenceId === sequence.id && (
                    <div className="rounded-md border border-blue-200 bg-blue-50 p-3 space-y-3">
                      <h5 className="text-xs font-semibold text-blue-900">Novo passo</h5>

                      <div className="space-y-1">
                        <Label className="text-xs">Tipo de passo</Label>
                        <Select value={newStepKind} onValueChange={v => setNewStepKind(v as AutomationSequenceStepKind)}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="message">Mensagem</SelectItem>
                            <SelectItem value="delay">Aguardar (delay)</SelectItem>
                            <SelectItem value="task">Tarefa</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {newStepKind === 'message' && (
                        <>
                          <div className="space-y-1">
                            <Label className="text-xs">Canal</Label>
                            <Select value={newStepChannel} onValueChange={v => setNewStepChannel(v as 'email' | 'whatsapp')}>
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                                <SelectItem value="email">Email</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {newStepChannel === 'email' && (
                            <div className="space-y-1">
                              <Label className="text-xs">Assunto</Label>
                              <Input
                                className="h-8 text-xs"
                                placeholder="Assunto do email"
                                value={newStepSubject}
                                onChange={e => setNewStepSubject(e.target.value)}
                              />
                            </div>
                          )}
                          <div className="space-y-1">
                            <Label className="text-xs">Conteúdo</Label>
                            <Textarea
                              className="text-xs min-h-[80px]"
                              placeholder="Conteúdo da mensagem..."
                              value={newStepBody}
                              onChange={e => setNewStepBody(e.target.value)}
                            />
                          </div>
                        </>
                      )}

                      {newStepKind === 'delay' && (
                        <div className="space-y-1">
                          <Label className="text-xs">Tempo de espera (minutos)</Label>
                          <Input
                            className="h-8 text-xs"
                            type="number"
                            placeholder="1440"
                            value={newStepDelay}
                            onChange={e => setNewStepDelay(e.target.value)}
                          />
                          <p className="text-xs text-slate-600">
                            Equivale a {formatDelay(Number(newStepDelay) || 0)}
                          </p>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Button type="button" size="sm" onClick={() => handleAddStep(sequence.id)}>
                          Adicionar passo
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setAddingStepToSequenceId(null)}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
