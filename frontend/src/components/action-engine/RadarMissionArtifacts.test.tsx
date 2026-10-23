import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { expect,it } from 'vitest'
import { MissionArtifactsPanel } from './MissionArtifactsPanel'
import type { MissionArtifact } from '@/types/actionEngine'

it('shows research as awaiting review and links to the exact campaign',async()=>{
 const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container)
 const artifact={key:'radar.prospecting_result',kind:'radar_result',title:'Pesquisa',status:'draft',entityId:'campaign-a',data:{state:'partial',counts:{found:8,complete:6,approved:0}},contentHash:'a'.repeat(64),staleApproval:false,proposedVersion:{status:'proposed',contentHash:'a'.repeat(64)},citations:[],complianceWarnings:[]} as MissionArtifact
 try {
 await act(async()=>root.render(<MemoryRouter><MissionArtifactsPanel artifacts={[artifact]} canWrite={false} showTechnicalProof={false} onRefresh={()=>{}}/></MemoryRouter>))
 expect(container.textContent).toContain('Finalizada com lacunas')
 expect(container.textContent).toContain('Encontradas: 8')
 expect(container.textContent).toContain('Aprovadas: 0')
 expect(container.querySelector('a')?.getAttribute('href')).toBe('/portal/comercial/radar/campaign-a')
 expect(container.textContent).not.toContain('Receita')
 }finally{await act(async()=>root.unmount());container.remove()}
})
