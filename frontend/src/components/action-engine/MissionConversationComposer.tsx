import { useState } from 'react'
import { ArrowUp, Loader2 } from 'lucide-react'

type Props = {
  disabled?: boolean
  initialValue?: string
  placeholder?: string
  onSend: (message: string) => Promise<void> | void
}

export function MissionConversationComposer({ disabled = false, initialValue = '', placeholder = 'Conte o que você quer realizar…', onSend }: Props) {
  const [value, setValue] = useState(initialValue)

  const submit = async () => {
    const message = value.trim()
    if (!message || disabled) return
    setValue('')
    try {
      await onSend(message)
    } catch {
      setValue(current => current || message)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_8px_30px_rgba(15,23,42,0.08)] focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100">
      <textarea
        aria-label="Mensagem para o agente de missões"
        className="min-h-20 w-full resize-none border-0 bg-transparent px-3 py-2 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400"
        disabled={disabled}
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
        <span className="text-[11px] text-slate-400">Enter envia · Shift + Enter quebra a linha</span>
        <button
          aria-label="Enviar mensagem"
          className="grid h-9 w-9 place-items-center rounded-full bg-[#2563EB] text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={disabled || !value.trim()}
          onClick={() => void submit()}
          type="button"
        >
          {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
