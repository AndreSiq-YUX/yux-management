import {test,expect} from '@playwright/test'
// Fresh fixture: backend/tests/journeys/start-radar-quality-server.ts.
// Opt-in, synthetic data, loopback only; never use production.
const campaignId=process.env.YUX_RADAR_QUALITY_QA_CAMPAIGN_ID
const baseURL=process.env.YUX_RADAR_QA_BASE_URL??'http://127.0.0.1:4174'
if(!['127.0.0.1','localhost'].includes(new URL(baseURL).hostname))throw Error('local_quality_qa_required')
test.use({baseURL,channel:process.env.YUX_RADAR_QA_BROWSER_CHANNEL})
test.skip(!campaignId,'Requires a fresh isolated quality fixture.')
for(const viewport of [{width:1280,height:900},{width:430,height:920}])test(`quality queues and manual review (${viewport.width}px)`,async({page})=>{
  await page.setViewportSize(viewport)
  const paidRequests:string[]=[],errors:string[]=[]
  page.on('pageerror',error=>errors.push(error.message))
  page.on('request',request=>{if(request.method()==='POST'&&/enrich-brave|\/research$|search-web|send-message/.test(new URL(request.url()).pathname))paidRequests.push(request.url())})
  await page.goto('/auth/login')
  await page.getByLabel('Email',{exact:true}).fill('yux-admin@integration.test')
  await page.getByLabel('Senha',{exact:true}).fill('integration-password')
  await page.getByRole('button',{name:'Entrar',exact:true}).click()
  await expect(page).not.toHaveURL(/\/auth\/login/)
  await page.goto(`/client-workspaces/10000000-0000-4000-8000-000000000001/comercial/radar/${campaignId}`)
  await page.getByLabel('Filtrar por próxima ação').selectOption('identity_pending')
  await expect(page.getByRole('row').filter({hasText:'Empresa Beta — referência externa'})).toContainText('Site não encontrado nas fontes consultadas')
  await page.getByLabel('Filtrar por próxima ação').selectOption('all')
  const row=page.getByRole('row').filter({hasText:'Empresa Alfa — contatos úteis'})
  await row.getByRole('button',{name:'Ver detalhes',exact:true}).click()
  const summary=page.getByRole('region',{name:'Resumo de Empresa Alfa — contatos úteis'})
  await expect(summary).toContainText('Contato útil encontrado')
  await expect(summary).toContainText('2 evidências')
  const box=await summary.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(viewport.width)
  await summary.getByRole('button',{name:'Ver detalhes completos'}).click()
  await expect(page.getByRole('heading',{name:'Detalhes da empresa',exact:true})).toBeFocused()
  await page.getByText('Conferência da equipe e retorno do contato manual',{exact:true}).click()
  await page.getByLabel('Observação da conferência').fill('QA local, sem contato externo.')
  await page.getByRole('button',{name:'Registrar conferência',exact:true}).click()
  await expect(page.getByRole('status').filter({hasText:'Conferência registrada'})).toBeVisible()
  await page.getByRole('button',{name:'Fechar detalhes',exact:true}).click()
  await expect(summary.getByRole('button',{name:'Ver detalhes completos'})).toBeFocused()
  expect(paidRequests).toEqual([]);expect(errors).toEqual([])
})
