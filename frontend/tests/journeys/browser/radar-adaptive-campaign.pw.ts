import path from 'node:path'
import {test,expect} from '@playwright/test'
const routeId=process.env.YUX_RADAR_RESEARCH_QA_ROUTE_ID
test.use({baseURL:'http://127.0.0.1:4174',channel:process.env.YUX_RADAR_QA_BROWSER_CHANNEL})
test.skip(!routeId,'Requires isolated Decisions/Agent fixture; no external provider calls.')
for(const viewport of [{width:1280,height:940},{width:430,height:920}])test(`Agent risk, budgets, main/fallback and no-consumption validation (${viewport.width}px)`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
 await page.setViewportSize(viewport)
 await page.goto('/auth/login');await page.getByRole('textbox',{name:'E-mail',exact:true}).fill('yux-admin@integration.test');await page.getByLabel('Senha',{exact:true}).fill('integration-password');await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page).not.toHaveURL(/\/auth\/login/)
 await page.goto('/admin/ai');await expect(page).toHaveTitle(/YUX/)
 await page.getByRole('button',{name:/Radar — investigação aprofundada/}).click()
 const form=page.locator('form').filter({has:page.getByRole('heading',{name:'Radar — investigação aprofundada',exact:true})})
 await form.getByLabel('Aceito orçamento estimado, sem teto financeiro garantido pelo provedor').uncheck()
 await expect(form.getByLabel('Permitir investigação seletiva nesta rota')).toBeDisabled()
 await form.getByLabel('Aceito orçamento estimado, sem teto financeiro garantido pelo provedor').check()
 await form.getByLabel('Permitir investigação seletiva nesta rota').check()
 await form.getByLabel('Modelo principal',{exact:true}).fill('fixture/research')
 await form.getByLabel('Estimativa por tentativa de investigação (USD)').fill('0.01')
 await form.getByLabel('Orçamento estimado por investigação (USD)').fill('0.02')
 await form.getByLabel('Orçamento estimado do Agent por campanha (USD)').fill('1')
 await form.getByLabel('Máximo de tentativas por investigação').fill('2')
 await form.getByRole('button',{name:'Salvar rota',exact:true}).click();await expect(form).toContainText('A configuração vale na próxima execução.')
 await page.reload();await page.getByRole('button',{name:/Radar — investigação aprofundada/}).click()
 await expect(form.getByLabel('Modelo do fallback 1',{exact:true})).toHaveValue('fixture/research-reserve')
 await expect(form.getByLabel('Orçamento estimado do Agent por campanha (USD)')).toHaveValue('1')
 await form.getByRole('button',{name:'Conferir configuração (sem consumo)',exact:true}).click()
 await expect(form).toContainText('sem chamada paga')
 const bounds=await form.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(viewport.width+1)
 await expect(page.locator('vite-error-overlay')).toHaveCount(0)
 if(process.env.YUX_RADAR_QA_ARTIFACTS)await page.screenshot({path:path.join(process.env.YUX_RADAR_QA_ARTIFACTS,`agent-${viewport.width}.png`)})
 expect(errors).toEqual([])
})
for(const email of ['yux-operator@integration.test','admin-a@integration.test','member-a@integration.test'])test(`technical Agent/source API hidden from ${email}`,async({page})=>{
 await page.goto('/auth/login');await page.getByRole('textbox',{name:'E-mail',exact:true}).fill(email);await page.getByLabel('Senha',{exact:true}).fill('integration-password');await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page).not.toHaveURL(/\/auth\/login/)
 for(const [method,url]of [['get','http://127.0.0.1:4182/api/radar/admin/discovery-policy'],['post',`http://127.0.0.1:4182/api/platform/admin/llm-routes/${routeId}/test`]] as const){
  const response=await page.request[method](url,{data:{}});expect(response.status()).toBe(403);expect(await response.text()).not.toMatch(/perplexity|fixture\/|estimatedUsd|budgetUsd|openrouter/i)
 }
})
