import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { commercialEmailError, commercialEmailService, type CommercialSender } from '@/services/commercialEmailService'
import type { Organization } from '@/types/platform'

export function CommercialSenderAdmin({ organizations }: { organizations: Organization[] }) {
  const [organizationId, setOrganizationId] = useState('')
  return <section className="space-y-3">
    <label className="block max-w-sm text-sm">
      Empresa para revisão do remetente comercial
      <select className="mt-1 block w-full rounded-md border bg-white p-2" value={organizationId}
        onChange={event => setOrganizationId(event.target.value)}>
        <option value="">Selecione uma empresa</option>
        {organizations.map(organization => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
      </select>
    </label>
    {organizationId && <CommercialSenderPanel key={organizationId} organizationId={organizationId} review />}
  </section>
}

export function CommercialSenderPanel({ organizationId, review = false }: { organizationId: string; review?: boolean }) {
  const [sender, setSender] = useState<CommercialSender | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [mode, setMode] = useState<CommercialSender['mode']>('professional')
  const [fromName, setFromName] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [verified, setVerified] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [testKey, setTestKey] = useState<string>()

  useEffect(() => {
    let active = true
    commercialEmailService.sender(organizationId).then(result => {
      if (!active) return
      setSender(result.sender)
      setCanManage(result.canManage)
      setMode(result.sender?.mode ?? 'professional')
      setFromName(result.sender?.fromName ?? '')
      setFromEmail(result.sender?.fromEmail ?? '')
      setReplyTo(result.sender?.replyTo ?? '')
    }).catch(() => { if (active) setError('Não foi possível carregar o remetente comercial.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [organizationId])

  async function act(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    setNotice('')
    try { await action() }
    catch (cause) { setError(commercialEmailError(cause, 'Não foi possível concluir a operação.')) }
    finally { setBusy(false) }
  }

  function save(event: FormEvent) {
    event.preventDefault()
    void act(async () => {
      const result = await commercialEmailService.save(organizationId, mode === 'professional'
        ? { mode, fromName, fromEmail, replyTo } : { mode, fromName, replyTo: replyTo.trim() || undefined })
      setSender(result.sender)
      setTestKey(undefined)
      setNotice('Solicitação salva. A YUX vai revisar os endereços antes de liberar o envio.')
    })
  }

  function reviewSender(approved: boolean) {
    if (!sender) return
    void act(async () => {
      const result = await commercialEmailService.review(organizationId, approved
        ? { approved, revision: sender.revision, verified: true,
            ...(sender.mode === 'managed' ? { managedAddress: fromEmail, managedReplyTo: replyTo } : {}) }
        : { approved, revision: sender.revision })
      setSender(result.sender)
      setFromEmail(result.sender?.fromEmail ?? '')
      setReplyTo(result.sender?.replyTo ?? '')
      setVerified(false)
      setNotice(approved ? 'Remetente ativado.' : 'Remetente pausado.')
    })
  }

  function sendTest() {
    if (!sender) return
    const requestKey = testKey ?? crypto.randomUUID()
    setTestKey(requestKey)
    void act(async () => {
      await commercialEmailService.test(organizationId, { requestKey, revision: sender.revision })
      setTestKey(undefined)
      setNotice(`Teste enfileirado para ${sender.replyTo}. Confira a mensagem na caixa de entrada.`)
    })
  }

  return <section className="space-y-4 rounded-lg border bg-white p-4">
    <div>
      <h2 className="font-semibold">Remetente comercial</h2>
      <p className="text-sm text-slate-600">Escolha a identidade usada no envio individual aos leads do CRM.</p>
    </div>
    {loading && <p role="status">Carregando remetente…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {!loading && <p className="text-sm font-medium">{sender?.approvedAt ? 'Ativo' : sender ? 'Aguardando revisão da YUX' : 'Sem remetente cadastrado'}</p>}
    {sender && <dl className="grid gap-1 text-sm">
      <div><dt className="inline font-medium">Tipo </dt><dd className="inline">{sender.mode === 'managed' ? 'Gerenciado pela YUX' : 'E-mail profissional próprio'}</dd></div>
      <div><dt className="inline font-medium">Remetente </dt><dd className="inline">{sender.fromName} {sender.fromEmail && `<${sender.fromEmail}>`}</dd></div>
      <div><dt className="inline font-medium">Respostas para </dt><dd className="inline">{sender.replyTo ?? 'Caixa dedicada solicitada'}</dd></div>
    </dl>}
    {!review && !loading && canManage && <form onSubmit={save} className="grid max-w-lg gap-3 text-sm">
      <label>Tipo de remetente
        <select className="mt-1 block w-full rounded-md border bg-white p-2" value={mode}
          onChange={event => setMode(event.target.value === 'managed' ? 'managed' : 'professional')}>
          <option value="professional">Usar meu e-mail profissional</option>
          <option value="managed">Usar um endereço gerenciado pela YUX</option>
        </select>
      </label>
      <label>Nome comercial<Input required maxLength={120} value={fromName} onChange={event => setFromName(event.target.value)} /></label>
      {mode === 'professional' && <label>Endereço profissional<Input type="email" required value={fromEmail} onChange={event => setFromEmail(event.target.value)} /></label>}
      {mode === 'managed' && <p>A YUX provisiona um endereço exclusivo em comercial.yux.com.br. Informe uma caixa comercial existente ou solicite à YUX uma caixa dedicada.</p>}
      <label>Caixa que receberá as respostas<Input type="email" required={mode === 'professional'} value={replyTo} onChange={event => setReplyTo(event.target.value)} /></label>
      {mode === 'managed' && <p>Deixe a caixa em branco para solicitar uma caixa dedicada.</p>}
      {sender?.approvedAt && <p>Uma alteração no cadastro volta para revisão antes de novos envios.</p>}
      <Button type="submit" className="w-fit" disabled={busy || Boolean(sender && mode === sender.mode
        && fromName.trim() === sender.fromName && (replyTo.trim().toLowerCase() || null) === sender.replyTo
        && (mode === 'managed' || fromEmail.trim().toLowerCase() === sender.fromEmail))}>Solicitar ativação</Button>
    </form>}
    {review && sender && (sender.approvedAt
      ? <Button variant="outline" disabled={busy} onClick={() => reviewSender(false)}>Pausar remetente</Button>
      : <form className="space-y-3 text-sm" onSubmit={event => { event.preventDefault(); reviewSender(true) }}>
        {sender.mode === 'managed' && <label className="block max-w-lg">Endereço provisionado pela YUX
          <Input type="email" required placeholder="empresa@comercial.yux.com.br" value={fromEmail} onChange={event => setFromEmail(event.target.value)} />
        </label>}
        {sender.mode === 'managed' && <label className="block max-w-lg">Caixa comercial de respostas
          <Input type="email" required value={replyTo} onChange={event => setReplyTo(event.target.value)} />
        </label>}
        <label className="flex items-start gap-2">
          <input type="checkbox" required checked={verified} onChange={event => setVerified(event.target.checked)} />
          Confirmei a autorização da empresa, o remetente no SMTP2GO e quem controla a caixa de respostas.
        </label>
        <Button type="submit" disabled={busy || !verified}>Ativar remetente</Button>
      </form>)}
    {canManage && sender?.approvedAt && <Button variant="outline" disabled={busy} onClick={sendTest}>Enviar teste para a caixa de respostas</Button>}
  </section>
}
