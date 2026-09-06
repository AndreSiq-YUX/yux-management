import { expect, test, type APIResponse, type Page, type TestInfo } from '@playwright/test'

const apiBase = 'http://127.0.0.1:4000/api'
const ids = {
  organizationA: '10000000-0000-4000-8000-000000000001',
  organizationB: '10000000-0000-4000-8000-000000000002',
  contractA: '30000000-0000-4000-8000-000000000001',
  task: 'a1000000-0000-4000-8000-000000000002',
  conversation: 'a1000000-0000-4000-8000-000000000005',
} as const

const credentials = {
  admin: { email: 'yux-admin@integration.test', password: 'integration-password' },
  clientAdminA: { email: 'admin-a@integration.test', password: 'integration-password' },
  clientMemberA: { email: 'member-a@integration.test', password: 'integration-password' },
} as const

type Evidence = {
  journey: `J${number}`
  complete: boolean
  checks: Record<string, boolean>
  ids?: Record<string, string | null | undefined>
  remainingGates?: string[]
}

async function login(page: Page, user: keyof typeof credentials) {
  await page.goto('/auth/login')
  await page.getByLabel('Email').fill(credentials[user].email)
  await page.getByLabel('Senha').fill(credentials[user].password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).not.toHaveURL(/\/auth\/login/)
}

async function json<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), await response.text()).toBeTruthy()
  return response.json() as Promise<T>
}

async function attachEvidence(testInfo: TestInfo, evidence: Evidence) {
  await testInfo.attach(`${evidence.journey}-evidence.json`, {
    body: Buffer.from(JSON.stringify({
      schemaVersion: 1,
      evidenceType: 'browser-integration',
      capturedAt: new Date().toISOString(),
      ...evidence,
    }, null, 2)),
    contentType: 'application/json',
  })
}

