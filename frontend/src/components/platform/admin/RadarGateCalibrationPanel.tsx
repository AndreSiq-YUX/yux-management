import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { radarService } from '@/services/radarService';
import type { RadarCandidateRecord } from '@/types/radar';
import type { RadarCampaignFunnelConfiguration, RadarGateCalibrationRow, RadarGateEvaluationReport } from '@/types/radarFunnel';
type Label = 'primary' | 'secondary' | 'outside' | 'doubt';
const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';
const money = (amount: string | null | undefined) => amount == null ? 'indisponível' : Number(amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 6 });
export function RadarGateCalibrationPanel({ organizationId, campaignId, configuration, onChanged }: { organizationId: string; campaignId: string; configuration: RadarCampaignFunnelConfiguration; onChanged: (message: string) => void }) {
    const id = useId(), active = useRef(true), sending = useRef(false);
    const [companies, setCompanies] = useState<RadarCandidateRecord[]>([]), [calibrations, setCalibrations] = useState<RadarGateCalibrationRow[]>([]);
    const [labels, setLabels] = useState<Record<string, Label | ''>>({}), [gate, setGate] = useState<'g1' | 'g5'>('g1');
    const [report, setReport] = useState<RadarGateEvaluationReport | null>(null), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const [revokeReason,setRevokeReason]=useState('');
    useEffect(() => {
        active.current = true;
        Promise.all([radarService.getCandidates(campaignId), radarService.listGateCalibrations(organizationId, campaignId)]).then(([items, rows]) => { if (active.current) { setCompanies(items); setCalibrations(rows); } }).catch(() => { if (active.current) setError('Não foi possível carregar os casos de calibração.'); });
        return () => { active.current = false; };
    }, [organizationId, campaignId]);
    async function loadReport(calibrationId: string) {
        setConsent(false); setError('');
        try { const next = await radarService.getGateCalibrationReport(organizationId, campaignId, calibrationId); if (active.current) setReport(next); }
        catch { if (active.current) setError('Não foi possível carregar o relatório.'); }
    }
    async function create() {
        const route = configuration.routes[gate]; if (!route?.enabled || sending.current) return;
        const selected = Object.entries(labels).filter((entry): entry is [string, Label] => !!entry[1]).map(([candidateId, label]) => ({ candidateId, label }));
        if (!selected.length) { setError('Rotule manualmente as empresas antes de preparar o conjunto.'); return; }
        sending.current = true; setBusy(true); setError('');
        try {
            const result = await radarService.createGateCalibration({ organizationId, campaignId, configurationRevision: configuration.configurationRevision, gate, expectedFingerprint: route.fingerprint, labels: selected });
            if (!active.current) return;
            setCalibrations(await radarService.listGateCalibrations(organizationId, campaignId)); await loadReport(result.id);
            onChanged('Conjunto preparado sem chamadas pagas. A divisão de ajuste e teste independente foi congelada.');
        } catch { if (active.current) setError('Não foi possível preparar. Confira a rota, os rótulos e a revisão da campanha.'); }
        finally { sending.current = false; if (active.current) setBusy(false); }
    }
    async function evaluate() {
        if (!report || !consent || report.price?.amountBrl == null || sending.current) return;
        sending.current = true; setBusy(true); setError('');
        const input = { organizationId, campaignId, calibrationId: report.calibration.id, confirmPaid: true as const, expectedFingerprint: report.calibration.binding.routeFingerprint, expectedPolicyVersion: report.policyVersion, approvedUnitPriceBrl: report.price.amountBrl };
        try {
            for (let index = 0; index < report.total && active.current; index++) {
                const result = await radarService.runGateEvaluation(input);
                if (!active.current) break;
                const next = await radarService.getGateCalibrationReport(organizationId, campaignId, report.calibration.id); if (active.current) setReport(next);
                if (result.done || result.running) break;
            }
            if (active.current) onChanged('Avaliação atualizada. Respostas incertas não são repetidas; confira o relatório antes de aprovar.');
        } catch { if (active.current) setError('Avaliação interrompida. Os casos e recibos foram salvos; atualizar o relatório não consome créditos.'); }
        finally { sending.current = false; if (active.current) { setBusy(false); setConsent(false); } }
    }
    async function approve() {
        if (!report?.metrics.approvable || busy) return;
        setBusy(true); setError('');
        try { await radarService.approveGateCalibration({ organizationId, campaignId, calibrationId: report.calibration.id, confirmApproval: true }); await loadReport(report.calibration.id); if (active.current) { setCalibrations(await radarService.listGateCalibrations(organizationId, campaignId)); onChanged('Calibração aprovada para esta campanha e este modelo. A aplicação ainda precisa ser selecionada e salva na política.'); } }
        catch { if (active.current) setError('Aprovação recusada. Modelo, público, versão, pisos e teste independente precisam permanecer válidos.'); }
        finally { if (active.current) setBusy(false); }
    }
    async function revoke(){
        if(!report||busy||revokeReason.trim().length<3)return;
        setBusy(true);setError('');
        try{await radarService.revokeGateCalibration({organizationId,campaignId,calibrationId:report.calibration.id,reason:revokeReason});await loadReport(report.calibration.id);if(active.current){setCalibrations(await radarService.listGateCalibrations(organizationId,campaignId));setRevokeReason('');onChanged('Calibração suspensa. Novas decisões voltam à observação até nova aprovação compatível.')}}catch{if(active.current)setError('Não foi possível suspender a calibração.')}finally{if(active.current)setBusy(false)}
    }
    return <Card><CardHeader><CardTitle>Calibração da campanha</CardTitle><CardDescription>Rótulos são humanos, nunca inferidos automaticamente. O conjunto e o teste independente ficam congelados. Nenhuma avaliação é executada ao abrir este painel.</CardDescription></CardHeader><CardContent className="space-y-4">
        <Field><FieldLabel htmlFor={`${id}-gate`}>Etapa a avaliar</FieldLabel><select id={`${id}-gate`} className={selectClass} disabled={busy} value={gate} onChange={event => setGate(event.target.value as 'g1' | 'g5')}><option value="g1">Triagem cadastral</option><option value="g5">Aderência após identificação</option></select></Field>
        <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">Revisar e rotular empresas ({Object.values(labels).filter(Boolean).length} selecionadas)</summary><div className="mt-3 max-h-96 space-y-3 overflow-auto">{companies.map(company => <Field key={company.id}><FieldLabel htmlFor={`${id}-${company.id}`}>{company.title}</FieldLabel><select id={`${id}-${company.id}`} className={selectClass} disabled={busy} value={labels[company.id] ?? ''} onChange={event => setLabels(current => ({ ...current, [company.id]: event.target.value as Label | '' }))}><option value="">Não revisada — não incluir</option><option value="primary">Aderente ao perfil principal</option><option value="secondary">Aderente ao perfil secundário</option><option value="outside">Fora do perfil</option><option value="doubt">Duvidosa — não usar para aprovar bloqueio</option></select></Field>)}</div></details>
        <Button type="button" variant="outline" disabled={busy || !configuration.routes[gate]?.enabled} onClick={create}>Preparar avaliação sem executar</Button>
        <div className="space-y-2">{calibrations.map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"><span>{row.gate === 'g1' ? 'Triagem' : 'Aderência'} · {row.status} · {row.dataset.length} empresas</span><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => loadReport(row.id)}>Ver relatório</Button></div>)}</div>
        {report && <section aria-label="Relatório da calibração" className="space-y-3 rounded-md border p-4"><p className="font-medium">{report.completed} de {report.total} casos concluídos</p><p className="text-sm">Estimativa por caso: {money(report.price?.amountBrl)}. Restante estimado: {money(report.totalEstimatedBrl)}. Cobranças sem valor conhecido: {report.unknownCosts}.</p>
            <p className="text-sm">Teste independente: {report.metrics.holdout.positives} aderentes, {report.metrics.holdout.negatives} fora do perfil; {report.metrics.holdout.falseBlocks} falsos bloqueios. Precisão: {(report.metrics.holdout.blockPrecision * 100).toFixed(1)}%. Cobertura: {(report.metrics.holdout.blockRecall * 100).toFixed(1)}%.</p>
            <p className="text-sm">{report.metrics.approvable ? 'Os mínimos estatísticos foram atendidos; a aprovação ainda confere a compatibilidade do modelo.' : `Ainda não aprovável: ${report.metrics.reasons.join(', ')}.`}</p>{report.metrics.warnings.length > 0 && <p className="text-sm text-muted-foreground">Base independente pequena: o resultado não garante a mesma precisão em produção.</p>}
            <Field orientation="horizontal"><input id={`${id}-consent`} type="checkbox" disabled={busy || report.done} checked={consent} onChange={event => setConsent(event.target.checked)} /><FieldLabel htmlFor={`${id}-consent`}>Autorizo avaliar os casos pendentes pelos valores estimados acima</FieldLabel><FieldDescription>Sem repetir chamadas incertas. Fechar o painel pausa o envio dos próximos casos; a chamada em curso mantém seu recibo.</FieldDescription></Field>
            <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy || !consent || report.done || report.price?.amountBrl == null} onClick={evaluate}>Executar avaliação autorizada</Button><Button type="button" variant="outline" disabled={busy} onClick={() => loadReport(report.calibration.id)}>Atualizar relatório sem chamadas</Button><Button type="button" variant="outline" disabled={busy || !report.done || !report.metrics.approvable || report.calibration.status !== 'draft'} onClick={approve}>Aprovar calibração da campanha</Button></div>
            {report.calibration.status==='approved'&&<Field><FieldLabel htmlFor={`${id}-revoke`}>Motivo para suspender esta calibração</FieldLabel><Input id={`${id}-revoke`} maxLength={500} disabled={busy} value={revokeReason} onChange={event=>setRevokeReason(event.target.value)}/><Button type="button" variant="outline" disabled={busy||revokeReason.trim().length<3} onClick={revoke}>Suspender calibração</Button></Field>}
            <details><summary className="cursor-pointer text-sm">Pendências por empresa</summary><ul className="mt-2 space-y-1 text-sm">{report.cases.map(item => <li key={item.candidateId}>{companies.find(company => company.id === item.candidateId)?.title ?? item.candidateId}: {item.status}{item.errorCode ? ` · ${item.errorCode}` : ''}</li>)}</ul></details>
        </section>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </CardContent></Card>;
}
