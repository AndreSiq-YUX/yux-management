import { useEffect, useState } from 'react'
import { CheckCircle2, Database, Loader2, Sparkles } from 'lucide-react'
import { actionEngineService } from '@/services/actionEngineService'
import type { MissionRecipe, SandboxSeedManifest } from '@/types/actionEngine'

export function MissionRecipePicker({ organizationId, canWrite, selectedKey, onSelect }: {
  organizationId: string; canWrite: boolean; selectedKey?: string; onSelect: (recipe: MissionRecipe) => void
}) {
  const [recipes, setRecipes] = useState<MissionRecipe[]>([])
  const [seedConsent, setSeedConsent] = useState<Record<string, boolean>>({})
  const [seeding, setSeeding] = useState<string>()
  const [manifest, setManifest] = useState<SandboxSeedManifest>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    let active = true
    actionEngineService.listRecipes(organizationId).then(value => { if (active) setRecipes(value) }).catch(() => { if (active) setRecipes([]) })
    return () => { active = false }
  }, [organizationId])

  async function seed(recipe: MissionRecipe) {
    if (!canWrite || !seedConsent[recipe.key]) return
    setSeeding(recipe.key); setError(undefined)
    try { setManifest(await actionEngineService.seedRecipeSandbox(organizationId, recipe)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível criar os dados demo.') }
    finally { setSeeding(undefined) }
  }

  if (recipes.length === 0) return null
  return <section aria-label="Receitas de missão" className="space-y-3">
    <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-700">Comece com uma receita</p><p className="mt-1 text-sm text-slate-600">Configurações versionadas e revisáveis, já fundamentadas em um Action Pack.</p></div>
    <div className="grid gap-3 sm:grid-cols-2">{recipes.map(recipe => <article key={`${recipe.key}:${recipe.version}`} className={`border p-4 ${selectedKey === recipe.key ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
      <button type="button" className="w-full text-left" onClick={() => onSelect(recipe)}><span className="flex items-start gap-3"><Sparkles className="mt-0.5 h-5 w-5 text-blue-600" /><span><span className="block text-sm font-semibold text-slate-950">{recipe.title}</span><span className="mt-1 block text-xs text-slate-600">{recipe.sector === 'real_estate' ? 'Imobiliário' : recipe.sector} · versão {recipe.version}</span></span></span></button>
      <div className="mt-4 border-t border-slate-200 pt-3"><label className="flex gap-2 text-xs leading-5 text-slate-600"><input type="checkbox" checked={Boolean(seedConsent[recipe.key])} onChange={event => setSeedConsent(current => ({ ...current, [recipe.key]: event.target.checked }))} />Autorizo criar dados demo descartáveis e claramente identificados neste workspace.</label><button type="button" disabled={!canWrite || !seedConsent[recipe.key] || seeding === recipe.key} onClick={() => void seed(recipe)} className="mt-2 inline-flex min-h-9 items-center gap-2 border border-slate-300 px-3 text-xs font-semibold text-slate-700 disabled:opacity-40">{seeding === recipe.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}Criar ambiente demo</button></div>
    </article>)}</div>
    {manifest ? <p className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Ambiente demo pronto com {manifest.itemCount} registros. Repetir esta ação não duplica dados.</p> : null}
    {error ? <p role="alert" className="border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p> : null}
  </section>
}
