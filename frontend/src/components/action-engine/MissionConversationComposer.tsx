import { useRef, useState } from 'react'
import { ArrowUp, Loader2 } from 'lucide-react'

type Props = {
  disabled?: boolean
  initialValue?: string
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  onSend: (message: string) => Promise<boolean | void> | boolean | void
}

export function MissionConversationComposer({ disabled = false, initialValue = '', value: controlledValue, onValueChange, placeholder = 'Conte o que você quer realizar…', onSend }: Props) {
  const [localValue, setLocalValue] = useState(initialValue)
  const [submitting, setSubmitting] = useState(false)
  const inFlight = useRef(false)
  const value = controlledValue ?? localValue
  const setValue = onValueChange ?? setLocalValue
  const busy = disabled || submitting

  const submit = async () => {
    const message = value.trim()
    if (!message || busy || inFlight.current) return
    inFlight.current = true
    setSubmitting(true)
    try {
      if (await onSend(message) !== false) setValue('')
    } catch {
      // The caller displays the failure; keep the user's draft for another attempt.
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-2xl border border-yx-line bg-yx-surface p-2 shadow-[0_8px_30px_rgba(15,23,42,0.08)] focus-within:border-yx-line-strong focus-within:ring-2 focus-within:ring-yx-line-strong">
      <textarea
        aria-label="Mensagem para o agente de missões"
        className="min-h-20 w-full resize-none border-0 bg-transparent px-3 py-2 text-sm leading-6 text-yx-fg outline-none placeholder:text-yx-fg-3"
        disabled={busy}
        maxLength={8000}
        onChange={event => setValue(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void submit()
          }
        }}
        placeholder={placeholder}
        value={value}
      />
      <div className="flex items-center justify-between gap-3 px-2 pb-1">
        <span className="text-[11px] text-yx-fg-3">Enter envia · Shift + Enter quebra a linha</span>
        <button
          aria-label="Enviar mensagem"
          className="grid h-9 w-9 place-items-center rounded-full bg-yx-blue text-white transition hover:bg-yx-blue-ink disabled:cursor-not-allowed disabled:bg-yx-line-strong"
          disabled={busy || !value.trim()}
          onClick={() => void submit()}
          type="button"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
