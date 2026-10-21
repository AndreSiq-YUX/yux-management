import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { radarService } from '@/services/radarService';
import type { RadarCampaignFunnelConfiguration, RadarFunnelPolicy, RadarGateCriteria } from '@/types/radarFunnel';
import { RadarGateCalibrationPanel } from './RadarGateCalibrationPanel';
import { RadarFunnelReportPanel } from './RadarFunnelReportPanel';

const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';
const criteriaLabels: Record<keyof RadarGateCriteria, string> = {
    minPositiveSamples: 'Aderentes rotuladas (mínimo)', minNegativeSamples: 'Fora do perfil rotuladas (mínimo)', holdoutShare: 'Fração reservada ao teste independente', minHoldoutPositives: 'Aderentes no teste (mínimo)', minHoldoutNegatives: 'Fora do perfil no teste (mínimo)', maxFalseBlocksOnPositives: 'Falsos bloqueios permitidos', minBlockPrecision: 'Precisão mínima de bloqueio', minBlockRecall: 'Cobertura mínima de bloqueio', thresholdMargin: 'Margem acima dos positivos de ajuste', minThreshold: 'Limiar mínimo', auditSampleRate: 'Amostra inicial para auditoria', auditSampleRateSteady: 'Amostra permanente para auditoria', autoShadowOnReversedAudits: 'Reversões que suspendem a aplicação', autoShadowOnReopenRate: 'Taxa de reabertura que suspende a aplicação',
};
export function RadarCampaignFunnelPanel({ isSystemAdmin, organizationId, campaignId }: { isSystemAdmin: boolean; organizationId: string; campaignId: string }) {
    const id = useId();
    const [data, setData] = useState<RadarCampaignFunnelConfiguration | null>(null), [busy, setBusy] = useState(false);
    const [error, setError] = useState(''), [message, setMessage] = useState(''), [closeConsent, setCloseConsent] = useState(false);
    useEffect(() => {
        let active = true; setData(null); setError(''); setMessage('');
        if (!isSystemAdmin) return;
        radarService.getCampaignFunnel(organizationId, campaignId).then(value => { if (active) setData(value); }).catch(() => { if (active) setError('Não foi possível carregar o funil desta campanha.'); });
        return () => { active = false; };
    }, [isSystemAdmin, organizationId, campaignId]);
    const change = (update: (policy: RadarFunnelPolicy) => RadarFunnelPolicy) => setData(current => current ? { ...current, policy: update(current.policy) } : current);
    async function save() {
        if (!data || !isSystemAdmin || busy) return;
        setBusy(true); setError(''); setMessage('');
        try {
            setData(await radarService.saveCampaignFunnel({ organizationId, campaignId, configurationRevision: data.configurationRevision, expectedPolicyVersion: data.policyVersion, policy: data.policy, batch: data.batch, evidence: data.evidence }));
            setMessage('Política salva. Ativar o funil não inicia pesquisas e não configura os modelos.');
        } catch (cause) { setError(`Não foi possível salvar. Confirme a calibração e o encerramento dos lotes antigos. ${cause instanceof Error ? cause.message : ''}`); }
        finally { setBusy(false); }
    }
    async function closeLegacy() {
        if (!data || !closeConsent || busy) return;
        setBusy(true); setError(''); setMessage('');
        try {
            const result = await radarService.closeLegacyResearch({ organizationId, campaignId, configurationRevision: data.configurationRevision, confirmClose: true });
            setCloseConsent(false); setMessage(`${result.closedLots} lotes encerrados como histórico. Empresas, evidências e recibos foram preservados. Uma nova rodada não refará a descoberta cadastral.`);
        } catch { setError('Não foi possível encerrar. Aguarde as execuções ativas; este controle não interrompe chamadas em andamento.'); }
        finally { setBusy(false); }
    }
    if (!isSystemAdmin) return null;
    return <section aria-label="Funil administrativo da campanha" className="space-y-4">
        <Card><CardHeader><CardTitle>Funil de pesquisa — Admin YUX</CardTitle><CardDescription>Controles técnicos desta campanha. Observação apenas registra resultados; aplicação exige calibração compatível com o modelo e com este público.</CardDescription></CardHeader>
            <CardContent className="space-y-5">{!data ? <p role="status">Carregando configuração…</p> : <>
                <Field orientation="horizontal"><input id={`${id}-enabled`} type="checkbox" checked={data.policy.enabled} disabled={busy} onChange={event => change(policy => ({ ...policy, enabled: event.target.checked }))} /><FieldLabel htmlFor={`${id}-enabled`}>Usar o novo funil nesta campanha</FieldLabel></Field>
                <FieldGroup className="grid gap-4 md:grid-cols-2">{(['g0', 'g1', 'g3', 'g5'] as const).map(gate => <Field key={gate}>
                    <FieldLabel htmlFor={`${id}-${gate}`}>{{ g0: 'Regras cadastrais', g1: 'Triagem cadastral por decisão', g3: 'Escolha da próxima ação', g5: 'Aderência após identificação' }[gate]}</FieldLabel>
                    <select id={`${id}-${gate}`} className={selectClass} value={data.policy[gate].mode} disabled={busy} onChange={event => change(policy => ({ ...policy, [gate]: { ...policy[gate], mode: event.target.value } } as RadarFunnelPolicy))}>
                        <option value="off">Desligado</option>{(gate === 'g1' || gate === 'g5') && <option value="shadow">Observação (sem interferir)</option>}<option value={gate === 'g3' ? 'effective' : 'enforce'}>Aplicar decisões</option>
                    </select>{gate !== 'g0' && <FieldDescription>{data.routes[gate]?.enabled ? `Rota disponível: ${data.routes[gate]!.models.map(model => model.modelName).join(' → ')}` : 'Configure e autorize uma rota no painel de modelos antes do teste.'}</FieldDescription>}
                </Field>)}</FieldGroup>
                <FieldGroup className="grid gap-4 md:grid-cols-2"><Field><FieldLabel htmlFor={`${id}-agent`}>Investigação aprofundada (Perplexity Agent)</FieldLabel><select id={`${id}-agent`} className={selectClass} value={data.policy.agentPolicy.mode} disabled={busy} onChange={event => change(policy => ({ ...policy, agentPolicy: { ...policy.agentPolicy, mode: event.target.value as 'off' | 'escalation' } }))}><option value="off">Desligada</option><option value="escalation">Escalada conforme lacunas e orçamento</option></select></Field>
                    <Field><FieldLabel htmlFor={`${id}-timing`}>Momento da escalada</FieldLabel><select id={`${id}-timing`} className={selectClass} value={data.policy.agentPolicy.timing} disabled={busy} onChange={event => change(policy => ({ ...policy, agentPolicy: { ...policy.agentPolicy, timing: event.target.value as RadarFunnelPolicy['agentPolicy']['timing'] } }))}><option value="after_first_cheap_attempt">Após a primeira tentativa barata sem candidato</option><option value="immediately_when_no_site_candidate">Logo após a pista do e-mail, se não houver candidato</option></select></Field>
                    <Field><FieldLabel htmlFor={`${id}-short`}>Buscas na investigação curta</FieldLabel><Input id={`${id}-short`} type="number" min={1} step={1} disabled={busy} value={data.policy.weakFitBudget.maxCheapSearches} onChange={event => change(policy => ({ ...policy, weakFitBudget: { ...policy.weakFitBudget, maxCheapSearches: Number(event.target.value) } }))} /><FieldDescription>Aplicável somente a baixa aderência calibrada. Não permite Agent.</FieldDescription></Field>
                    <Field><FieldLabel htmlFor={`${id}-replenish`}>Páginas extras para reposição</FieldLabel><Input id={`${id}-replenish`} type="number" min={0} step={1} disabled={busy} value={data.batch.maxReplenishmentPages} onChange={event => setData({ ...data, batch: { ...data.batch, maxReplenishmentPages: Number(event.target.value) } })} /></Field>
                    <Field><FieldLabel htmlFor={`${id}-basis`}>Base de reposição</FieldLabel><select id={`${id}-basis`} className={selectClass} value={data.batch.replenishmentBasis} disabled={busy} onChange={event => setData({ ...data, batch: { ...data.batch, replenishmentBasis: event.target.value as 'initial_triage' | 'final_fit' } })}><option value="initial_triage">Passaram pela triagem inicial</option><option value="final_fit">Aderência confirmada ao final</option></select></Field>
                    <Field><FieldLabel htmlFor={`${id}-pages`}>Páginas enviadas à qualificação</FieldLabel><Input id={`${id}-pages`} type="number" min={1} max={10} disabled={busy} value={data.evidence.maxPages} onChange={event => setData({ ...data, evidence: { ...data.evidence, maxPages: Number(event.target.value) } })} /></Field>
                    <Field><FieldLabel htmlFor={`${id}-chars`}>Caracteres por página na qualificação</FieldLabel><Input id={`${id}-chars`} type="number" min={500} max={12000} step={500} disabled={busy} value={data.evidence.maxChars} onChange={event => setData({ ...data, evidence: { ...data.evidence, maxChars: Number(event.target.value) } })} /></Field>
                </FieldGroup>
                {(['primary', 'secondary'] as const).map(priority => <FieldGroup key={priority} className="grid gap-4 md:grid-cols-2"><Field orientation="horizontal"><input id={`${id}-priority-${priority}`} type="checkbox" disabled={busy} checked={data.policy.agentPolicy.priorities.includes(priority)} onChange={event => change(policy => ({ ...policy, agentPolicy: { ...policy.agentPolicy, priorities: event.target.checked ? [...new Set([...policy.agentPolicy.priorities, priority])] : policy.agentPolicy.priorities.filter(item => item !== priority) } }))} /><FieldLabel htmlFor={`${id}-priority-${priority}`}>Agent para perfil {priority === 'primary' ? 'principal' : 'secundário'}</FieldLabel></Field><Field><FieldLabel htmlFor={`${id}-depth-${priority}`}>Profundidade do perfil {priority === 'primary' ? 'principal' : 'secundário'}</FieldLabel><select id={`${id}-depth-${priority}`} className={selectClass} value={data.policy.depthByPriority[priority]} disabled={busy} onChange={event => change(policy => ({ ...policy, depthByPriority: { ...policy.depthByPriority, [priority]: event.target.value } as RadarFunnelPolicy['depthByPriority'] }))}><option value="full">Completa</option><option value="standard">Padrão</option></select></Field></FieldGroup>)}
                {(['g1', 'g5'] as const).map(gate => <details key={gate} className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">Calibração e auditoria — {gate === 'g1' ? 'triagem cadastral' : 'aderência após identificação'}</summary><FieldGroup className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{(Object.keys(criteriaLabels) as Array<keyof RadarGateCriteria>).map(key => <Field key={key}><FieldLabel htmlFor={`${id}-${gate}-${key}`}>{criteriaLabels[key]}</FieldLabel><Input id={`${id}-${gate}-${key}`} type="number" step={/Share|Rate|Threshold|Precision|Recall|Margin/.test(key) ? '.01' : '1'} disabled={busy || key === 'maxFalseBlocksOnPositives'} value={data.policy[gate].criteria[key]} onChange={event => change(policy => ({ ...policy, [gate]: { ...policy[gate], criteria: { ...policy[gate].criteria, [key]: Number(event.target.value) } } }))} /></Field>)}</FieldGroup></details>)}
                <Button type="button" disabled={busy} onClick={save}>Salvar política do funil</Button>
                {!data.policy.enabled && <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">Preparar a transição dos lotes antigos</summary><p className="my-3 text-sm text-muted-foreground">Encerra lotes antigos como histórico parcial, sem apagar dados ou repetir cobranças. Execuções em andamento devem terminar primeiro.</p><Field orientation="horizontal"><input id={`${id}-close`} type="checkbox" checked={closeConsent} disabled={busy} onChange={event => setCloseConsent(event.target.checked)} /><FieldLabel htmlFor={`${id}-close`}>Confirmo encerrar o acompanhamento antigo, preservando o histórico</FieldLabel></Field><Button type="button" variant="outline" className="mt-3" disabled={!closeConsent || busy} onClick={closeLegacy}>Encerrar lotes antigos</Button></details>}
            </>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}</CardContent>
        </Card>
        {data && <RadarGateCalibrationPanel key={`${organizationId}:${campaignId}`} organizationId={organizationId} campaignId={campaignId} configuration={data} onChanged={value => setMessage(value)} />}
        {data && <RadarFunnelReportPanel key={`report:${organizationId}:${campaignId}:${data.policyVersion}`} organizationId={organizationId} campaignId={campaignId}/>}
    </section>;
}
