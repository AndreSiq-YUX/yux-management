import path from 'node:path'
import {test,expect} from '@playwright/test'
const campaignId=process.env.YUX_RADAR_WATCHDOG_QA_CAMPAIGN_ID,baseURL='http://127.0.0.1:4174'
test.use({baseURL,channel:process.env.YUX_RADAR_QA_BROWSER_CHANNEL})
test.skip(!campaignId,'Requires the isolated WATCHDOG + RECOVER_SAVED fixture. All provider transports are simulated.')
for(const viewport of [{width:1280,height:900},{width:430,height:920}])test(`system Admin attention and editable threshold (${viewport.width}px)`,async({page})=>{
 const errors:string[]=[],effects:string[]=[]
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.method()==='POST'&&/research-requests|capture-operations|enrich-brave|\/research$/.test(request.url()))effects.push(request.url())})
 await page.setViewportSize(viewport)
 await page.goto('/auth/login');await page.getByRole('textbox',{name:'E-mail',exact:true}).fill('yux-admin@integration.test');await page.getByLabel('Senha',{exact:true}).fill('integration-password');await page.getByRole('button',{name:'Entrar',exact:true}).click()
 await expect(page).not.toHaveURL(/\/auth\/login/)
 await page.goto(`/admin/integrations?radarOrganization=10000000-0000-4000-8000-000000000001&radarCampaign=${campaignId}#radar-operations`)
 const panel=page.getByRole('region',{name:'Pesquisas sem avanço'})
 await expect(panel).toContainText('QA — Captação completa')
 await expect(page.locator('[name="stalledAfterMinutes"]')).toHaveValue('10')
 await panel.getByRole('button',{name:'Atualizar diagnóstico'}).click()
 await expect(panel.getByRole('button',{name:'Atualizar diagnóstico'})).toBeEnabled()
 await panel.scrollIntoViewIfNeeded()
 const box=await panel.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(viewport.width)
 if(process.env.YUX_RADAR_QA_ARTIFACTS)await page.screenshot({path:path.join(process.env.YUX_RADAR_QA_ARTIFACTS,`watchdog-${viewport.width}.png`)})
 expect(effects).toEqual([]);expect(errors).toEqual([])
})
