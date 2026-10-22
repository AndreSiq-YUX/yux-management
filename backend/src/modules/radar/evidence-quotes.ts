/** Match only contiguous verbatim words. Preserve the original source span;
 * Unicode composition and layout whitespace are not semantic corrections. */
export function resolveRadarEvidenceQuote(source:string,excerpt:string):string|null {
 if(!excerpt)return null;
 if(source.includes(excerpt))return excerpt;
 const wanted=excerpt.trim().normalize('NFC').split(/\s+/u),tokens=[...source.matchAll(/\S+/gu)];
 for(let start=0;start+wanted.length<=tokens.length;start++){
  if(!wanted.every((word,index)=>tokens[start+index][0].normalize('NFC')===word))continue;
  const end=tokens[start+wanted.length-1];
  return source.slice(tokens[start].index!,end.index!+end[0].length);
 }
 return null;
}
