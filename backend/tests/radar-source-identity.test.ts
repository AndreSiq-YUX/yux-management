import {expect,it} from 'vitest'
import {isRadarReferenceUrl,discoverRadarBusinessPresence} from '../src/modules/radar/site-discovery.js'
import {extractRadarContacts} from '../src/modules/radar/contact-evidence.js'
import {runRadarResearchPipeline} from '../src/modules/radar/research-service.js'
import {resolveRadarSearchConfiguration} from '../src/modules/radar/search-configuration.js'
import {classifyRadarSource,isRadarInstitutionalSource} from '../src/modules/radar/source-identity.js'
const identity={name:'Empresa Brasileira de Refeicoes',legalName:'Embrare Empresa Brasileira de Refeicoes LTDA',cnpj:'01128426000198'}
const directory={url:'https://empresas.serasaexperian.com.br/consulta-gratis/EMBRARE-01128426000198',title:identity.legalName,snippets:[identity.cnpj],observedAt:'2026-10-13'}
it.each([
 ['https://listatudo.com.br/sao-paulo/empresa','Maior site de busca de empresas do Brasil'],
 ['https://www1.folha.uol.com.br/fsp/cotidian/empresa.shtml','DA REPORTAGEM LOCAL. Copyright Folha'],
 ['https://publisher.example/fsp/edicao/empresa.shtml','DA REPORTAGEM LOCAL. Jornal publica notícias'],
 ['https://catalogo.example/empresa-alfa','Encontre empresas por cidade e segmento. Catálogo de empresas'],
])('does not publish a directory or newspaper footer as the company contact: %s',(url,publisher)=>{
 const text=`${publisher}. ${identity.legalName} CNPJ ${identity.cnpj}. editor@publisher.example`
 expect(isRadarInstitutionalSource(url,{text})).toBe(false)
 expect(extractRadarContacts({url,text,observedAt:'2026-10-18'},'confirmed')).toEqual([])
})
it.each([
  ['https://associacao.example/associados/alfa','Associação Comercial. Conheça nossa associada'],
  ['https://agencia.example/clientes/alfa','Conheça nosso cliente'],
  ['https://portal.example.gov.br/registro/alfa','Fornecedor contratado pelo município'],
])('does not use an exact CNPJ citation on another publisher as ownership: %s',async(url,publisher)=>{
  const text=`${publisher} ${identity.legalName}. CNPJ ${identity.cnpj}. Contato do editor: secretaria@editor.example`
  const page={url,text,observedAt:'2026-10-15'}
  const resolvePresence=async()=>{throw Error('external_reference_must_not_be_associated')}
  const result=await runRadarResearchPipeline(identity,resolveRadarSearchConfiguration({research:{presenceResolutionEnabled:true}}),{readingComplete:true,pages:[page],discovery:{association:'confirmed',websiteUrl:url,hits:[],suggestions:[],queries:1,limitations:[]}}, {web:async()=>[],checkpoint:async()=>{},resolvePresence,collect:async()=>[page]})
  expect(result.siteAssociation).toBe('review');expect(result.contacts).toEqual([])
  expect(result.discovery.websiteUrl).toBeUndefined()
})
it('keeps government homepages eligible despite transparency and gazette navigation labels',()=>{
  expect(isRadarInstitutionalSource('https://prefeitura.example.gov.br/',{text:'Prefeitura Municipal de Alfa. CNPJ 12.345.678/0001-90. Serviços ao cidadão. Portal da Transparência. Diário Oficial. Fale conosco.'})).toBe(true)
})
it('does not mistake a company homepage customer-navigation label for a third-party profile',()=>{
  expect(isRadarInstitutionalSource('https://alfa.example/',{text:'Empresa Alfa CNPJ 12.345.678/0001-90. Conheça nossos clientes. Contato.'})).toBe(true)
})
it('requires separate ownership evidence on an unknown publisher even with an exact CNPJ and company name',async()=>{
  const url='https://publisher.example/pagina',page={url,text:`${identity.legalName} CNPJ ${identity.cnpj}. secretaria@publisher.example`,observedAt:'2026-10-15'}
  const result=await runRadarResearchPipeline(identity,resolveRadarSearchConfiguration({research:{presenceResolutionEnabled:true}}),{readingComplete:true,readerVersion:4,pages:[page],discovery:{websiteUrl:url,association:'confirmed',hits:[],suggestions:[],queries:1,limitations:[]}}, {web:async()=>[],checkpoint:async()=>{},resolvePresence:async()=>({candidateId:null,scope:'unresolved',reason:'Não há evidência de titularidade.',claims:[]})})
  expect(result.siteAssociation).toBe('review')
  expect(result.contacts.every(contact=>contact.association==='review')).toBe(true)
})
it.each([
  ['https://compras.example.gov.br/ata/empresa','government_reference'],
  ['https://www.bec.sp.gov.br/bec_pregao_UI/Ata/becprp17001.aspx','government_reference'],
  ['https://www.escavador.com/diarios/927547/empresa','editorial_reference'],
  ['https://www.diariocidade.com/sp/osasco/guia/empresa/','directory_reference'],
  ['https://www.balancos.com.br/site/lista-completa/empresa.php?cgc=01128426000198','directory_reference'],
  ['https://unknown.example/guia/empresa','directory_reference'],
])('does not promote a reference citing exact CNPJ: %s',(url,role)=>{
  const evidence={title:'Consulta da empresa',text:`Dados cadastrais da empresa ${identity.legalName} CNPJ ${identity.cnpj}`}
  expect(isRadarInstitutionalSource(url,evidence)).toBe(false)
  expect(classifyRadarSource(url,evidence)).toMatchObject({role})
  expect(extractRadarContacts({url,text:`${evidence.text} editor@unknown.example`,observedAt:'2026-10-15'},'confirmed')).toEqual([])
})
it('classifies third-party directory structure even without preserved page text',()=>{
  expect(isRadarInstitutionalSource('https://unknown.example/guia/empresa-alfa')).toBe(false)
  expect(isRadarInstitutionalSource('https://compras.example.gov.br/ata/empresa')).toBe(false)
})
it('keeps genuine supplier pages and public institutional portals eligible, not automatically associated',()=>{
  expect(isRadarInstitutionalSource('https://alfa.example/fornecedor/',{text:'Seja fornecedor da Alfa. CNPJ 01128426000198'})).toBe(true)
  expect(isRadarInstitutionalSource('https://entidade.gov.br/',{title:'Entidade Pública',text:'Portal institucional da Entidade Pública'})).toBe(true)
  expect(classifyRadarSource('https://entidade.gov.br/')).toMatchObject({kind:'institutional_candidate'})
})
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
