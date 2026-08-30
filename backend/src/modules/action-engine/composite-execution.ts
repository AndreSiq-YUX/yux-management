import type { Queryable } from './repository.js'

export type PersistedArtifactBinding = {
  artifact_key: string
  output_path: string
  input_key: string
  schema_version: number
  source_output: Record<string, unknown>
}

export async function resolveCompositeActionInput(client: Queryable, input: {
  organizationId: string
  planId: string
  targetStepKey: string
  currentInput: Record<string, unknown>
}): Promise<Record<string, unknown>> {
  const rows = await client.query<PersistedArtifactBinding>(
    `SELECT binding.artifact_key,binding.output_path,binding.input_key,binding.schema_version,source_run.output AS source_output
     FROM public.action_plan_artifact_bindings binding
     JOIN public.action_plan_steps source_step ON source_step.plan_id=binding.plan_id
       AND source_step.step_key=binding.from_pack_key||'.'||binding.from_step_key
     JOIN public.action_runs source_run ON source_run.plan_step_id=source_step.id AND source_run.status='succeeded'
     WHERE binding.organization_id=$1 AND binding.plan_id=$2
       AND binding.to_pack_key||'.'||binding.to_step_key=$3
     ORDER BY binding.artifact_key,binding.input_key`,
    [input.organizationId,input.planId,input.targetStepKey],
  )
  return materializeArtifactBindings(input.currentInput, rows.rows)
}

export function materializeArtifactBindings(currentInput: Record<string, unknown>, bindings: PersistedArtifactBinding[]): Record<string, unknown> {
  const output = structuredClone(currentInput)
  for (const binding of bindings) {
    if (!binding.artifact_key.trim() || binding.schema_version < 1) throw new Error('mission_composite_artifact_schema_invalid')
    const contentHash = read(binding.source_output, 'output.contentHash') ?? read(binding.source_output, 'contentHash')
    if (typeof contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(contentHash)) throw new Error('mission_composite_artifact_hash_invalid')
    const value = read(binding.source_output, binding.output_path) ?? read(binding.source_output, `output.${binding.output_path}`)
    if (value === undefined) throw new Error('mission_composite_artifact_output_missing')
    write(output, binding.input_key, value)
  }
  return output
}

function read(value: unknown, path: string): unknown { return path.split('.').reduce<unknown>((current,key)=>current&&typeof current==='object'?Reflect.get(current,key):undefined,value) }
function write(target:Record<string,unknown>,path:string,value:unknown){const keys=path.split('.').filter(Boolean);if(!keys.length)throw new Error('mission_composite_binding_input_invalid');let current=target;for(const key of keys.slice(0,-1)){const next=current[key];if(next&&typeof next==='object'&&!Array.isArray(next))current=next as Record<string,unknown>;else{const created:Record<string,unknown>={};current[key]=created;current=created}}current[keys.at(-1)!]=value}
