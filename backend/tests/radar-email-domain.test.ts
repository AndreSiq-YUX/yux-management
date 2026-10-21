import {expect,it} from 'vitest'
const api=await import('../src/modules/radar/email-domain.js').catch(()=>({})) as Record<string,any>
const policy={genericProviders:['gmail.com','bol.com.br'],accountantTokens:['contab','assessoria']}
it('uses editable lists and treats corporate and accounting domains as candidates, never confirmed sites',()=>{
 expect(api.classifyRadarEmailDomain).toBeTypeOf('function')
 expect(api.classifyRadarEmailDomain('pessoa@gmail.com',policy)).toMatchObject({kind:'generic_provider',domain:'gmail.com'})
 expect(api.classifyRadarEmailDomain('fiscal@nova-contabilidade.com.br',policy)).toMatchObject({kind:'possible_accountant'})
 expect(api.classifyRadarEmailDomain('compras@EXEMPLO.com.br',policy)).toMatchObject({kind:'corporate_candidate',domain:'exemplo.com.br',outcome:'unconfirmed'})
 expect(api.classifyRadarEmailDomain('compras@exemplo.com.br',{...policy,genericProviders:[...policy.genericProviders,'exemplo.com.br']})).toMatchObject({kind:'generic_provider'})
})
it.each(['',null,'bad','a@localhost','a@127.0.0.1','a@10.1.2.3','a@[::1]','a@empresa.local','a@site.com/path','a@site.com:443','a@user@site.com'])('does not offer a public reader candidate for %s',email=>{
 expect(api.classifyRadarEmailDomain(email,policy).kind).toBe('absent')
})
