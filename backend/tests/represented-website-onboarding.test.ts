import {expect,it} from 'vitest'
import {scopeRepresentedWebsiteSuggestions} from '../src/modules/company-intelligence/represented-website.js'
it('only accepts represented description/lines and products, excluding manufacturer identity',()=>{
 const base={evidenceExcerpt:'Fonte',sourceUrl:'https://example.test',confidence:0.9}
 const scoped=scopeRepresentedWebsiteSuggestions([{...base,suggestionKind:'profile',fieldPath:'tradeName',suggestedValue:'Fabricante'},{...base,suggestionKind:'brand',fieldPath:'visualIdentity',suggestedValue:{logoUrl:'logo'}},{...base,suggestionKind:'profile',fieldPath:'description',suggestedValue:'Massas congeladas'},{...base,suggestionKind:'product',fieldPath:'products',suggestedValue:[]}])
 expect(scoped.map(item=>item.fieldPath)).toEqual(['representedBusiness.description','products'])
})
