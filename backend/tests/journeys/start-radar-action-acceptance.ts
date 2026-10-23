import { createIntegrationRig } from '../integration/support/rig.js'

const rig=await createIntegrationRig({queueMode:'stub',radarActionEngine:true,corsOrigin:'http://127.0.0.1:4178'})
await rig.sql("INSERT INTO public.contract_modules(contract_id,module_key,enabled) VALUES($1,'radar',TRUE),($1,'action_engine',TRUE) ON CONFLICT(contract_id,module_key) DO UPDATE SET enabled=TRUE",[rig.ids.contractA])
console.log(JSON.stringify({url:await rig.listen(4188),pid:process.pid,fixture:'radar-action-assisted',providers:'simulated'}))
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void rig.close().finally(()=>process.exit(0))})
