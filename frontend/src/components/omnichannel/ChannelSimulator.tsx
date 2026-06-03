import { useState } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { OmnichannelChannel } from '@/types/omnichannel'

interface ChannelSimulatorProps {
  organizationId: string
  onSimulateEvent?: (event: Record<string, unknown>) => void
}

const channels: OmnichannelChannel[] = ['whatsapp', 'instagram', 'email', 'webchat']

export function ChannelSimulator({ organizationId, onSimulateEvent }: ChannelSimulatorProps) {
  const [channel, setChannel] = useState<OmnichannelChannel>('whatsapp')
  const [text, setText] = useState('Mensagem simulada para atendimento.')

  return (
    <section className="border-t bg-white p-3">
      <div className="grid gap-2 md:grid-cols-[180px_1fr_auto]">
        <label className="space-y-1 text-xs">
          <span>Simulador</span>
          <select className="h-9 w-full rounded-md border px-2" value={channel} onChange={event => setChannel(event.target.value as OmnichannelChannel)}>
            {channels.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span>Evento</span>
          <input className="h-9 w-full rounded-md border px-2" value={text} onChange={event => setText(event.target.value)} />
        </label>
        <Button
          type="button"
          className="self-end"
          title="Enviar evento simulado"
          onClick={() => onSimulateEvent?.({
            organizationId,
            channel,
            text,
            eventType: 'message.created',
          })}
        >
          <Send className="mr-2 h-4 w-4" />
          Simular
        </Button>
      </div>
    </section>
  )
}
