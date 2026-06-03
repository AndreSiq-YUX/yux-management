import { Badge } from '@/components/ui/badge'
import type { OmnichannelAiRunView, OmnichannelConversationSummary, OmnichannelMessageView } from '@/services/omnichannelService'

interface ConversationDetailsProps {
  conversation?: OmnichannelConversationSummary
  messages: OmnichannelMessageView[]
  aiRuns: OmnichannelAiRunView[]
}

const money = (value: number) => `R$ ${value.toFixed(4).replace('.', ',')}`

export function ConversationDetails({ conversation, messages, aiRuns }: ConversationDetailsProps) {
  if (!conversation) {
    return <section className="flex min-h-[680px] items-center justify-center bg-white text-sm text-gray-500">Selecione uma conversa.</section>
  }

  const latestRun = aiRuns[0]
  const confidence = typeof latestRun?.metadata?.confidence === 'number' ? Math.round(latestRun.metadata.confidence * 100) : null

  return (
    <section className="grid min-h-[680px] grid-rows-[auto_1fr] bg-white">
      <header className="border-b p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{conversation.contact?.displayName || conversation.subject || 'Conversa'}</h1>
            <p className="text-sm text-gray-600">{conversation.summary || 'Resumo ainda nao gerado.'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>{conversation.status}</Badge>
            <Badge variant="secondary">{conversation.responseMode}</Badge>
            <Badge variant="outline">{conversation.channel}</Badge>
          </div>
        </div>
      </header>
      <div className="grid min-h-0 lg:grid-cols-[1fr_300px]">
        <div className="min-h-0 overflow-y-auto p-4">
          <div className="space-y-3">
            {messages.map(message => (
              <article key={message.id} className={`max-w-[78%] rounded-md border p-3 text-sm ${message.direction === 'outbound' ? 'ml-auto bg-yux-50' : 'bg-gray-50'}`}>
                <div className="mb-1 flex items-center justify-between gap-2 text-xs text-gray-500">
                  <span>{message.authorType}</span>
                  <span>{message.deliveryStatus}</span>
                </div>
                <p className="whitespace-pre-wrap text-gray-900">{message.body}</p>
                {message.attachments.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {message.attachments.map(attachment => (
                      <div key={attachment.id} className="rounded border bg-white px-2 py-1 text-xs text-gray-600">{attachment.filename}</div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
        <aside className="space-y-4 border-l bg-gray-50 p-4 text-sm">
          <section>
            <h2 className="text-sm font-semibold text-gray-900">Contexto</h2>
            <dl className="mt-2 space-y-1 text-gray-600">
              <div className="flex justify-between gap-3"><dt>Classificacao</dt><dd>{conversation.classification || 'n/a'}</dd></div>
              <div className="flex justify-between gap-3"><dt>Sentimento</dt><dd>{conversation.sentiment || 'n/a'}</dd></div>
              <div className="flex justify-between gap-3"><dt>CRM</dt><dd>CRM {conversation.leadId || conversation.contact?.leadId || 'sem lead'}</dd></div>
              <div className="flex justify-between gap-3"><dt>Fila</dt><dd>{conversation.queue?.name || 'sem fila'}</dd></div>
              <div className="flex justify-between gap-3"><dt>Equipe</dt><dd>{conversation.team?.name || 'sem equipe'}</dd></div>
              <div className="flex justify-between gap-3"><dt>Responsavel</dt><dd>{conversation.assignedUser?.name || 'sem responsavel'}</dd></div>
              <div className="flex justify-between gap-3"><dt>SLA</dt><dd>{conversation.slaDeadlineAt ? new Date(conversation.slaDeadlineAt).toLocaleString('pt-BR') : 'n/a'}</dd></div>
            </dl>
          </section>
          <section>
            <h2 className="text-sm font-semibold text-gray-900">IA</h2>
            {latestRun ? (
              <dl className="mt-2 space-y-1 text-gray-600">
                <div className="flex justify-between gap-3"><dt>Modelo</dt><dd>{latestRun.model || latestRun.logicalProvider || 'logico'}</dd></div>
                {confidence !== null && <div className="flex justify-between gap-3"><dt>Confianca</dt><dd>Confianca {confidence}%</dd></div>}
                <div className="flex justify-between gap-3"><dt>Custo</dt><dd>Custo {money(latestRun.estimatedCost)}</dd></div>
                <div className="flex justify-between gap-3"><dt>Latencia</dt><dd>Latencia {latestRun.latencyMs} ms</dd></div>
              </dl>
            ) : <p className="mt-2 text-gray-500">Sem execucao de IA.</p>}
          </section>
          <section>
            <h2 className="text-sm font-semibold text-gray-900">Tags</h2>
            <div className="mt-2 flex flex-wrap gap-1">
              {conversation.tags.map(tag => <Badge key={tag} variant="outline">{tag}</Badge>)}
            </div>
          </section>
        </aside>
      </div>
    </section>
  )
}
