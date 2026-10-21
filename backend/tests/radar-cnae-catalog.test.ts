import { expect, it } from 'vitest';
const api=await import('../src/modules/radar/cnae-catalog.js').catch(()=>({})) as Record<string,any>;
it('normalizes official registry records without embedding segment-specific exclusion rules',()=>{
 const records=api.normalizeRadarCnaeCatalog([{id:'5620101',descricao:'Fornecimento de alimentos para empresas',classe:{id:'56201',descricao:'Serviços de alimentação',grupo:{id:'562',descricao:'Serviços'}}}]);
 expect(records).toEqual([{code:'5620101',description:'Fornecimento de alimentos para empresas',searchText:'fornecimento de alimentos para empresas',hierarchy:{classCode:'56201',classDescription:'Serviços de alimentação',groupCode:'562',groupDescription:'Serviços'}}]);
 expect(()=>api.normalizeRadarCnaeCatalog([{id:'invalid',descricao:'Erro'}])).toThrow();
});
