export type ProviderUsage = {
  attempts: number | null; knownSubtotalUsd: number | null; totalUsd: number | null
  inputTokens: number | null; outputTokens: number | null; reasoningTokens: number | null
}

export type CommercialCredits = {
  state: 'held' | 'executing' | 'released' | 'settled' | 'uncertain' | 'unbilled' | 'unmeasured'
  unlimited: boolean | null; reserved: number | null; charged: number | null; released: number | null
}

const usd = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD', maximumFractionDigits: 6 })
const count = new Intl.NumberFormat('pt-BR')
const creditStatus = {
  held: 'Reserva aberta', executing: 'Em processamento', released: 'Reserva liberada', settled: 'Concluído',
  uncertain: 'Aguardando conciliação', unbilled: 'Sem cobrança de créditos', unmeasured: 'Sem registro de créditos',
}

export function ProviderUsageDetails({ provider }: { provider: ProviderUsage }) {
  return <dl className="grid grid-cols-2 gap-2">
    <div><dt className="text-gray-600">{provider.totalUsd === null ? 'Subtotal informado' : 'Custo informado'}</dt>
      <dd className="font-semibold">
        {provider.knownSubtotalUsd === null ? 'Sem medição' : usd.format(provider.knownSubtotalUsd)}
        {provider.totalUsd === null && provider.knownSubtotalUsd !== null && <span className="block text-xs font-normal text-gray-600">Total pendente</span>}
      </dd>
    </div>
    {([
      ['Tentativas', provider.attempts], ['Tokens de entrada', provider.inputTokens],
      ['Tokens de saída', provider.outputTokens], ['Tokens de raciocínio', provider.reasoningTokens],
    ] as const).map(([label, value]) => <div key={label}><dt className="text-gray-600">{label}</dt>
      <dd>{value === null ? '—' : count.format(value)}</dd></div>)}
  </dl>
}

export function AgentUsageBreakdown({ provider, credits }: { provider: ProviderUsage; credits: CommercialCredits }) {
  return <div className="grid gap-4 md:grid-cols-2">
    <div className="space-y-2">
      <h4 className="font-medium">Uso do provedor</h4>
      <ProviderUsageDetails provider={provider} />
    </div>
    <div className="space-y-2 border-t pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
      <h4 className="font-medium">Créditos comerciais</h4>
      <p>{creditStatus[credits.state]}{credits.unlimited ? ' · Carteira ilimitada' : ''}</p>
      {credits.state !== 'unbilled' && credits.state !== 'unmeasured' && <dl className="grid grid-cols-3 gap-2">
        {([
          ['Reservados', credits.reserved], [credits.unlimited ? 'Consumidos' : 'Debitados', credits.charged], ['Liberados', credits.released],
        ] as const).map(([label, value]) => <div key={label}><dt className="text-gray-600">{label}</dt>
          <dd className="font-semibold">{value === null ? '—' : count.format(value)}</dd></div>)}
      </dl>}
    </div>
  </div>
}
