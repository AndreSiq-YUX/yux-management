import { createHash } from 'node:crypto'

type JsonRecord = Record<string, unknown>

export function resolvePlanInputBindings(input: unknown, context: {
  resolvedParameters: JsonRecord
  outputsByStep: Record<string, JsonRecord>
  validation?: boolean
}): unknown {
  if (Array.isArray(input)) return input.map(item => resolvePlanInputBindings(item, context))
  if (typeof input === 'string') return resolveReference(input, context)
  if (!input || typeof input !== 'object') return input
  const source = input as JsonRecord
  const artifactRef = typeof source.artifactRef === 'string' ? source.artifactRef : null
  const artifact = artifactRef ? resolveReference(artifactRef, context) : {}
  if (artifactRef && (!artifact || typeof artifact !== 'object' || Array.isArray(artifact))) throw new Error('mission_plan_artifact_reference_invalid')
  const result: JsonRecord = artifactRef ? { ...(artifact as JsonRecord) } : {}
  for (const [key, value] of Object.entries(source)) {
    if (key !== 'artifactRef') result[key] = resolvePlanInputBindings(value, context)
  }
  return result
}

export function collectPlanInputBindingSteps(input: unknown): string[] {
  const found = new Set<string>()
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit)
    if (typeof value === 'string' && value.startsWith('binding:')) {
      const reference = value.slice('binding:'.length)
      const marker = reference.lastIndexOf('.')
      if (marker > 0) found.add(reference.slice(0, marker))
      return
    }
    if (value && typeof value === 'object') Object.values(value as JsonRecord).forEach(visit)
  }
  visit(input)
  return [...found]
}

function resolveReference(value: string, context: { resolvedParameters: JsonRecord; outputsByStep: Record<string, JsonRecord>; validation?: boolean }): unknown {
  if (value.startsWith('resolvedParameters.')) {
    const resolved = readPath(context.resolvedParameters, value.slice('resolvedParameters.'.length))
    if (resolved === undefined) throw new Error('mission_plan_artifact_reference_missing')
    return resolved
  }
  if (!value.startsWith('binding:')) return value
  const reference = value.slice('binding:'.length)
  const stepKey = Object.keys(context.outputsByStep).sort((left, right) => right.length - left.length).find(key => reference.startsWith(`${key}.`))
  if (stepKey) {
    const resolved = readPath(context.outputsByStep[stepKey]!, reference.slice(stepKey.length + 1))
    if (resolved !== undefined) return resolved
  }
  if (context.validation) {
    if (reference.endsWith('contentHash')) return createHash('sha256').update(reference).digest('hex')
    const suffix = createHash('sha256').update(reference).digest('hex').slice(0, 12)
    return `00000000-0000-4000-8000-${suffix}`
  }
  throw new Error('mission_plan_output_binding_unresolved')
}

function readPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (Array.isArray(current) && /^\d+$/.test(segment)) return current[Number(segment)]
    if (current && typeof current === 'object') return (current as JsonRecord)[segment]
    return undefined
  }, value)
}
