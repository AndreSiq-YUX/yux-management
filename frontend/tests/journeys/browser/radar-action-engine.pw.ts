import path from 'node:path'
import { expect,test } from '@playwright/test'
const enabled=process.env.YUX_RADAR_ACTION_QA==='true'
test.skip(!enabled,'Requires the isolated assisted-flow fixture, with all paid providers disabled.')
test.use({baseURL:'http://127.0.0.1:4178',channel:'chrome'})

for(const viewport of [{width:1280,height:940},{width:430,height:920}])test(`Radar assisted briefing persists in its own workspace (${viewport.width}px)`,async({page})=>{
 const errors:string[]=[]
 let authenticated=false
 const consoleMessages:Array<{level:string;text:string}>=[]
 page.on('pageerror',error=>errors.push(error.message))
 page.on('console',message=>{if(['error','warning'].includes(message.type()))consoleMessages.push({level:message.type(),text:message.text()});if(message.type()==='error'&&!(!authenticated&&message.text().includes('401 (Unauthorized)')))errors.push(message.text())})
 await page.setViewportSize(viewport)
 await page.goto('/auth/login')
 await page.getByRole('textbox',{name:'E-mail',exact:true}).fill('yux-admin@integration.test')
 await page.getByLabel('Senha',{exact:true}).fill('integration-password')
 await page.getByRole('button',{name:'Entrar',exact:true}).click()
 await expect(page).not.toHaveURL(/\/auth\/login/)
 authenticated=true
 await page.goto('/client-workspaces/10000000-0000-4000-8000-000000000001/missoes')
 await expect(page).toHaveTitle(/YUX/i)
 await expect(page.getByRole('heading',{name:'Missões',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Criar missão',exact:true}).first().click()
 await page.getByRole('button',{name:'Pesquisar empresas no Radar',exact:true}).click()
 const name=`Pesquisa assistida navegador ${viewport.width} ${Date.now()}`
 await page.getByLabel('Nome da campanha',{exact:true}).fill(name)
 await page.getByLabel('Empresas que deseja encontrar',{exact:true}).fill('Indústrias de alimentos')
 await page.getByLabel('Estados (UF, separados por vírgula)',{exact:true}).fill('PR')
 await page.getByLabel('Oferta ou finalidade',{exact:true}).fill('Consultoria comercial')
 await page.getByLabel('Quantidade de empresas',{exact:true}).fill('10')
 await expect(page.getByText('Salvar a campanha não inicia pesquisa. O pedido de pesquisa exige aprovação.')).toBeVisible()
 if(process.env.YUX_RADAR_QA_ARTIFACTS)await page.screenshot({path:path.join(process.env.YUX_RADAR_QA_ARTIFACTS,`radar-brief-${viewport.width}.png`)})
 await page.getByRole('button',{name:'Definir limites',exact:true}).click()
 await expect(page.getByText('Autônomo',{exact:true})).toHaveCount(0)
 await expect(page.getByText('Simular',{exact:true})).toHaveCount(0)
 await expect(page.getByText('Preparar',{exact:true})).toHaveCount(0)
 const response=page.waitForResponse(response=>response.url().endsWith('/missions/intents')&&response.request().method()==='POST')
 await page.getByRole('button',{name:'Criar missão',exact:true}).click()
 const result=await response
 expect(result.status(),await result.text()).toBe(201)
 const mission=await result.json()
 expect(mission.packSelection.packs[0].key).toBe('radar_prospecting')
 expect(mission.parameters.campaign.name).toBe(name)
 expect(mission.mode).toBe('assisted')
 await page.reload()
 await expect(page.getByText('Pesquisar empresas no Radar Comercial',{exact:false}).first()).toBeVisible()
 await expect(page.locator('vite-error-overlay')).toHaveCount(0)
 const output=process.env.YUX_RADAR_QA_ARTIFACTS
 if(output)await page.screenshot({path:path.join(output,`radar-action-${viewport.width}.png`)})
 if(process.env.YUX_RADAR_QA_MISSION){
  await page.goto(`/client-workspaces/10000000-0000-4000-8000-000000000001/missoes/${process.env.YUX_RADAR_QA_MISSION}`)
  await expect(page.getByText('Empresas encontradas',{exact:true})).toBeVisible()
  await expect(page.getByText('Histórico de decisões',{exact:true})).toBeVisible()
  await expect(page.getByText('Limite autorizado:',{exact:false})).toBeVisible()
  await expect(page.getByRole('button',{name:'Solicitar autonomia',exact:true})).toHaveCount(0)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
  if(output){
   await page.screenshot({path:path.join(output,`radar-review-${viewport.width}.png`),fullPage:true})
   await page.locator('section').filter({has:page.getByRole('heading',{name:'Histórico de decisões',exact:true})}).screenshot({path:path.join(output,`radar-approval-${viewport.width}.png`)})
  }
 }
 await test.info().attach('console-health',{body:JSON.stringify(consoleMessages,null,2),contentType:'application/json'})
 expect(errors).toEqual([])
})
