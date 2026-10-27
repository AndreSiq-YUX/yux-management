import { expect, it } from 'vitest'
import { calculateMissionBudgetBurnDown } from '../src/modules/action-engine/budget-alerts.js'
it('reports a zero-cost preparation without dividing by zero or treating it as a missing budget', () => {
 const result=calculateMissionBudgetBurnDown({maximumCostBrl:'0',envelopeVersion:1,entries:[]})
 expect(result).toMatchObject({maximumCostBrl:'0.000000',consumedCostBrl:'0.000000',remainingCostBrl:'0.000000',consumedPercent:'0.00',exhausted:false,newlyCrossedThresholds:[]})
})
it('flags any nonzero spend against a zero ceiling and continues rejecting negative ceilings', () => {
 const result=calculateMissionBudgetBurnDown({maximumCostBrl:'0',envelopeVersion:1,entries:[{id:'actual',nature:'actual',amountBrl:'0.01'}]})
 expect(result.exhausted).toBe(true)
 expect(result.consumedPercent).toBe('100.00')
 expect(()=>calculateMissionBudgetBurnDown({maximumCostBrl:'-1',envelopeVersion:1,entries:[]})).toThrow('mission_budget_maximum_invalid')
})

