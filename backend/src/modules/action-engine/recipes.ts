import { FUNNEL_NURTURE_PACK_V1 } from './packs/funnel-nurture-v1.js'
import { hashCanonical, type Queryable } from './repository.js'

export type MissionRecipe = {
  id: string
  key: string
  version: number
  title: string
  sector: string
  packSelections: Array<{ key: string; version: string; contentHash: string }>
  defaultGoal: Record<string, unknown>
  editableKeys: string[]
  contentHash: string
}

export const REAL_ESTATE_FUNNEL_RECIPE = recipeDefinition({
  key: 'funnel_nurture_real_estate', version: 1, title: 'Funil + nutrição para imobiliária', sector: 'real_estate',
  packSelections: [{ key: FUNNEL_NURTURE_PACK_V1.key, version: FUNNEL_NURTURE_PACK_V1.semanticVersion, contentHash: FUNNEL_NURTURE_PACK_V1.contentHash }],
  defaultGoal: {
    title: 'Funil e nutrição para imobiliária',
    objective: 'Criar um funil consultivo para compradores de imóveis e uma sequência educativa de três e-mails, respeitando consentimento e a base publicada.',
    mode: 'shadow', allowedModules: ['crm','automations','funnel_nurture_agent'],
    maxTotalCostBrl: '500', maxHumanHours: '4', maxExternalContacts: 0, expectedValueBrl: '10000',
  },
  editableKeys: ['title','objective','mode','maxTotalCostBrl','maxHumanHours','maxExternalContacts','expectedValueBrl'],
})

export async function listMissionRecipes(client: Queryable): Promise<MissionRecipe[]> {
  const result = await client.query<Record<string, unknown>>(
    `SELECT id,key,version,title,sector,pack_selections AS "packSelections",default_goal AS "defaultGoal",
            editable_keys AS "editableKeys",content_hash AS "contentHash"
     FROM public.action_mission_recipes WHERE status='published' ORDER BY sector,title,version DESC`,
  )
  return result.rows.map(mapRecipe)
}

export async function resolveMissionRecipe(client: Queryable, key: string, version: number): Promise<MissionRecipe> {
  const result = await client.query<Record<string, unknown>>(
    `SELECT id,key,version,title,sector,pack_selections AS "packSelections",default_goal AS "defaultGoal",
            editable_keys AS "editableKeys",content_hash AS "contentHash"
     FROM public.action_mission_recipes WHERE key=$1 AND version=$2 AND status='published' LIMIT 1`, [key, version],
  )
  const recipe = result.rows[0] ? mapRecipe(result.rows[0]) : null
  if (!recipe) throw new Error('mission_recipe_not_found')
  const canonical = { key: recipe.key, version: recipe.version, title: recipe.title, sector: recipe.sector, packSelections: recipe.packSelections, defaultGoal: recipe.defaultGoal, editableKeys: recipe.editableKeys }
  if (hashCanonical(canonical) !== recipe.contentHash) throw new Error('mission_recipe_hash_mismatch')
  for (const selection of recipe.packSelections) {
    const pack = await client.query<{ content_hash: string }>(
      `SELECT version.content_hash FROM public.action_pack_versions version JOIN public.action_packs pack ON pack.id=version.pack_id
       WHERE pack.key=$1 AND version.semantic_version=$2 AND version.status IN ('published','published_for_internal_pilot') LIMIT 1`,
      [selection.key, selection.version],
    )
    if (pack.rows[0]?.content_hash !== selection.contentHash) throw new Error('mission_recipe_pack_unavailable')
  }
  return recipe
}

function recipeDefinition(value: Omit<MissionRecipe, 'id' | 'contentHash'>): Omit<MissionRecipe, 'id'> {
  return { ...value, contentHash: hashCanonical(value) }
}

function mapRecipe(row: Record<string, unknown>): MissionRecipe {
  return {
    id: String(row.id), key: String(row.key), version: Number(row.version), title: String(row.title), sector: String(row.sector),
    packSelections: Array.isArray(row.packSelections) ? row.packSelections as MissionRecipe['packSelections'] : [],
    defaultGoal: row.defaultGoal && typeof row.defaultGoal === 'object' ? row.defaultGoal as Record<string, unknown> : {},
    editableKeys: Array.isArray(row.editableKeys) ? row.editableKeys.filter((item): item is string => typeof item === 'string') : [],
    contentHash: String(row.contentHash),
  }
}
