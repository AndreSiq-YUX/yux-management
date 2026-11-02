import {expect,it} from 'vitest'
import {fillCommercialGaps} from '../src/modules/radar/crm-reconciliation.js'
it('preserves edits and merges contacts without duplication',()=>{
 const edited={city:'Manual',contacts:[{kind:'email',value:'a@alfa.test',sourceUrl:'https://alfa.test',preferred:true}]}
 const researched={city:'Pesquisa',state:'SP',contacts:[{kind:'email',value:'a@alfa.test',sourceUrl:'https://alfa.test',preferred:false},{kind:'phone',value:'1133334444'}]}
 const merged=fillCommercialGaps(edited,researched) as any
 expect(merged.city).toBe('Manual');expect(merged.state).toBe('SP');expect(merged.contacts).toHaveLength(2)
 expect(merged.contacts.find((c:any)=>c.kind==='email').preferred).toBe(true)
 expect(fillCommercialGaps(merged,researched)).toEqual(merged)
})
