import { clampPercent } from '@/components/portal-ui'

/**
 * Progresso de uma missão em relação à meta de receita: valor produzido / meta, limitado a 0–100.
 * Devolve `null` quando falta o valor produzido ou a meta (não inventamos progresso).
 */
export function missionGoalProgress(producedValueBrl?: string | null, targetRevenueBrl?: string | null): number | null {
  if (producedValueBrl === undefined || producedValueBrl === null || producedValueBrl === '') return null
  if (targetRevenueBrl === undefined || targetRevenueBrl === null || targetRevenueBrl === '') return null
  const produced = Number(producedValueBrl)
  const target = Number(targetRevenueBrl)
  if (!Number.isFinite(produced) || !Number.isFinite(target) || target <= 0) return null
  return clampPercent((produced / target) * 100)
}
