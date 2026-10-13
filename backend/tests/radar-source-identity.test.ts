import {expect,it} from 'vitest'
import {isRadarReferenceUrl,discoverRadarBusinessPresence} from '../src/modules/radar/site-discovery.js'
import {extractRadarContacts} from '../src/modules/radar/contact-evidence.js'
import {runRadarResearchPipeline} from '../src/modules/radar/research-service.js'
import {resolveRadarSearchConfiguration} from '../src/modules/radar/search-configuration.js'
const identity={name:'Empresa Brasileira de Refeicoes',legalName:'Embrare Empresa Brasileira de Refeicoes LTDA',cnpj:'01128426000198'}
const directory={url:'https://empresas.serasaexperian.com.br/consulta-gratis/EMBRARE-01128426000198',title:identity.legalName,snippets:[identity.cnpj],observedAt:'2026-10-13'}
it('does not call a directory the official website merely because its snippet contains the CNPJ',async()=>{
  expect(isRadarReferenceUrl(directory.url)).toBe(true)
  expect(isRadarReferenceUrl('https://unknown.example/cnpj/empresa-01128426000198')).toBe(true)
  const result=await discoverRadarBusinessPresence(identity,{maxSearchQueriesPerCandidate:1,webSearchEnabled:true},{search:async()=>[directory]})
  expect(result.websiteUrl).toBeUndefined()
})
it('does not extract directory-owned footer, structured contacts or sharing widgets as company contacts',()=>{
  const page={...directory,text:`${identity.legalName} CNPJ ${identity.cnpj} Telefone (11) 4504-7000`,html:'<footer><a href="https://instagram.com/serasa_experian/">Instagram</a><a href="https://wa.me/551130037372">WhatsApp Serasa</a></footer>'}
  expect(extractRadarContacts(page,'confirmed')).toEqual([])
  expect(extractRadarContacts({url:'https://alfa.example',text:'Empresa Alfa',observedAt:'2026-10-13',html:'<a href="https://facebook.com/sharer/sharer.php?u=https://alfa.example">Compartilhar</a>'})).toEqual([])
})
it('keeps directory evidence but excludes it from company identity, contacts and activity',async()=>{
  const page={...directory,text:`${identity.legalName} CNPJ ${identity.cnpj} (11) 4504-7000`,html:'<a href="https://instagram.com/serasa_experian/">Instagram</a>'}
  const result=await runRadarResearchPipeline(identity,resolveRadarSearchConfiguration({}),{readingComplete:true,pages:[page],discovery:{association:'confirmed',websiteUrl:directory.url,hits:[directory],suggestions:[],queries:1,limitations:[]}}, {web:async()=>[],checkpoint:async()=>{}})
  expect(result.contacts).toEqual([])
  expect(result.siteAssociation).toBe('review')
  expect(result.pages).toHaveLength(1)
})
