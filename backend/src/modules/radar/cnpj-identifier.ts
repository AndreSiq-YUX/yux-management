/** Preserve letters. Format validation is separate from proof of ownership. */
export function normalizeRadarCnpjIdentifier(value:unknown):string|undefined{
 if(typeof value!=='string'||!/^[A-Za-z0-9.\/\s-]+$/.test(value))return
 const clean=value.replace(/[.\/\s-]/g,'').toUpperCase()
 return /^[A-Z0-9]{12}[0-9]{2}$/.test(clean)?clean:undefined
}
export function normalizeValidRadarCnpj(value:unknown):string|undefined{
 const clean=normalizeRadarCnpjIdentifier(value)
 if(!clean||/^(\d)\1{13}$/.test(clean))return
 // Receita Federal: ASCII minus 48, modulo 11, weights 2..9 right to left.
 const digit=(prefix:string)=>{let total=0;for(let index=prefix.length-1,weight=2;index>=0;index--,weight=weight===9?2:weight+1)total+=(prefix.charCodeAt(index)-48)*weight
  const remainder=total%11;return String(remainder<2?0:11-remainder)}
 const first=digit(clean.slice(0,12))
 return clean.slice(12)===first+digit(clean.slice(0,12)+first)?clean:undefined
}
/** Full identifiers only; do not combine unrelated digits from a whole page. */
export function extractRadarCnpjIdentifiers(text:string):string[]{
 return [...text.matchAll(/(?<![A-Z0-9])[A-Z0-9]{2}[. ]?[A-Z0-9]{3}[. ]?[A-Z0-9]{3}[/ ]?[A-Z0-9]{4}[- ]?[0-9]{2}(?![A-Z0-9])/gi)]
  .map(match=>normalizeRadarCnpjIdentifier(match[0])).filter((value):value is string=>!!value)
}