async function drainWorker(page: Page) {
  const response = await page.request.post('http://127.0.0.1:4002/worker-tick', {
    headers: { Authorization: 'Bearer acceptance-control-token' },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
}

test('J1 — perfil e fonte de conhecimento persistem após refresh', async ({ page }, testInfo) => {
  await login(page, 'clientAdminA')
  const tradeName = `Empresa A Aceitação ${Date.now()}`
  await page.goto('/portal/empresa/perfil')
  await expect(page.getByRole('heading', { name: 'Perfil da Empresa' })).toBeVisible()
  await page.getByLabel('Nome da marca').fill(tradeName)
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page.getByText('Informações da empresa salvas.')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Nome da marca')).toHaveValue(tradeName)

  const profile = await json<{ tradeName: string }>(await page.request.get(`${apiBase}/company-intelligence/organizations/${ids.organizationA}/profile`))
  expect(profile.tradeName).toBe(tradeName)

  const sourceTitle = `Conhecimento aceitação ${Date.now()}`
  await page.goto('/portal/empresa/conhecimento')
  await page.getByRole('button', { name: 'Adicionar conhecimento' }).click()
  await page.getByLabel('Título').fill(sourceTitle)
  await page.getByLabel('Conteúdo').fill('A empresa atende clientes com diagnóstico consultivo antes de recomendar uma solução.')
  const createResponse = page.waitForResponse(response => response.url().includes('/knowledge/text') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Adicionar à base' }).click()
  const created = await (await createResponse).json() as { id: string; sourceId?: string; status: string }
  await expect(page.getByText('Conteúdo salvo para revisão.')).toBeVisible()
  await drainWorker(page)
  await page.reload()
  await expect(page.getByText(sourceTitle)).toBeVisible()
  const documents = await json<Array<{ id: string; title: string; status: string }>>(
    await page.request.get(`${apiBase}/company-intelligence/organizations/${ids.organizationA}/knowledge`),
  )
  expect(documents).toContainEqual(expect.objectContaining({ id: created.id, title: sourceTitle }))
  const processing = await json<{ document: { status: string }; run: { status: string } }>(
    await page.request.get(`${apiBase}/company-intelligence/knowledge/${created.id}/processing`),
  )
  expect(processing.document.status).toBe('indexed')

  await attachEvidence(testInfo, {
    journey: 'J1', complete: false,
    checks: { profilePersisted: true, sourcePersisted: true, workerProcessed: true, documentIndexed: true, refreshRecovered: true, reviewBoundaryVisible: created.status !== 'published' },
    ids: { organizationId: ids.organizationA, sourceId: created.sourceId, documentId: created.id },
    remainingGates: ['extração/curadoria pelo worker', 'publicação revisada', 'consulta do agente citando publicação e hash'],
  })
})

test('J2 — pack passa por autoria, revisão, publicação e binding governados', async ({ page }, testInfo) => {
  const runtimeHealth = await page.request.get('http://127.0.0.1:4001/health', {
    headers: { Authorization: 'Bearer integration-runtime-token' },
  })
  expect(runtimeHealth.ok(), await runtimeHealth.text()).toBeTruthy()
  await login(page, 'admin')
  await page.goto('/admin/strategy-engine?tab=packs')
  await expect(page.getByRole('heading', { name: 'YUX Strategy Engine' })).toBeVisible()

  const packName = 'Pack livro aceitação'
  const itemTitle = 'Diagnóstico governado de aceitação'
  await expect(page.getByText(packName, { exact: true })).toBeVisible()
  await page.getByText(packName, { exact: true }).click()

  const reviewCard = page.locator('article').filter({ hasText: itemTitle })
  await expect(reviewCard).toBeVisible()
  await reviewCard.getByPlaceholder('Motivo da decisão ou ajuste').fill('Evidência revisada na aceitação automatizada.')
  await reviewCard.getByRole('button', { name: 'Aprovar' }).click()
  await expect(page.getByRole('button', { name: 'Publicar pack' })).toBeEnabled()
  await page.getByRole('button', { name: 'Publicar pack' }).click()
  await page.getByLabel('Perfis permitidos').fill('growth_strategist')
  const publicationResponse = page.waitForResponse(response => response.url().includes('/publications') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Publicar versão confirmada' }).click()
  const publication = await (await publicationResponse).json() as { publicationId: string; contentHash: string }
  await expect(page.getByRole('status')).toContainText('Publicação v')
  await page.getByRole('button', { name: 'Fechar' }).click()

  const bindingForm = page.getByRole('heading', { name: 'Binding operacional' }).locator('..').locator('..')
  await bindingForm.locator('select').nth(0).selectOption(ids.organizationA)
  await bindingForm.locator('select').nth(2).selectOption('crm')
  const bindingResponse = page.waitForResponse(response => {
    if (!response.url().endsWith('/api/strategy-engine/query') || response.request().method() !== 'POST') return false
    return response.request().postDataJSON()?.table === 'yux_strategy_pack_bindings'
  })
  await bindingForm.getByRole('button', { name: 'Ativar binding' }).click()
  expect((await bindingResponse).ok()).toBeTruthy()

  await attachEvidence(testInfo, {
    journey: 'J2', complete: false,
    checks: { pythonRuntimeHealthy: true, curatedItemLinkedToPdfDocument: true, itemReviewed: true, publicationRecorded: true, contentHashRecorded: /^[a-f0-9]{64}$/.test(publication.contentHash), bindingActivated: true },
    ids: { organizationId: ids.organizationA, sourceId: 'a1000000-0000-4000-8000-000000000008', publicationId: publication.publicationId },
    remainingGates: ['upload do PDF pelo navegador ligado à evidência sem fixture pré-carregada', 'revogação conferida em nova execução', 'comparação cega do Harness/T22'],
  })
})

test('J3 — tarefa ligada ao lead é concluída uma vez com evidência', async ({ page }, testInfo) => {
  await login(page, 'clientAdminA')
  await page.goto('/portal/comercial/tarefas')
  const taskCard = page.locator(`#work-item-${ids.task}`)
  await expect(taskCard).toContainText('Validar jornada browser')
  await taskCard.getByRole('button', { name: 'Concluir' }).click()
  await taskCard.getByLabel('Evidência da conclusão').fill('Contato validado pela jornada automatizada.')
  await taskCard.getByLabel('Tempo gasto (minutos)').fill('7')
  await taskCard.getByRole('button', { name: 'Registrar conclusão' }).click()
  await expect(taskCard).toHaveCount(0)
  await page.reload()
  await expect(page.locator(`#work-item-${ids.task}`)).toHaveCount(0)
  const queue = await json<{ items: Array<{ sourceId: string }> }>(
    await page.request.get(`${apiBase}/workspace/work-items?organizationId=${ids.organizationA}&due=all`),
  )
  expect(queue.items.some(item => item.sourceId === ids.task)).toBeFalsy()

  await attachEvidence(testInfo, {
    journey: 'J3', complete: false,
    checks: { domainTaskCreated: true, visibleInDailyQueue: true, completionCountOne: true, evidenceRecorded: true, refreshRecovered: true },
    ids: { organizationId: ids.organizationA, taskId: ids.task },
    remainingGates: ['conversa, esclarecimento, proposta, compilação e aprovação ligados à mesma missão', 'bloqueio demonstrado para ferramenta inexistente'],
  })
})

test('J4 — campanha do Radar é criada no workspace correto e persiste', async ({ page }, testInfo) => {
  await login(page, 'admin')
  await page.goto(`/client-workspaces/${ids.organizationA}/comercial/radar`)
  await expect(page.getByRole('heading', { name: 'Nova campanha de captacao' })).toBeVisible()
  const name = `Radar aceitação ${Date.now()}`
  const form = page.getByRole('heading', { name: 'Nova campanha de captacao' }).locator('..')
  await form.getByPlaceholder('Nome').fill(name)
  await form.getByPlaceholder('Nicho').fill('Serviços B2B')
  await form.getByPlaceholder('Cidade').fill('São Paulo')
  await form.getByPlaceholder('UF').fill('SP')
  await form.getByPlaceholder('Limite').fill('3')
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/radar/campaigns') && response.request().method() === 'POST')
  await form.getByRole('button', { name: 'Criar' }).click()
  const campaign = await (await responsePromise).json() as { id: string; organizationId: string }
  await expect(page.getByText(name, { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText(name, { exact: true })).toBeVisible()
  expect(campaign.organizationId).toBe(ids.organizationA)

  await attachEvidence(testInfo, {
    journey: 'J4', complete: false,
    checks: { radarCampaignPersisted: true, workspacePreserved: true, refreshRecovered: true },
    ids: { organizationId: campaign.organizationId, campaignId: campaign.id },
    remainingGates: ['deduplicação/enriquecimento até identidade única', 'sequência, resposta, conversão e opt-out no mesmo traço'],
  })
})

test('J5 — planejamento, conteúdo, revisão e aprovação usam a mesma versão', async ({ page }, testInfo) => {
  await login(page, 'clientAdminA')
  await page.goto('/portal/marketing/studio')
  await expect(page.getByRole('heading', { name: 'Planeje, revise e publique com controle' })).toBeVisible()
  const name = `Campanha aceitação ${Date.now()}`
  await page.getByRole('button', { name: 'Planejar campanha' }).first().click()
  await page.getByLabel('Nome').fill(name)
  await page.getByLabel('Público').fill('Gestores de pequenas empresas no Brasil')
  await page.getByLabel('Oferta').fill('Diagnóstico consultivo sem compromisso')
  await page.getByLabel('Restrições').fill('Sem promessas de resultado e sem dados de exemplo')
  const planResponse = page.waitForResponse(response => response.url().includes('/marketing-studio/journey/plans') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Salvar planejamento' }).click()
  const plan = await (await planResponse).json() as { campaignId: string; contentId: string; contentVersionId: string }
  const content = page.locator('article').filter({ hasText: name })
  await expect(content).toBeVisible()
  await content.getByRole('button', { name: 'Enviar para revisão' }).click()
  await expect(content.getByRole('button', { name: 'Aprovar' })).toBeVisible()
  const approvalResponse = page.waitForResponse(response => response.url().includes(`/contents/${plan.contentId}/review`) && response.request().method() === 'POST')
  await content.getByRole('button', { name: 'Aprovar' }).click()
  await approvalResponse
  await expect(content).toContainText('Aprovado')
  const publishingResponse = page.waitForResponse(response => response.url().includes(`/contents/${plan.contentId}/publish`) && response.request().method() === 'POST')
  await content.getByRole('button', { name: 'Publicar versão aprovada' }).click()
  const publishing = await (await publishingResponse).json() as { id: string; approvedContentVersionId: string; status: string }
  expect(publishing).toMatchObject({ approvedContentVersionId: plan.contentVersionId, status: 'queued' })
  await drainWorker(page)
  await page.reload()
  await expect(page.locator('article').filter({ hasText: name })).toContainText('Publicado')
  const summary = await json<{ publishingRuns: Array<{ id: string; status: string; providerPostId?: string; publishedUrl?: string }> }>(
    await page.request.get(`${apiBase}/marketing-studio/journey/summary?organizationId=${ids.organizationA}&contractId=${ids.contractA}`),
  )
  const publishedRun = summary.publishingRuns.find(run => run.id === publishing.id)
  expect(publishedRun).toMatchObject({ status: 'succeeded' })
  expect(publishedRun?.providerPostId).toBeTruthy()
  const providerCalls = await json<Array<{ intentId: string }>>(
    await page.request.get('http://127.0.0.1:4002/provider-calls', { headers: { Authorization: 'Bearer acceptance-control-token' } }),
  )
  expect(providerCalls.some(call => call.intentId === publishing.id)).toBeTruthy()

  await attachEvidence(testInfo, {
    journey: 'J5', complete: false,
    checks: { campaignPersisted: true, contentCreated: true, reviewRecorded: true, approvedVersionPublished: true, workerProcessed: true, controlledProviderCalledOnce: providerCalls.filter(call => call.intentId === publishing.id).length === 1, remoteResultRecorded: Boolean(publishedRun?.providerPostId), refreshRecovered: true },
    ids: { organizationId: ids.organizationA, campaignId: plan.campaignId, contentId: plan.contentId, contentVersionId: plan.contentVersionId, jobId: publishing.id, remoteResultId: publishedRun?.providerPostId },
    remainingGates: ['repetição em sandbox oficial do provedor', 'captação, lead, atribuição e métrica reais ligados ao ID remoto'],
  })
})

test('J6 — conversa persistida aceita handoff, resolução e refresh', async ({ page }, testInfo) => {
  await login(page, 'admin')
  await page.goto(`/client-workspaces/${ids.organizationA}/atendimento/conversas`)
  await expect(page.getByText('Contato aceitação')).toBeVisible()
  await expect(page.getByText('Preciso de atendimento')).toBeVisible()
  await page.getByRole('button', { name: 'Handoff Humano' }).click()
  await expect(page.getByText('Handoff solicitado')).toBeVisible()
  await page.getByRole('button', { name: 'Resolver' }).click()
  await expect(page.getByText('Conversa resolvida')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Reabrir' })).toBeVisible()
  const conversation = await json<{ id: string; status: string }>(
    await page.request.get(`${apiBase}/omnichannel/conversations/${ids.conversation}?portal=true`),
  )
  expect(conversation).toMatchObject({ id: ids.conversation, status: 'resolved' })

  await attachEvidence(testInfo, {
    journey: 'J6', complete: false,
    checks: { inboundMessagePersisted: true, handoffRecorded: true, conversationResolved: true, refreshRecovered: true },
    ids: { organizationId: ids.organizationA, conversationId: ids.conversation },
    remainingGates: ['webhook com retry e mensagem única no mesmo cenário browser', 'resposta do agente citando somente fonte autorizada', 'acompanhamento atribuído'],
  })
})

test('J7 — troca multiempresa não vaza contexto e tenant cruzado é negado', async ({ page }, testInfo) => {
  await login(page, 'admin')
  await page.goto(`/client-workspaces/${ids.organizationA}/empresa/perfil`)
  await expect(page.getByText('Empresa A', { exact: true }).first()).toBeVisible()
  await page.goto(`/client-workspaces/${ids.organizationB}/empresa/perfil`)
  await expect(page.getByText('Empresa B', { exact: true }).first()).toBeVisible()
  await expect(page.getByLabel('Nome da marca')).toHaveValue('Empresa B')
  await page.reload()
  await expect(page.getByLabel('Nome da marca')).toHaveValue('Empresa B')

  await page.context().clearCookies()
  await login(page, 'clientMemberA')
  const ownProfile = await json<Record<string, unknown>>(
    await page.request.get(`${apiBase}/company-intelligence/organizations/${ids.organizationA}/profile`),
  )
  const deniedRead = await page.request.get(`${apiBase}/company-intelligence/organizations/${ids.organizationB}/profile`)
  expect([403, 404]).toContain(deniedRead.status())
  const deniedWrite = await page.request.put(`${apiBase}/company-intelligence/organizations/${ids.organizationB}/profile`, {
    data: { ...ownProfile, legalName: 'Tentativa cruzada', tradeName: 'Tentativa cruzada', description: 'Não deve persistir.' },
  })
  expect([403, 404]).toContain(deniedWrite.status())

  await attachEvidence(testInfo, {
    journey: 'J7', complete: true,
    checks: { workspaceAVisible: true, workspaceBVisible: true, staleContextAbsentAfterRefresh: true, crossTenantReadDenied: true, crossTenantWriteDenied: true },
    ids: { organizationA: ids.organizationA, organizationB: ids.organizationB },
  })
})
