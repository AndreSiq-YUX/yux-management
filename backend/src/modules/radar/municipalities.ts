import {radarMunicipalitiesData} from './data/municipalities.generated.js'

const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('pt-BR')
const states=new Set(radarMunicipalitiesData.map(([state])=>state))
const codes=new Map(radarMunicipalitiesData.map(([state,name,code])=>[`${state}:${normalize(name)}`,code]))

/** City selection must never fall back to an entire state or a live dependency. */
export function resolveRadarMunicipalityCode(city:string,state?:string):number{
  const uf=state?.trim().toUpperCase()
  if(!uf||!states.has(uf))throw Error('cnpja_city_requires_state')
  const code=codes.get(`${uf}:${normalize(city)}`)
  if(code===undefined)throw Error('cnpja_municipality_not_found')
  return code
}
