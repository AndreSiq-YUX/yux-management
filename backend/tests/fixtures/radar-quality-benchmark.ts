// Reduced, synthetic evidence. No provider calls or real company/contact data.
export const radarQualityBenchmark = [
  {name:'government procurement',url:'https://compras.example.gov.br/ata/123',text:'Alfa CNPJ 12345678000190',official:false},
  {name:'government gazette',url:'https://municipio.example.gov.br/diario-oficial/123',text:'Alfa CNPJ 12345678000190',official:false},
  {name:'known directory',url:'https://cnpj.biz/12345678000190',text:'Alfa',official:false},
  {name:'unknown directory text',url:'https://editor.example/alfa',text:'Dados cadastrais da empresa Alfa CNPJ 12345678000190',official:false},
  {name:'unknown directory path',url:'https://editor.example/guia/alfa',text:'Alfa',official:false},
  {name:'editorial publication',url:'https://editor.example/noticias/alfa',text:'Notícia sobre Alfa publicado por editor',official:false},
  {name:'social profile',url:'https://facebook.com/alfa',text:'Alfa',official:false},
  {name:'institutional supplier page',url:'https://alfa.example/fornecedor/',text:'Alfa CNPJ 12345678000190 Seja fornecedor',official:true},
  {name:'legitimate public entity',url:'https://instituto.example.gov.br/',text:'Instituto público de pesquisa',official:true},
  {name:'homonym without association',url:'https://homonimo.example/',text:'Alfa em outra região',official:true},
  {name:'group is not establishment',url:'https://grupo.example/',text:'Grupo Alfa',official:true},
] as const
export const radarContactBenchmark = [
  {name:'supplier channel',purpose:'suppliers',value:'compras@alfa.example',useful:true},
  {name:'general alternative',purpose:'general',value:'contato@alfa.example',useful:true},
  {name:'recruitment is not procurement',purpose:'recruitment',value:'vagas@alfa.example',useful:false},
  {name:'privacy is not procurement',purpose:'privacy',value:'privacidade@alfa.example',useful:false},
] as const
// The remaining five scenarios exercise deduplication, no-site sufficiency,
// quota stopping, crash/unread-page recovery, and honest unit costs.
