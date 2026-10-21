import {z} from 'zod'
const positive=z.number().int().positive().safe()
export const radarGateCriteriaSchema=z.object({minPositiveSamples:positive.default(30),minNegativeSamples:positive.default(20),holdoutShare:z.number().min(.1).max(.5).default(.34),minHoldoutPositives:positive.default(10),minHoldoutNegatives:positive.default(7),maxFalseBlocksOnPositives:z.literal(0).default(0),minBlockPrecision:z.number().min(.95).max(1).default(.95),minBlockRecall:z.number().min(0).max(1).default(.30),thresholdMargin:z.number().min(0).max(.25).default(.05),minThreshold:z.number().min(.75).max(.99).default(.8),auditSampleRate:z.number().min(.1).max(1).default(.2),auditSampleRateSteady:z.number().min(.1).max(1).default(.1),autoShadowOnReversedAudits:positive.default(1),autoShadowOnReopenRate:z.number().min(0).max(1).default(.05)}).strict()
const aiGate=z.object({mode:z.enum(['off','shadow','enforce']).default('shadow'),criteria:radarGateCriteriaSchema.default(()=>radarGateCriteriaSchema.parse({}))}).strict()
export const radarFunnelPolicySchema=z.object({
 enabled:z.boolean().default(false),
 g0:z.object({mode:z.enum(['off','enforce']).default('off')}).strict().default(()=>({mode:'off' as const})),
 g3:z.object({mode:z.enum(['off','effective']).default('off')}).strict().default(()=>({mode:'off' as const})),
 g1:aiGate.default(()=>aiGate.parse({})),g5:aiGate.default(()=>aiGate.parse({})),
 agentPolicy:z.object({mode:z.enum(['off','escalation']).default('off'),timing:z.enum(['after_first_cheap_attempt','immediately_when_no_site_candidate']).default('after_first_cheap_attempt'),priorities:z.array(z.enum(['primary','secondary'])).min(1).max(2).default(['primary','secondary'])}).strict().default(()=>({mode:'off' as const,timing:'after_first_cheap_attempt' as const,priorities:['primary' as const,'secondary' as const]})),
 weakFitBudget:z.object({maxCheapSearches:positive.default(1),agent:z.literal(false).default(false)}).strict().default(()=>({maxCheapSearches:1,agent:false as const})),
 depthByPriority:z.object({primary:z.enum(['standard','full']).default('full'),secondary:z.enum(['standard','full']).default('full')}).strict().default(()=>({primary:'full' as const,secondary:'full' as const})),
}).strict()
export type RadarFunnelPolicy=z.infer<typeof radarFunnelPolicySchema>
