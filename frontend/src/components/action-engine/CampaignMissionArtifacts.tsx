import { ExternalLink, FileText, Gauge, Image, Link2, Megaphone, ShieldCheck, Target, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatBrl, formatMissionDate } from '@/lib/action-engine/missionRules'
import type { MissionArtifact } from '@/types/actionEngine'

type CampaignMissionArtifactsProps = {
  artifacts: MissionArtifact[]
  canWrite: boolean
  showTechnicalProof: boolean
  destinationHref?: (artifact: { kind: string; entityId?: string }) => string | undefined
}

export function CampaignMissionArtifacts({ artifacts, canWrite, showTechnicalProof, destinationHref }: CampaignMissionArtifactsProps) {
  const brief = byKind(artifacts, 'campaign_brief')
  const audience = byKind(artifacts, 'campaign_audience')
  const creatives = artifacts.filter(artifact => artifact.kind === 'campaign_creative')
  const landing = byKind(artifacts, 'campaign_landing_page')
  const form = byKind(artifacts, 'campaign_lead_form')
  const tracking = byKind(artifacts, 'campaign_tracking')
  const provider = byKind(artifacts, 'campaign_provider')
  const briefData = brief?.data ?? {}
  const providerData = provider?.data ?? {}
  const providerState = String(providerData.providerState ?? 'preparing')

  return (
    <section aria-labelledby="campaign-artifacts-title" className="border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700">Campaign Launch</p>
        <h2 id="campaign-artifacts-title" className="mt-1 font-semibold text-slate-950">Campanha preparada para revisão</h2>
        <p className="mt-1 text-xs text-slate-500">Estratégia, peças, captação, tracking e estado no provedor em uma única revisão.</p>
      </div>
      {!canWrite ? <p className="border-b border-blue-100 bg-blue-50 px-5 py-3 text-xs text-blue-800">Visualização somente leitura. A operação YUX controla publicação, orçamento e ativação.</p> : null}

      <div className="grid gap-px bg-slate-200 lg:grid-cols-3">
        <ArtifactSection icon={Megaphone} title="Brief e oferta" className="lg:col-span-2">
          <p className="text-lg font-semibold text-slate-950">{String(briefData.name ?? brief?.title ?? 'Campanha')}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{String(briefData.offer ?? 'Oferta aguardando definição.')}</p>
          <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
            <Fact label="Objetivo" value={humanize(String(briefData.objective ?? ''))} />
            <Fact label="Plataforma" value={providerLabel(String(briefData.platform ?? providerData.provider ?? ''))} />
            <Fact label="Orçamento diário" value={formatBrl(String(briefData.dailyBudgetBrl ?? providerData.dailyBudgetBrl ?? ''))} />
            <Fact label="Orçamento total" value={formatBrl(String(briefData.totalBudgetBrl ?? providerData.totalBudgetBrl ?? ''))} />
            <Fact label="Início" value={formatMissionDate(stringOrUndefined(briefData.startsAt ?? providerData.startsAt))} />
            <Fact label="Término" value={formatMissionDate(stringOrUndefined(briefData.endsAt ?? providerData.endsAt))} />
          </dl>
        </ArtifactSection>

        <ArtifactSection icon={Gauge} title="Estado no provedor">
          <p className={`inline-flex border px-2.5 py-1 text-xs font-semibold ${providerTone(providerState)}`}>{providerStateLabel(providerState)}</p>
          <p className="mt-3 text-xs leading-5 text-slate-600">A criação externa acontece pausada. A veiculação só começa depois da aprovação exata.</p>
          {providerData.providerReference ? <Fact label="Referência externa" value={String(providerData.providerReference)} mono={showTechnicalProof} /> : null}
          <Fact label="Aprovação de ativação" value={approvalLabel(String(providerData.activationApprovalStatus ?? 'not_requested'))} />
          {showTechnicalProof && providerData.activationSubjectHash ? <Fact label="Prova técnica" value={String(providerData.activationSubjectHash)} mono /> : null}
        </ArtifactSection>

        <ArtifactSection icon={Users} title="Público">
          <p className="text-sm leading-6 text-slate-700">{String(audience?.data.rationale ?? 'Segmentação fundamentada no ICP publicado.')}</p>
          <KeyValues value={record(audience?.data.targeting)} />
          {strings(audience?.data.exclusions).length ? <p className="mt-3 text-xs text-slate-500">Exclusões: {strings(audience?.data.exclusions).join(', ')}</p> : null}
        </ArtifactSection>

        <ArtifactSection icon={Image} title={`Criativos (${creatives.length})`} className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            {creatives.map(creative => (
              <article key={creative.key} className="border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{humanize(String(creative.data.format ?? 'peça'))}</p>
                <h4 className="mt-2 text-sm font-semibold text-slate-900">{String(creative.data.headline ?? creative.title)}</h4>
                <p className="mt-2 text-xs leading-5 text-slate-600">{String(creative.data.body ?? '')}</p>
              </article>
            ))}
          </div>
        </ArtifactSection>

        <ArtifactSection icon={Link2} title="Captação">
          <AssetLink icon={FileText} label="Landing page" artifact={landing} href={stringOrUndefined(landing?.data.previewUrl ?? tracking?.data.landing_page_url) ?? (landing?.entityId ? destinationHref?.(landing) : undefined)} />
          <AssetLink icon={Target} label="Formulário" artifact={form} href={form?.entityId ? destinationHref?.(form) : undefined} />
        </ArtifactSection>

        <ArtifactSection icon={ShieldCheck} title="Tracking" className="lg:col-span-2">
          <p className={`inline-flex border px-2.5 py-1 text-xs font-semibold ${tracking ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{tracking ? 'Plano de mensuração validado' : 'Tracking pendente'}</p>
          <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
            <Fact label="UTM source" value={String(tracking?.data.utm_source ?? '—')} mono={showTechnicalProof} />
            <Fact label="UTM medium" value={String(tracking?.data.utm_medium ?? '—')} mono={showTechnicalProof} />
            <Fact label="UTM campaign" value={String(tracking?.data.utm_campaign ?? '—')} mono={showTechnicalProof} />
            <Fact label="Conversão" value={String(tracking?.data.conversion_event ?? '—')} />
          </dl>
        </ArtifactSection>

        <ArtifactSection icon={ShieldCheck} title="Risco de ativação">
          <p className="text-sm leading-6 text-slate-700">Ativar inicia gasto real no provedor. Alterações de orçamento e nova ativação exigem outra decisão.</p>
          <p className="mt-3 text-xs font-semibold text-amber-800">Impacto: {creatives.length} criativo(s), 1 landing page, 1 formulário e mídia até {formatBrl(String(briefData.totalBudgetBrl ?? providerData.totalBudgetBrl ?? ''))}.</p>
        </ArtifactSection>
      </div>
    </section>
  )
}

function ArtifactSection({ icon: Icon, title, children, className = '' }: { icon: typeof Megaphone; title: string; children: ReactNode; className?: string }) {
  return <div className={`bg-white p-5 ${className}`}><div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Icon className="h-4 w-4 text-blue-600" />{title}</div><div className="mt-4">{children}</div></div>
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="mt-3 first:mt-0"><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</dt><dd className={`mt-1 break-all text-xs text-slate-700 ${mono ? 'font-mono' : 'font-medium'}`}>{value || '—'}</dd></div>
}

function KeyValues({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value)
  if (!entries.length) return null
  return <dl className="mt-4 space-y-2">{entries.slice(0, 6).map(([key, item]) => <Fact key={key} label={humanize(key)} value={Array.isArray(item) ? item.join(', ') : String(item)} />)}</dl>
}

function AssetLink({ icon: Icon, label, artifact, href }: { icon: typeof FileText; label: string; artifact?: MissionArtifact; href?: string }) {
  const content = <><Icon className="h-4 w-4 text-blue-600" /><span><strong className="block text-xs text-slate-900">{label}</strong><span className="text-xs text-slate-500">{artifact ? `${artifact.title} · ${statusLabel(artifact.status)}` : 'Aguardando rascunho'}</span></span>{href ? <ExternalLink className="ml-auto h-3.5 w-3.5 text-slate-400" /> : null}</>
  return href
    ? <a className="mb-2 flex items-center gap-3 border border-slate-200 p-3 hover:border-blue-300" href={href} target="_blank" rel="noreferrer">{content}</a>
    : <div className="mb-2 flex items-center gap-3 border border-slate-200 p-3">{content}</div>
}

function byKind(artifacts: MissionArtifact[], kind: MissionArtifact['kind']) { return artifacts.find(artifact => artifact.kind === kind) }
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [] }
function stringOrUndefined(value: unknown) { return typeof value === 'string' && value ? value : undefined }
function humanize(value: string) { return value.replace(/_/g, ' ').replace(/^./, (letter: string) => letter.toUpperCase()) || '—' }
function providerLabel(value: string) { return value.toLowerCase() === 'meta' ? 'Meta Ads' : value.toLowerCase() === 'google' ? 'Google Ads' : value || '—' }
function statusLabel(value: MissionArtifact['status']) { return value === 'published' ? 'publicado' : value === 'draft' ? 'rascunho' : 'proposto' }
function providerStateLabel(value: string) { return value === 'active' ? 'Ativa' : value === 'provider_paused' || value === 'paused' ? 'Criada e pausada' : 'Em preparação' }
function providerTone(value: string) { return value === 'active' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : value.includes('paused') ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-700' }
function approvalLabel(value: string) { return value === 'approved' ? 'Aprovada' : value === 'pending' ? 'Aguardando sua decisão' : 'Ainda não solicitada' }
