import type { MissionCommandContext, MissionCommandQueryable } from '../action-engine/mission-command.js'
import { generateCreativeDraft as createCampaignCreativeVersion } from '../campaigns/commands.js'
import type { CampaignLaunchArtifact } from '../campaigns/repository.js'

export async function generateCreativeDraft(client:MissionCommandQueryable,context:MissionCommandContext,input:{campaignVersionId:string;position:number;creative:CampaignLaunchArtifact['creatives'][number]}){
  return createCampaignCreativeVersion(client,context,input)
}
