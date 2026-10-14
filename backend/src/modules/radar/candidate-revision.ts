export function isRadarCandidateCurrentRevision(payload: Record<string, unknown>, revision: number): boolean {
  if (!Number.isInteger(revision) || revision < 1) return false
  return [payload.discoveryRevision ?? 1, payload.researchRevision].some(value =>
    typeof value === 'number' && Number.isInteger(value) && value > 0 && value === revision)
}
