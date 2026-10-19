import {expect,it,vi} from 'vitest'
import type {AuthUser} from '../src/auth/routes.js'
const api=await import('../src/modules/radar/analysis-retry-authorizations.js').catch(()=>({})) as Record<string,any>
it.each(['yux_operator','client_admin','client_member'])('does not let %s approve a new purchase for an uncertain analysis',async role=>{
 expect(api.authorizeRadarAnalysisRetries).toBeTypeOf('function')
 const query=vi.fn()
 await expect(api.authorizeRadarAnalysisRetries({query} as never,{role} as AuthUser,{})).rejects.toMatchObject({statusCode:403})
 expect(query).not.toHaveBeenCalled()
})
