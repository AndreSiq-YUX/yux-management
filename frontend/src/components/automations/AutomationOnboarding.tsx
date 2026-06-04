import { ArrowRight, GitBranch, Play, Workflow, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface AutomationOnboardingProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateFlow: () => void
}

const steps = [
  {
    icon: GitBranch,
    title: '1. Escolha o Trigger (Quando)',
    description: 'Selecione o evento que inicia a automação. Ex: quando um lead é criado, quando muda de etapa, quando uma proposta é aprovada.',
    tip: 'Dica: Comece com "Lead criado" para automações simples de follow-up.',
  },
  {
    icon: Workflow,
    title: '2. Defina as Condições (Se)',
    description: 'Adicione filtros para controlar quando a automação deve executar. Ex: apenas se a origem for Instagram, apenas se o valor for maior que 1000.',
    tip: 'Dica: Condições são opcionais. Sem condições, a automação executa sempre que o trigger ocorre.',
  },
  {
    icon: Play,
    title: '3. Configure as Ações (Então)',
    description: 'Defina o que acontece quando o trigger dispara e as condições são satisfeitas. Ex: criar tarefa, enviar WhatsApp, mover etapa.',
    tip: 'Dica: Você pode adicionar múltiplas ações. Elas executam na ordem definida.',
  },
]

export function AutomationOnboarding({ open, onOpenChange, onCreateFlow }: AutomationOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0)

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      onOpenChange(false)
      onCreateFlow()
    }
  }

  const handleSkip = () => {
    onOpenChange(false)
  }

  if (!open) return null

  const step = steps[currentStep]
  const Icon = step.icon

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg">Bem-vindo às Automações Inteligentes</DialogTitle>
            <Button type="button" variant="ghost" size="sm" onClick={handleSkip}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Progress indicator */}
          <div className="flex gap-2">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`h-1 flex-1 rounded-full ${
                  index <= currentStep ? 'bg-blue-600' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>

          {/* Step content */}
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                <Icon className="h-6 w-6 text-blue-600" />
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-slate-900">{step.title}</h3>
                <p className="text-sm text-slate-600">{step.description}</p>
              </div>
            </div>

            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <p className="text-xs text-amber-900">{step.tip}</p>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0}
            >
              Voltar
            </Button>
            <Button type="button" onClick={handleNext}>
              {currentStep < steps.length - 1 ? (
                <>
                  Próximo
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              ) : (
                'Criar meu primeiro fluxo'
              )}
            </Button>
          </div>

          <p className="text-center text-xs text-slate-500">
            Passo {currentStep + 1} de {steps.length}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
