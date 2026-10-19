import {test,expect} from '@playwright/test'
// Browser plugin unavailable: existing Playwright, loopback fixture and mocked
// provider transports. No new dependencies, external calls or production data.
const campaignId=process.env.YUX_RADAR_RESUME_QA_CAMPAIGN_ID
const baseURL=process.env.YUX_RADAR_QA_BASE_URL??'http://127.0.0.1:4174'
if(!['127.0.0.1','localhost'].includes(new URL(baseURL).hostname))throw Error('local_radar_qa_required')
test.use({baseURL,channel:process.env.YUX_RADAR_QA_BROWSER_CHANNEL})
test.skip(!campaignId,'Requires start-radar-capture-server with RECOVER_SAVED=true.')
test.describe.configure({mode:'serial'})
for(const viewport of [{width:1280,height:900},{width:430,height:920}])test(`saved twenty-company lot, inline details and reload (${viewport.width}px)`,async({page})=>{
 await page.setViewportSize(viewport)
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept())
 await page.goto('/auth/login');await page.getByRole('textbox',{name:'E-mail',exact:true}).fill('yux-admin@integration.test');await page.getByLabel('Senha',{exact:true}).fill('integration-password');await page.getByRole('button',{name:'Entrar',exact:true}).click()
 await expect(page).not.toHaveURL(/\/auth\/login/)
 await page.goto(`/client-workspaces/10000000-0000-4000-8000-000000000001/comercial/radar/${campaignId}`)
 const controls=page.getByRole('form',{name:'Pesquisar novas empresas'})
 await expect(controls).toBeVisible()
 if(viewport.width===1280){await controls.getByRole('button',{name:'Retomar pesquisa',exact:true}).click()}
 await expect(page.getByRole('heading',{name:'Empresas encontradas',exact:true})).toBeVisible()
 await expect.poll(async()=>{const state=await(await page.request.get('http://127.0.0.1:4182/api/qa/radar-state')).json();return state.processed},{timeout:30000}).toBe(18)
 await expect.poll(async()=>{
  const state=await(await page.request.get('http://127.0.0.1:4182/api/qa/radar-state')).json()
  return state.items.filter((item:{status:string})=>['queued','researching'].includes(item.status)).length
 },{timeout:30000}).toBe(0)
 const state=await(await page.request.get('http://127.0.0.1:4182/api/qa/radar-state')).json()
 expect(state.items).toHaveLength(20);expect(state.counters).toEqual({discovery:0,search:0,model:0})
 expect(state.items.every((item:{status:string;blocker?:string})=>['completed','insufficient'].includes(item.status)||item.status==='blocked'&&!!item.blocker)).toBe(true)
 await page.reload();await expect(controls).toBeVisible()
 const actualRow=page.getByRole('row').filter({has:page.getByText('Empresa Sintética 1',{exact:true})})
 await actualRow.getByRole('button',{name:'Ver detalhes',exact:true}).click()
 const summary=page.getByRole('region',{name:/Resumo de Empresa Sintética 1/}).first()
 await expect(summary).toBeVisible()
 const box=await summary.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(viewport.width)
 await summary.getByRole('button',{name:'Ver detalhes completos'}).click()
 await expect(page.getByRole('heading',{name:'Detalhes da empresa',exact:true})).toBeFocused()
 await page.getByRole('button',{name:'Fechar detalhes',exact:true}).click()
 expect(errors).toEqual([])
})
