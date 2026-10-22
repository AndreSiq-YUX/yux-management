/** Only observed public profile URLs are channels. Never turn a post, video or
 * private administration link into an invented profile URL. */
export function isRadarPublicProfile(value:string):boolean {
 try{
  const url=new URL(value),host=url.hostname.toLowerCase(),parts=url.pathname.split('/').filter(Boolean);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!parts.length||url.searchParams.has('share'))return false;
  if(parts.some(part=>/^(?:sharer(?:\.php)?|share|login|accounts|help|privacy|watch|intent|plugins|send|admin|posts|videos|photos|reel|reels|stories|explore|shorts)$/i.test(part)))return false;
  if(/(^|\.)instagram\.com$/.test(host))return parts.length===1&&!/^(?:p|tv|direct)$/i.test(parts[0]);
  if(/(^|\.)linkedin\.com$/.test(host))return parts[0]==='company'&&!!parts[1]&&(parts.length===2||parts.length===3&&parts[2]==='about');
  if(/(^|\.)youtube\.com$/.test(host))return parts.length===1&&parts[0].startsWith('@')||parts.length===2&&['channel','c','user'].includes(parts[0]);
  if(/(^|\.)tiktok\.com$/.test(host))return parts.length===1&&parts[0].startsWith('@');
  if(/(^|\.)facebook\.com$/.test(host))return parts.length===1||['pages','people'].includes(parts[0])&&parts.length===3;
  return false;
 }catch{return false}
}
