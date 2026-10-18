import { Brain, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { AutomationAction } from '@/types/automation'

interface AiActionPreviewProps {
  action: AutomationAction
}

export function AiActionPreview({ action }: AiActionPreviewProps) {
  if (action.actionType === 'ai_classify_lead') {
    return (
      <div className="rounded-md border border-yx-line-strong bg-yx-blue-soft p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-yx-blue" />
          <p className="text-xs font-semibold text-yx-blue">Classificação de Lead com IA</p>
        </div>
        <div className="text-xs text-yx-blue">
          <p>Esta ação usará IA para classificar o lead automaticamente.</p>
          {action.payload.model !== undefined && action.payload.model !== null && (
            <p className="mt-2">
              <span className="font-semibold">Modelo/Critério:</span>{' '}
              <code className="rounded bg-yx-blue-soft px-1 py-0.5">{String(action.payload.model)}</code>
            </p>
          )}
          <p className="mt-2 text-yx-blue">
            A IA analisará os dados do lead e atribuirá uma classificação (ex: BANT, scoring, etc).
          </p>
        </div>
        <div className="flex gap-1">
          <Badge variant="outline" className="text-xs">IA</Badge>
          <Badge variant="outline" className="text-xs">Classificação</Badge>
        </div>
      </div>
    )
  }

  if (action.actionType === 'ai_generate_message') {
    return (
      <div className="rounded-md border border-yx-line-strong bg-yx-blue-soft p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-violet-500" />
          <p className="text-xs font-semibold text-brand-violet-500">Geração de Mensagem com IA</p>
        </div>
        <div className="text-xs text-brand-violet-500">
          <p>Esta ação usará IA para gerar uma mensagem personalizada.</p>
          {action.payload.prompt !== undefined && action.payload.prompt !== null && (
            <p className="mt-2">
              <span className="font-semibold">Prompt:</span>{' '}
              <span className="text-brand-violet-500">{String(action.payload.prompt).slice(0, 100)}...</span>
            </p>
          )}
          {action.payload.channel !== undefined && action.payload.channel !== null && (
            <p className="mt-1">
              <span className="font-semibold">Canal:</span>{' '}
              <code className="rounded bg-yx-blue-soft px-1 py-0.5">{String(action.payload.channel)}</code>
            </p>
          )}
          <p className="mt-2 text-brand-violet-500">
            A IA gerará uma mensagem baseada no contexto do lead e no prompt fornecido.
          </p>
        </div>
        <div className="flex gap-1">
          <Badge variant="outline" className="text-xs">IA</Badge>
          <Badge variant="outline" className="text-xs">Mensagem</Badge>
        </div>
      </div>
    )
  }

  if (action.actionType === 'ai_generate_proposal') {
    return (
      <div className="rounded-md border border-yx-line-strong bg-yx-blue-soft p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-violet-500" />
          <p className="text-xs font-semibold text-brand-violet-500">Geração de Proposta com IA</p>
        </div>
        <div className="text-xs text-brand-violet-500">
          <p>Esta ação usará IA para gerar uma proposta personalizada.</p>
          {action.payload.templateId !== undefined && action.payload.templateId !== null && (
            <p className="mt-2">
              <span className="font-semibold">ID do modelo:</span>{' '}
              <code className="rounded bg-yx-surface-2 px-1 py-0.5">{String(action.payload.templateId)}</code>
            </p>
          )}
          <p className="mt-2 text-brand-violet-500">
            A IA gerará uma proposta baseada no modelo e nos dados do lead.
          </p>
        </div>
        <div className="flex gap-1">
          <Badge variant="outline" className="text-xs">IA</Badge>
          <Badge variant="outline" className="text-xs">Proposta</Badge>
        </div>
      </div>
    )
  }

  return null
}
