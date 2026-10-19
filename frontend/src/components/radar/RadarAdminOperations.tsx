import type {ReactNode} from 'react'
export function RadarAdminOperations({children,isSystemAdmin=false,standalone=false,organizationId,campaignId}:{children?:ReactNode;isSystemAdmin?:boolean;standalone?:boolean;organizationId?:string;campaignId?:string}){
 if(!isSystemAdmin)return null
 if(standalone)return <section aria-label="Operações técnicas do Radar" className="flex flex-col gap-4 rounded-md border bg-background p-4">{children}</section>
 if(!organizationId||!campaignId)return null
 return <a className="self-start text-sm text-primary underline" href={`/admin/integrations?radarOrganization=${encodeURIComponent(organizationId)}&radarCampaign=${encodeURIComponent(campaignId)}#radar-operations`}>Abrir operações administrativas</a>
}
