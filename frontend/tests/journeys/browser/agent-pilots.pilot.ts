import { expect, test, type Page } from '@playwright/test'

const control = 'http://127.0.0.1:4191'
const controlHeaders = { authorization: 'Bearer agent-pilot-browser-fixture' }

test('compares pilot prompts, imports a CRM draft and executes a scoped preparation after approval', async ({ page, request }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort())
  const response = await request.get(`${control}/fixture`, { headers: controlHeaders })
  expect(response.ok()).toBe(true)
  const data = await response.json()
  const tick = async () => {
    const result = await request.post(`${control}/worker-tick`, { headers: controlHeaders })
    expect(result.ok(), await result.text()).toBe(true)
  }
  const openRepresentationIntake = async () => {
    await page.goto('/admin/strategy-engine?tab=agent-prompts')
    await page.getByLabel('Fluxo', { exact: true }).selectOption('mission-intake')
    await page.getByLabel('Subconta', { exact: true }).selectOption(data.missionOrg)
    await page.getByLabel('Contrato', { exact: true }).selectOption(data.missionContract)
    await page.getByLabel('Público', { exact: true }).selectOption('internal_operator')
  }

  await page.goto('/auth/login')
  await page.locator('#email').fill('yux-admin@integration.test')
  await page.locator('#password').fill('integration-password')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).not.toHaveURL(/\/auth\/login/)

  await test.step('compare the strategist baseline and candidate', async () => {
    const instruction = 'Peça o critério que decide entre aquisição e acompanhamento.'
    await page.goto('/admin/strategy-engine?tab=agent-prompts')
    await page.getByLabel('Subconta', { exact: true }).selectOption(data.presalesOrg)
    await page.getByLabel('Contrato', { exact: true }).selectOption(data.presalesContract)
    await page.getByLabel('Tarefa', { exact: true }).selectOption('proposal')
    await page.getByLabel('Mensagem de teste').fill(data.budget)
    await page.getByLabel('Instrução candidata (opcional)').fill(instruction)
    const preview = await simulate(page)
    await expect(page.getByRole('heading', { name: /Configuração vigente|Referência do piloto/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Configuração candidata' })).toBeVisible()
    expectAdjustment(preview, instruction)
  })

  const recommendation = 'Compare os pacotes elegíveis e recomende uma oferta.'
  await test.step('retain earlier budget and create the opportunity draft', async () => {
    await page.goto('/admin/strategy-engine')
    await page.getByRole('button', { name: 'Nova analise estrategica', exact: true }).click()
    await page.getByLabel('Cliente/prospect').selectOption(data.presalesOrg)
    await page.getByRole('button', { name: 'Proposta', exact: true }).click()
    await page.getByRole('combobox', { name: 'Contrato', exact: true }).selectOption(data.presalesContract)
    await page.getByRole('combobox', { name: 'Oportunidade do CRM', exact: true }).selectOption(data.leadId)
    const send = async (message: string) => {
      await page.getByPlaceholder('Pergunte ao estrategista YUX...').fill(message)
      await postThroughUi(page, '/api/functions/run-strategy-admin-chat', 'Enviar')
      await tick()
    }
    await send(data.budget)
    await expect(page.getByText(/Aquisição ou acompanhamento\?/)).toBeVisible()
    await send(recommendation)
    await expect(page.getByText('Priorize o acompanhamento das oportunidades dentro do orçamento.')).toBeVisible()

    await page.goto(`/client-workspaces/${data.presalesOrg}/comercial/leads`)
    await page.getByText(data.names.lead, { exact: true }).click()
    await page.getByRole('tab', { name: 'Comercial', exact: true }).click()
    const imported = await postThroughUi(page, /^\/api\/proposals\/strategy-recommendations\/[a-f0-9-]+\/import$/,
      'Aprovar recomendação e criar rascunho', 200)
    const { id: draftId } = await imported.json()
    await page.getByRole('link', { name: 'Revisar rascunho criado' }).click()
    await expect(page).toHaveURL(`/client-workspaces/${data.presalesOrg}/comercial/propostas?proposal=${draftId}`)
    await expect(page.getByRole('button', { name: /Outra proposta no mesmo workspace/ }).first()).toBeVisible()
    await expect(page.getByPlaceholder('Escopo')).toHaveValue('Recuperar oportunidades existentes')
    await expect(page.getByRole('spinbutton')).toHaveValue('1500')
    await expect(page.getByText('Status: draft', { exact: true })).toBeVisible()

    const otherQueue = page.waitForResponse(response => {
      const url = new URL(response.url())
      return response.request().method() === 'GET' && url.pathname === '/api/proposals'
        && url.searchParams.get('organizationId') === data.missionOrg
    })
    await page.goto(`/client-workspaces/${data.missionOrg}/comercial/propostas?proposal=${draftId}`)
    const otherProposals = await otherQueue
    expect(otherProposals.ok(), await otherProposals.text()).toBe(true)
    expect(await otherProposals.json()).not.toContainEqual(expect.objectContaining({ id: draftId }))
    await expect(page.getByText('Selecione ou crie uma proposta.', { exact: true })).toBeVisible()
    await expect(page.getByPlaceholder('Escopo')).toHaveCount(0)
  })

  const instruction = 'Confirme a retirada antes de propor o briefing.'
  const publication = 'Publicação sintética para ensaiar a reversão.'
  await test.step('inspect the mission strategy, compare and publish the intake adjustment', async () => {
    await openRepresentationIntake()
    await expect(page.getByText('Piloto habilitado para a seleção atual.')).toBeVisible()
    await page.getByLabel('Público', { exact: true }).selectOption('client_user')
    await expect(page.getByText('Piloto desativado para a seleção atual.')).toBeVisible()
    await page.getByLabel('Público', { exact: true }).selectOption('internal_operator')
    await page.getByLabel('Contrato', { exact: true }).selectOption('')
    await expect(page.getByText('Piloto desativado para a seleção atual.')).toBeVisible()
    await page.getByLabel('Contrato', { exact: true }).selectOption(data.missionContract)
    await expect(page.getByText('Piloto habilitado para a seleção atual.')).toBeVisible()
    await page.getByLabel('Mensagem de teste').fill(data.objective)
    await simulate(page)
    await page.getByLabel('Etapa da instrução').selectOption('synthesizer')
    await page.getByLabel('Instrução candidata (opcional)').fill(instruction)
    const preview = await simulate(page)
    await expect(page.getByRole('heading', { name: 'Configuração candidata' })).toBeVisible()
    expectAdjustment(preview, instruction)
    const sourceStage = page.locator('details').filter({ hasText: data.sourceTitle }).first()
    await sourceStage.locator('summary').click()
    await expect(sourceStage.getByRole('heading', { name: 'Fontes recuperadas' })).toBeVisible()
    await expect(sourceStage.getByText(data.sourceTitle, { exact: false }).first()).toBeVisible()
    expect(JSON.stringify(preview)).not.toContain('Acompanhamento comercial')
    await page.getByLabel('Justificativa', { exact: true }).fill(publication)
    const published = await postThroughUi(page, '/api/strategy-engine/agent-prompts/versions', 'Publicar instrução para esta subconta', 200)
    expect(await published.json()).toMatchObject({ version: 1, instructions: { synthesizer: instruction } })
  })

  const revision = `Ajuste para ${data.revisedAudience}. Preserve a oferta de massas congeladas.`
  const { missionId: plannedMissionId, conversationId } = await test.step('confirm a revised briefing in the portal workspace and inspect the plan', async () => {
    await page.goto(`/client-workspaces/${data.missionOrg}/missoes`)
    await page.getByRole('button', { name: 'Conversar com o agente' }).click()
    const composer = page.getByRole('textbox', { name: 'Mensagem para o agente de missões' })
    await composer.fill(data.objective)
    const create = await postThroughUi(page, '/api/action-engine/mission-conversations', 'Enviar mensagem')
    const { conversation } = await create.json()
    await tick()
    await expect(page.getByText('Confira a preparação para cozinhas industriais.')).toBeVisible()
    await composer.fill(revision)
    await postThroughUi(page, `/api/action-engine/mission-conversations/${conversation.id}/messages`, 'Enviar mensagem')
    await tick()
    await expect(page.getByText('Ajustei o público e preservei a oferta de massas congeladas.')).toBeVisible()
    const confirmed = await postThroughUi(page, `/api/action-engine/mission-conversations/${conversation.id}/confirm`, 'Confirmar e preparar plano')
    await tick()
    await expect(page.getByText('Plano aguardando decisão', { exact: true }).first()).toBeVisible()
    await expect(page.getByText(/[1-9]\d* fonte\(s\) verificadas sustentam este plano\./)).toBeVisible()
    const { missionId } = await confirmed.json()
    expect(missionId).toMatch(/^[a-f0-9-]{36}$/)

    const anotherAccount = await page.request.get(`http://127.0.0.1:4188/api/action-engine/mission-conversations/${conversation.id}?organizationId=${data.presalesOrg}`)
    expect(anotherAccount.status()).toBe(404)
    return { missionId: missionId as string, conversationId: conversation.id as string }
  })

  await test.step('review actual runtime measurements in the admin', async () => {
    await openRepresentationIntake()
    await page.getByLabel('Conversa da missão', { exact: true }).selectOption(conversationId)
    const turns = await readUsageThroughUi(page, 'mission-turn-history', 'Consultar turnos')
    expect(turns.turns).toHaveLength(2)
    for (const turn of turns.turns) {
      expect(turn.provider).toMatchObject({ attempts: 2, totalUsd: 0.003, inputTokens: 48, outputTokens: 25, reasoningTokens: 3 })
      expect(turn.credits).toMatchObject({ state: 'settled', reserved: 1, charged: 1, released: 0 })
    }
    const conversationHistory = page.getByRole('region', { name: 'Consumo das conversas de missão' })
    await expect(conversationHistory.getByRole('heading', { name: 'Créditos comerciais' })).toHaveCount(2)

    await page.getByLabel('Fluxo', { exact: true }).selectOption('mission-supervisor')
    await page.getByLabel('Missão', { exact: true }).selectOption(plannedMissionId)
    const history = await readUsageThroughUi(page, 'planning-history', 'Consultar execuções')
    const stages = ['planner', 'funnel_nurture.crm_architect', 'funnel_nurture.copywriter',
      'funnel_nurture.automation_architect', 'funnel_nurture.brand_compliance_guardian']
    expect(history.executions).toEqual([expect.objectContaining({
      state: 'completed', totalUsd: 0.01, reconciledBrl: null,
      stages: stages.map(name => ({ name, attempts: 1, inputTokens: 40, outputTokens: 25, reasoningTokens: 3, confirmedUsd: 0.002 })),
    })])
    await page.getByText('Consumo medido por etapa', { exact: true }).click()
    await expect(page.getByRole('rowheader', { name: 'Revisão de marca da nutrição' })).toBeVisible()
  })

  const evidence = await request.get(`${control}/evidence`, { headers: controlHeaders })
  expect(evidence.ok()).toBe(true)
  const verified = await evidence.json()
  expect(verified).toEqual({
    drafts: [{ status: 'draft', final_value: '1500.00', traced: true }],
    presalesTurns: [data.budget, recommendation], missionTurns: [data.objective, revision],
    plans: [{ mission_id: plannedMissionId, status: 'pending_approval', steps: 8, runs: 0 }], providerCalls: 0,
  })

  await test.step('approve the scoped plan and inspect the saved drafts', async () => {
    const readExecution = async () => {
      const execution = await request.get(`${control}/execution`, { headers: controlHeaders })
      expect(execution.ok(), await execution.text()).toBe(true)
      return execution.json()
    }
    const noEffects = { enrollments: 0, automations: 0, sends: 0, crm_status: 'draft' }
    expect(await readExecution()).toEqual({ missions: [{
      id: plannedMissionId, status: 'pending_plan_approval', completed_steps: 0,
      funnels: [], emails: [], active_sequences: [], sequence_versions: [], ...noEffects,
    }], providerCalls: 0 })

    await page.goto(`/client-workspaces/${data.missionOrg}/missoes/conversas/${conversationId}`)
    await expect(page.getByText('Nenhum contato existente nesta etapa', { exact: true })).toBeVisible()
    const approval = await postThroughUi(page, /^\/api\/action-engine\/plans\/[a-f0-9-]+\/submit$/,
      'Li os impactos e aprovo este plano', 200)
    expect(await approval.json()).toMatchObject({ id: plannedMissionId, status: 'active' })
    await expect(page.getByText(/Plano aprovado\. Vou salvar o funil/)).toBeVisible()

    await tick()
    await expect(page.getByText(/Os rascunhos foram criados: um funil de CRM, três e-mails e uma sequência desativada/)).toBeVisible()
    await page.getByRole('link', { name: 'Revisar rascunhos' }).click()
    await expect(page.getByRole('heading', { name: 'Entregáveis da missão' })).toBeVisible()
    await expect(page.getByText('Funil · Rascunho', { exact: true })).toHaveCount(1)
    await expect(page.getByText('E-mail · Rascunho', { exact: true })).toHaveCount(3)
    await expect(page.getByText('Sequência · Rascunho', { exact: true })).toHaveCount(1)

    const replay = await page.request.post(approval.url(), { data: approval.request().postDataJSON() })
    expect(replay.ok(), await replay.text()).toBe(true)
    await tick()
    const conversation = await page.request.get(`http://127.0.0.1:4188/api/action-engine/mission-conversations/${conversationId}?organizationId=${data.missionOrg}`)
    expect(conversation.ok(), await conversation.text()).toBe(true)
    const completed = await conversation.json()
    expect(completed.status).toBe('converted')
    expect(completed.messages.filter((message: { structuredPayload?: { crmPreparation?: string } }) =>
      message.structuredPayload?.crmPreparation === 'completed')).toHaveLength(1)
    expect(await readExecution()).toEqual({ missions: [{
      id: plannedMissionId, status: 'succeeded', completed_steps: 8, funnels: ['draft'],
      emails: ['draft', 'draft', 'draft'], active_sequences: [false], sequence_versions: ['draft'], ...noEffects,
    }], providerCalls: 0 })
  })

  await test.step('restore the inherited instructions and preserve the mission outputs and history', async () => {
    const delivered = page.url()
    const reversal = 'Reverter o ajuste sintético após a revisão dos rascunhos.'
    await openRepresentationIntake()
    await page.getByLabel('Mensagem de teste').fill(data.objective)
    const active = await simulate(page)
    expect(JSON.stringify(active.baseline)).toContain(instruction)
    await page.getByLabel('Versão deste fluxo a restaurar').selectOption('0')
    await page.getByLabel('Justificativa', { exact: true }).fill(reversal)
    const restored = await postThroughUi(page, '/api/strategy-engine/agent-prompts/versions', 'Restaurar versão', 200)
    expect(await restored.json()).toMatchObject({ version: 2, instructions: {}, restored_from_version: 0 })
    await expect(page.getByText(/Configuração herdada selecionada\./)).toBeVisible()
    const inherited = await simulate(page)
    expect(JSON.stringify(inherited.baseline)).not.toContain(instruction)
    await page.getByText('Histórico de publicação', { exact: true }).click()
    await expect(page.getByText(publication, { exact: true })).toBeVisible()
    await expect(page.getByText(reversal, { exact: true })).toBeVisible()

    await page.goto(delivered)
    await expect(page.getByRole('heading', { name: 'Entregáveis da missão' })).toBeVisible()
    await expect(page.getByText('Funil · Rascunho', { exact: true })).toHaveCount(1)
    await expect(page.getByText('E-mail · Rascunho', { exact: true })).toHaveCount(3)
    await expect(page.getByText('Sequência · Rascunho', { exact: true })).toHaveCount(1)
  })

  await test.step('plan the agency mission using only its own offer and available actions', async () => {
    await page.goto(`/client-workspaces/${data.presalesOrg}/missoes`)
    await page.getByRole('button', { name: 'Conversar com o agente' }).click()
    await page.getByRole('textbox', { name: 'Mensagem para o agente de missões' }).fill(data.agencyObjective)
    const create = await postThroughUi(page, '/api/action-engine/mission-conversations', 'Enviar mensagem')
    const { conversation } = await create.json()
    await tick()
    await expect(page.getByText('Posso preparar a captação com a auditoria de aquisição. O WhatsApp está sem conexão nesta conta.')).toBeVisible()

    const conversationPath = `http://127.0.0.1:4188/api/action-engine/mission-conversations/${conversation.id}`
    const scoped = await page.request.get(`${conversationPath}?organizationId=${data.presalesOrg}`)
    expect(scoped.ok(), await scoped.text()).toBe(true)
    const conversationBody = await scoped.text()
    expect(conversationBody).toContain(data.agencySourceTitle)
    expect(conversationBody).not.toContain(data.sourceTitle)
    const foreign = await page.request.get(`${conversationPath}?organizationId=${data.missionOrg}`)
    expect(foreign.status()).toBe(404)

    const confirmed = await postThroughUi(page, `/api/action-engine/mission-conversations/${conversation.id}/confirm`, 'Confirmar e preparar plano')
    const { missionId } = await confirmed.json()
    await tick()
    await expect(page.getByText('Plano aguardando decisão', { exact: true }).first()).toBeVisible()

    const missionPath = `http://127.0.0.1:4188/api/action-engine/missions/${missionId}`
    const plans = await page.request.get(`${missionPath}/plans?organizationId=${data.presalesOrg}`)
    expect(plans.ok(), await plans.text()).toBe(true)
    const planList = await plans.json()
    expect(planList).toEqual([expect.objectContaining({
      status: 'pending_approval', parameters: expect.objectContaining({ offer: 'Auditoria de aquisição' }),
    })])
    const details = await page.request.get(`http://127.0.0.1:4188/api/action-engine/plans/${planList[0].id}?organizationId=${data.presalesOrg}`)
    expect(details.ok(), await details.text()).toBe(true)
    const plan = await details.json()
    expect(plan.proposedPayload).toMatchObject({ plan: { actionPack: { key: 'crm_preparation' } } })
    expect(plan.steps.map((step: { capabilityKey: string }) => step.capabilityKey)).toEqual([
      'system.readiness.check', 'crm.pipeline.inspect', 'crm.pipeline.simulate', 'crm.pipeline.create_draft',
      'email.template.create_draft', 'email.template.create_draft', 'email.template.create_draft', 'crm.sequence.create_draft',
    ])
    const actions = await page.request.get(`${missionPath}/actions?organizationId=${data.presalesOrg}`)
    expect(actions.ok(), await actions.text()).toBe(true)
    expect(await actions.json()).toEqual([])
    const otherPlans = await page.request.get(`${missionPath}/plans?organizationId=${data.missionOrg}`)
    expect(otherPlans.ok(), await otherPlans.text()).toBe(true)
    expect(await otherPlans.json()).toEqual([])

    const evidence = await request.get(`${control}/evidence`, { headers: controlHeaders })
    expect(evidence.ok(), await evidence.text()).toBe(true)
    expect(await evidence.json()).toMatchObject({ providerCalls: 0 })
  })
})

type PromptRequest = { stage: string; fingerprint: string; request: { messages: Array<{ role: string; content: string }> } }
type PromptPreview = { baseline: { requests: PromptRequest[] }; candidate?: { requests: PromptRequest[] } }

function expectAdjustment(preview: PromptPreview, instruction: string) {
  const systemIncludesAdjustment = (request: PromptRequest) => request.request.messages.some(message => message.role === 'system' && message.content.includes(instruction))
  expect(preview.baseline.requests.some(systemIncludesAdjustment)).toBe(false)
  const candidate = preview.candidate?.requests.find(systemIncludesAdjustment)
  expect(candidate).toBeDefined()
  const baseline = preview.baseline.requests.find(request => request.stage === candidate?.stage)
  expect(baseline).toBeDefined()
  expect(candidate?.fingerprint).not.toBe(baseline?.fingerprint)
}

async function simulate(page: Page): Promise<PromptPreview> {
  const response = page.waitForResponse(result => result.request().method() === 'POST' && new URL(result.url()).pathname === '/api/strategy-engine/agent-prompts/preview')
  await page.getByRole('button', { name: 'Simular sem custo' }).click()
  const result = await response
  expect(result.ok(), await result.text()).toBe(true)
  return result.json()
}

async function postThroughUi(page: Page, path: string | RegExp, button: string, status = 202) {
  const response = page.waitForResponse(result => {
    const pathname = new URL(result.url()).pathname
    return result.request().method() === 'POST' && (typeof path === 'string' ? pathname === path : path.test(pathname))
  })
  await page.getByRole('button', { name: button, exact: true }).click()
  const result = await response
  expect(result.status(), await result.text()).toBe(status)
  return result
}

async function readUsageThroughUi(page: Page, resource: string, button: string) {
  const response = page.waitForResponse(result => result.request().method() === 'GET'
    && new URL(result.url()).pathname === `/api/strategy-engine/agent-prompts/${resource}`)
  await page.getByRole('button', { name: button, exact: true }).click()
  const result = await response
  expect(result.ok(), await result.text()).toBe(true)
  return result.json()
}
