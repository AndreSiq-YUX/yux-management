import { expect, test, type Page } from '@playwright/test'

const control = 'http://127.0.0.1:4191'
const controlHeaders = { authorization: 'Bearer agent-pilot-browser-fixture' }

test('compares pilot prompts, imports a CRM draft and prepares a scoped mission', async ({ page, request }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort())
  const response = await request.get(`${control}/fixture`, { headers: controlHeaders })
  expect(response.ok()).toBe(true)
  const data = await response.json()
  const tick = async () => {
    const result = await request.post(`${control}/worker-tick`, { headers: controlHeaders })
    expect(result.ok(), await result.text()).toBe(true)
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
    await page.getByRole('button', { name: 'Aprovar recomendação e criar rascunho' }).click()
    await expect(page.getByRole('link', { name: 'Revisar rascunho criado' })).toBeVisible()
  })

  await test.step('inspect the mission strategy and compare an intake adjustment', async () => {
    const instruction = 'Confirme a retirada antes de propor o briefing.'
    await page.goto('/admin/strategy-engine?tab=agent-prompts')
    await page.getByLabel('Fluxo', { exact: true }).selectOption('mission-intake')
    await page.getByLabel('Subconta', { exact: true }).selectOption(data.missionOrg)
    await page.getByLabel('Contrato', { exact: true }).selectOption(data.missionContract)
    await page.getByLabel('Público', { exact: true }).selectOption('internal_operator')
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
  })

  const revision = `Ajuste para ${data.revisedAudience}. Preserve a oferta de massas congeladas.`
  const plannedMissionId = await test.step('confirm a revised briefing in the portal workspace and inspect the plan', async () => {
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
    return missionId as string
  })

  const evidence = await request.get(`${control}/evidence`, { headers: controlHeaders })
  expect(evidence.ok()).toBe(true)
  const verified = await evidence.json()
  expect(verified).toEqual({
    drafts: [{ status: 'draft', final_value: '1500.00', traced: true }],
    presalesTurns: [data.budget, recommendation], missionTurns: [data.objective, revision],
    plans: [{ mission_id: plannedMissionId, status: 'pending_approval', steps: expect.any(Number), runs: 0 }], providerCalls: 0,
  })
  expect(verified.plans[0].steps).toBeGreaterThan(0)
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

async function postThroughUi(page: Page, path: string, button: string) {
  const response = page.waitForResponse(result => result.request().method() === 'POST' && new URL(result.url()).pathname === path)
  await page.getByRole('button', { name: button, exact: true }).click()
  const result = await response
  expect(result.status(), await result.text()).toBe(202)
  return result
}
