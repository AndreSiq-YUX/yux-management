import { CRM_PREPARATION_PACK_V1 as pack } from '../../src/modules/action-engine/packs/crm-preparation-v1.js'
import { createActionEngineCapabilityRegistry } from '../../src/modules/action-engine/capabilities/index.js'

export function crmPreparationProposal(missionId: string, sourceId: string) {
  const funnel = {name:'Comercial de alimentos',description:'Prospecção consultiva',stages:[
    {key:'contact',name:'Contato inicial',exitCriteria:['Qualificação recebida'],isWon:false,isLost:false},
    {key:'won',name:'Pedido confirmado',exitCriteria:['Pedido confirmado'],isWon:true,isLost:false},
    {key:'lost',name:'Sem aderência',exitCriteria:['Recusa confirmada'],isWon:false,isLost:true}]}
  const emails = [1,2,3].map(index=>({name:`Apresentação ${index}`,subject:`Massas para sua cozinha ${index}`,
    previewText:'Conheça a oferta',bodyHtml:'<p>Podemos ajudar sua operação.</p><a href="{{unsubscribe_url}}">Sair</a>',bodyText:'Podemos ajudar. Sair: {{unsubscribe_url}}',
    sourceIds:[sourceId],complianceNotes:['Oferta conforme portfólio aprovado.']}))
  const sequence = {name:`Pré-venda consultiva ${missionId.slice(0,8)}`,description:'Rascunho para revisão',conversionGoal:'Resposta qualificada',
    steps:emails.map((_,i)=>({templateVersionId:`binding:pack.draft_email_${i+1}.versionId`,delayMinutes:i*1440,exitConditions:['replied','unsubscribed']}))}
  const registry = createActionEngineCapabilityRegistry()
  return {kind:'plan',interpretation:{objective:'Preparar rascunhos'},questions:[],sourceIds:[sourceId],
    selectedPacks:[{key:pack.key,version:pack.semanticVersion,contentHash:pack.contentHash}],
    plan:{schemaVersion:1,missionId,actionPack:{key:pack.key,version:pack.semanticVersion,templateHash:pack.contentHash},
      resolvedParameters:{icp:'Cozinhas industriais',offer:'Massas congeladas',funnelNurtureArtifacts:{funnel,emails,sequence,sourceIds:[sourceId]}},
      deviations:[],rationale:'Preparação fundamentada na estratégia aprovada.',assumptions:[],risks:[],
      estimatedEconomics:{currency:'BRL',aiAndProviderCost:'0',mediaCost:'0',humanHours:'0',humanCost:'0',totalExecutionCost:'0'},
      steps:pack.topologyTemplate.steps.map(step=>({stepKey:step.stepKey,dependsOn:step.dependsOn,capabilityKey:step.capabilityKey,capabilityVersion:step.capabilityVersion,
        input:step.stepKey==='pack.simulate_funnel'||step.stepKey==='pack.draft_funnel'?funnel:
          step.stepKey.startsWith('pack.draft_email_')?emails[Number(step.stepKey.at(-1))-1]:step.stepKey==='pack.draft_sequence'?sequence:step.defaultParameters,
        timeoutSeconds:300,maxAttempts:1,approvalRequired:false,effect:registry.get(step.capabilityKey,step.capabilityVersion).effect,outputBindings:{}}))}}
}
