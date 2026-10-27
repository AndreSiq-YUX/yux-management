import {expect,it} from 'vitest'
import {assessRadarFunnelResearch} from '../src/modules/radar/capture-research-state.js'
const text='A Gali desenvolve projetos de montagem elétrica e geração de energia.'
const output={funnel:{},readingComplete:true,siteAssociation:'confirmed',pages:[{url:'https://galienergia.com.br/sobre/',text}],qualification:{targetStatus:'not_target',reasons:['Montagem elétrica'],evidenceIds:['page-0'],claims:[{reason:'Montagem elétrica',evidenceId:'page-0',excerpt:text}]},quality:{readyForReview:false}}
it('applies a grounded categorical outside-profile qualification even with probability gates in observation',()=>{
 expect(assessRadarFunnelResearch({status:'partial',output})).toEqual({outcome:'out_of_profile',retryable:false})
})
it.each(['wrong_identity','invalid_quote','no_evidence','review'])('never excludes from %s',kind=>{
 const value=structuredClone(output)
 if(kind==='wrong_identity')value.siteAssociation='review'
 if(kind==='invalid_quote')value.qualification.claims[0].excerpt='Invented quote'
 if(kind==='no_evidence')value.qualification.claims=[]
 if(kind==='review')value.qualification.targetStatus='review'
 expect(assessRadarFunnelResearch({status:'partial',output:value}).outcome).not.toBe('out_of_profile')
})
it('never concludes an active or failed worker from an old qualification',()=>{
 expect(assessRadarFunnelResearch({status:'running',output}).outcome).toBe(null)
 expect(assessRadarFunnelResearch({status:'failed',output}).outcome).toBe('technical_failure')
})
it('resolves saved qualification citations by their bound source URL when the full dossier has a different page order',()=>{
 const value={...output,pages:[{url:'https://directory.example/',text:'Listagem comercial'},...output.pages],qualification:{...output.qualification,evidenceSources:[{id:'page-0',sourceUrl:output.pages[0].url}]}}
 expect(assessRadarFunnelResearch({status:'partial',output:value}).outcome).toBe('out_of_profile')
 value.qualification.evidenceSources[0].sourceUrl='https://another-company.example/'
 expect(assessRadarFunnelResearch({status:'partial',output:value}).outcome).not.toBe('out_of_profile')
})
it('does not exclude an establishment using a group-only association',()=>{
 expect(assessRadarFunnelResearch({status:'partial',output:{...output,presenceResolution:{scope:'group'}}}).outcome).not.toBe('out_of_profile')
})
it.each([null,{},'legacy text',42])('tolerates malformed legacy claim material %j without breaking the campaign response',claims=>{
 expect(()=>assessRadarFunnelResearch({status:'partial',output:{...output,qualification:{...output.qualification,claims}}})).not.toThrow()
 expect(assessRadarFunnelResearch({status:'partial',output:{...output,qualification:{...output.qualification,claims}}}).outcome).not.toBe('out_of_profile')
})
