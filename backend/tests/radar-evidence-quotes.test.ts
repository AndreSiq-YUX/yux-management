import {expect,it} from 'vitest'
import {resolveRadarEvidenceQuote} from '../src/modules/radar/evidence-quotes.js'
it('returns the original contiguous span across layout whitespace and canonical accents',()=>{
 const source='Inicio. Refeições\u00a0coletivas\npara empresas e cafe\u0301. Fim.';
 expect(resolveRadarEvidenceQuote(source,'Refeições coletivas para empresas e café.')).toBe('Refeições\u00a0coletivas\npara empresas e cafe\u0301.');
});
it.each(['Refeições para empresas','Refeições coletivas para companhias','Refeições coletivas... empresas','Itapecerica da Serra'])('never accepts missing, reordered or paraphrased text: %s',quote=>{
 expect(resolveRadarEvidenceQuote('Refeições coletivas para empresas. São Paulo/SP',quote)).toBeNull();
});
