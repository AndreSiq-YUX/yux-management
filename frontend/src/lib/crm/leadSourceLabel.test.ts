import {expect,it} from 'vitest'
import {leadSourceLabel} from './leadSourceLabel'
it('keeps the commercial Radar origin when its acquisition kind is manual',()=>{
 expect(leadSourceLabel('manual','Radar Comercial')).toBe('Radar Comercial')
 expect(leadSourceLabel('manual','Outra origem')).toBe('Manual')
})
