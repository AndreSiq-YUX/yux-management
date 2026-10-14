import path from 'node:path'
import {test,expect} from '@playwright/test'

const campaignId=process.env.YUX_RADAR_QA_CAMPAIGN_ID
const baseURL=process.env.YUX_RADAR_QA_BASE_URL??'http://127.0.0.1:4173'
const artifacts=process.env.YUX_RADAR_QA_ARTIFACTS
test.use({baseURL,channel:process.env.YUX_RADAR_QA_BROWSER_CHANNEL})
test.skip(!campaignId,'Requires the isolated Radar QA fixture, not production.')

for(const viewport of [{width:1280,height:900},{width:430,height:920}])test(`expands public-presence summary and focuses full details (${viewport.width}px)`,async({page})=>{
  await page.setViewportSize(viewport)
  const errors:string[]=[],paidRequests:string[]=[]
  page.on('pageerror',error=>errors.push(error.message))
  page.on('request',request=>{if(request.method()==='POST'&&/enrich-brave|\/research$|search-web/.test(new URL(request.url()).pathname))paidRequests.push(request.url())})
  await page.goto('/auth/login')
  await page.getByLabel('Email',{exact:true}).fill('yux-admin@integration.test')
  await page.getByLabel('Senha',{exact:true}).fill('integration-password')
  await page.getByRole('button',{name:'Entrar',exact:true}).click()
  await expect(page).not.toHaveURL(/\/auth\/login/)
  await page.goto(`/client-workspaces/10000000-0000-4000-8000-000000000001/comercial/radar/${campaignId}`)
  await expect(page.getByRole('heading',{name:'Empresas encontradas',exact:true})).toBeVisible()
  await expect(page.locator('tbody')).toContainText('https://alfa.example/')
  const row=page.getByRole('row').filter({hasText:'Empresa Alfa — presença pendente'})
  await row.getByRole('button',{name:'Ver detalhes',exact:true}).click()
  const summary=page.getByRole('region',{name:'Resumo de Empresa Alfa — presença pendente'})
  await expect(summary).toBeVisible()
  await expect(summary).toContainText('Site encontrado — confirmação pendente')
  await expect(summary.getByRole('link',{name:'Abrir formulário público'})).toHaveAttribute('href','https://alfa.example/fornecedor/')
  await expect(summary).toContainText('contato@alfa.example')
  const box=await summary.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x+box!.width).toBeLessThanOrEqual(viewport.width)
  await summary.scrollIntoViewIfNeeded()
  if(artifacts)await page.screenshot({path:path.join(artifacts,`resumo-${viewport.width}.png`),fullPage:false})
  await summary.getByRole('button',{name:'Ver detalhes completos'}).click()
  await expect(page.getByRole('heading',{name:'Detalhes da empresa',exact:true})).toBeFocused()
  await expect(page.getByRole('heading',{name:'Sinais de presença pública encontrados',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Fechar detalhes',exact:true}).click()
  await expect(summary.getByRole('button',{name:'Ver detalhes completos'})).toBeFocused()
  await page.getByRole('button',{name:'Ocultar resumo',exact:true}).click()
  await expect(summary).toHaveCount(0)
  expect(paidRequests).toEqual([])
  expect(errors).toEqual([])
})
