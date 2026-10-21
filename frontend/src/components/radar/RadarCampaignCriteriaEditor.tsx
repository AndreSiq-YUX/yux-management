import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldLabel, FieldDescription, FieldGroup } from '@/components/ui/field';
import { radarService } from '@/services/radarService';
import type { RadarCommercialCampaign } from '@/types/radarCommercial';

type InputData = Parameters<typeof radarService.saveCommercialCriteria>[1];
type Target = InputData['targets'][number];
const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';
const terms = (value: string) => [...new Set(value.split(/[,;\n]/).map(item => item.trim()).filter(Boolean))];
function codes(value: string, minimum = 2) {
    const values = terms(value).map(value => value.replace(/\D/g, ''));
    if (values.some(value => !new RegExp(`^\\d{${minimum},7}$`).test(value))) throw Error(minimum === 7 ? 'Informe CNAEs alvo completos, com sete dígitos.' : 'Informe códigos ou prefixos de CNAE de dois a sete dígitos.');
    return [...new Set(values)];
}
export function RadarCampaignCriteriaEditor({ campaign, canEdit, onSaved }: { campaign: RadarCommercialCampaign; canEdit: boolean; onSaved: () => void }) {
    const id = useId(), criteria = campaign.criteria;
    const [loadedRevision,setLoadedRevision]=useState(campaign.configurationRevision??1);
    const stale=(campaign.configurationRevision??1)>loadedRevision;
    const [targets, setTargets] = useState<Array<Target & { codesText: string }>>(() => (criteria.targets ?? []).map((target, index) => ({ key: target.key ?? `target_${index}`, label: target.label ?? '', definition: target.definition ?? '', priority: target.priority ?? 'primary', cnaes: target.cnaes ?? [], codesText: target.cnaes?.join('\n') ?? '' })));
    const [targetCodes, setTargetCodes] = useState(campaign.targetCnaes?.join('\n') ?? ''), [blockedCodes, setBlockedCodes] = useState(criteria.registry?.blockedMainCnaes?.join('\n') ?? '');
    const [names, setNames] = useState([...new Set([...(criteria.excludedNameTerms ?? []), ...(criteria.registry?.blockedNameTerms ?? [])])].join('\n')), [outside, setOutside] = useState(criteria.outOfScopeExamples?.join('\n') ?? '');
    const [mainRule, setMainRule] = useState<InputData['registry']['mainActivityRule']>((criteria.registry?.mainActivityRule as InputData['registry']['mainActivityRule']) ?? 'any');
    const [purpose, setPurpose] = useState<InputData['contactPurpose']>((criteria.contactPurpose as InputData['contactPurpose']) ?? 'general'), [ratio, setRatio] = useState(String((criteria.minPassRatio ?? .5) * 100));
    const [closePending, setClosePending] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
    const [query, setQuery] = useState(''), [suggestions, setSuggestions] = useState<Array<{ code: string; description: string }>>([]), [destination, setDestination] = useState<'target' | 'blocked'>('blocked');
    useEffect(() => {
        let active = true;
        if (!canEdit || !campaign.organizationId || query.trim().length < 2) { setSuggestions([]); return; }
        const timer = setTimeout(() => radarService.searchCnaeCatalog(campaign.organizationId!, query).then(rows => { if (active) setSuggestions(rows); }).catch(() => { if (active) setSuggestions([]); }), 300);
        return () => { active = false; clearTimeout(timer); };
    }, [query, canEdit, campaign.organizationId]);
    const changeTarget = (key: string, update: Partial<Target & { codesText: string }>) => setTargets(current => current.map(target => target.key === key ? { ...target, ...update } : target));
    async function save() {
        if (!canEdit || !campaign.id || !campaign.organizationId || busy||stale) return;
        setError(''); setMessage('');
        let validated=false;
        try {
            const minimum = Number(ratio);
            if (!ratio.trim()||!Number.isFinite(minimum) || minimum < 0 || minimum > 100) throw Error('A reposição deve ficar entre 0% e 100%.');
            const profiles = targets.map(({ codesText, ...target }) => { if (!target.label.trim() || !target.definition.trim()) throw Error('Preencha nome e definição de cada perfil.'); return { ...target, cnaes: codes(codesText) }; });
            const blockedNames = terms(names);
            const input: InputData = { organizationId: campaign.organizationId, configurationRevision: loadedRevision,
                targetCnaes: codes(targetCodes, 7), targets: profiles, outOfScopeExamples: terms(outside), excludedNameTerms: blockedNames,
                registry: { mainActivityRule: mainRule, blockedMainCnaes: codes(blockedCodes), blockedNameTerms: blockedNames }, contactPurpose: purpose, minPassRatio: minimum / 100, closePendingLots: closePending };
            validated=true;setBusy(true);const result=await radarService.saveCommercialCriteria(campaign.id, input);setLoadedRevision(result.campaign.configurationRevision??loadedRevision);
            setMessage('Público-alvo e filtros salvos. Os dados anteriores foram preservados; a próxima rodada usará os novos critérios.'); setClosePending(false); onSaved();
        } catch (cause) { setError(cause instanceof Error && !validated ? cause.message : 'Não foi possível salvar. Confira os campos, a confirmação do acompanhamento pendente e aguarde pesquisas em andamento.'); }
        finally { setBusy(false); }
    }
    return <section aria-label="Público-alvo e filtros" className="space-y-5 rounded-md border bg-background p-4"><div><h3 className="font-semibold">Público-alvo e filtros</h3><p className="mt-1 text-sm text-muted-foreground">Cada campanha tem seus próprios critérios. Empresas fora do perfil continuam no histórico e podem ser revistas. Nenhum contato é feito automaticamente.</p></div>
        <fieldset disabled={!canEdit || busy} className="space-y-5">
            <div className="space-y-4">{targets.map((target, index) => <fieldset key={target.key} className="space-y-3 rounded-md border p-3"><legend className="px-1 text-sm font-medium">Perfil {index + 1}</legend><FieldGroup className="grid gap-3 md:grid-cols-2"><Field><FieldLabel htmlFor={`${id}-${target.key}-name`}>Nome do perfil</FieldLabel><Input id={`${id}-${target.key}-name`} maxLength={120} value={target.label} onChange={event => changeTarget(target.key, { label: event.target.value })} /></Field><Field><FieldLabel htmlFor={`${id}-${target.key}-priority`}>Prioridade</FieldLabel><select id={`${id}-${target.key}-priority`} className={selectClass} value={target.priority} onChange={event => changeTarget(target.key, { priority: event.target.value as 'primary' | 'secondary' })}><option value="primary">Principal</option><option value="secondary">Complementar</option></select></Field></FieldGroup>
                <Field><FieldLabel htmlFor={`${id}-${target.key}-definition`}>O que caracteriza uma empresa deste perfil?</FieldLabel><Textarea id={`${id}-${target.key}-definition`} maxLength={1200} rows={3} value={target.definition} onChange={event => changeTarget(target.key, { definition: event.target.value })} /></Field><Field><FieldLabel htmlFor={`${id}-${target.key}-codes`}>CNAEs de apoio (opcional)</FieldLabel><Input id={`${id}-${target.key}-codes`} value={target.codesText} onChange={event => changeTarget(target.key, { codesText: event.target.value })} /></Field>
                <Button type="button" size="sm" variant="outline" disabled={!canEdit || busy} onClick={() => setTargets(current => current.filter(item => item.key !== target.key))}>Remover este perfil</Button>
            </fieldset>)}<Button type="button" variant="outline" disabled={!canEdit || busy || targets.length >= 10} onClick={() => setTargets(current => [...current, { key: `target_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`, label: '', definition: '', priority: 'primary', cnaes: [], codesText: '' }])}>Adicionar perfil de empresa</Button></div>
            <FieldGroup className="grid gap-4 md:grid-cols-2"><Field><FieldLabel htmlFor={`${id}-outside`}>Exemplos fora do público desejado</FieldLabel><Textarea id={`${id}-outside`} rows={3} value={outside} onChange={event => setOutside(event.target.value)} /><FieldDescription>Uma atividade por linha. Descreva o que não serve para esta campanha.</FieldDescription></Field><Field><FieldLabel htmlFor={`${id}-names`}>Termos excluídos no nome da empresa</FieldLabel><Textarea id={`${id}-names`} rows={3} value={names} onChange={event => setNames(event.target.value)} /><FieldDescription>Um termo ou expressão por linha.</FieldDescription></Field>
                <Field><FieldLabel htmlFor={`${id}-target-cnaes`}>CNAEs alvo da busca</FieldLabel><Textarea id={`${id}-target-cnaes`} rows={3} value={targetCodes} onChange={event => setTargetCodes(event.target.value)} /><FieldDescription>Códigos completos, um por linha.</FieldDescription></Field><Field><FieldLabel htmlFor={`${id}-blocked-cnaes`}>CNAEs principais fora do perfil</FieldLabel><Textarea id={`${id}-blocked-cnaes`} rows={3} value={blockedCodes} onChange={event => setBlockedCodes(event.target.value)} /><FieldDescription>Aceita código completo ou prefixo de dois a sete dígitos. Um CNAE alvo principal prevalece sobre esta lista.</FieldDescription></Field>
            </FieldGroup>
            <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">Consultar descrições dos CNAEs</summary><FieldGroup className="mt-3 grid gap-3 md:grid-cols-2"><Field><FieldLabel htmlFor={`${id}-catalog`}>Código ou descrição da atividade</FieldLabel><Input id={`${id}-catalog`} value={query} onChange={event => setQuery(event.target.value)} /></Field><Field><FieldLabel htmlFor={`${id}-destination`}>Adicionar à lista</FieldLabel><select id={`${id}-destination`} className={selectClass} value={destination} onChange={event => setDestination(event.target.value as 'target' | 'blocked')}><option value="blocked">Principais fora do perfil</option><option value="target">CNAEs alvo</option></select></Field></FieldGroup><div className="mt-3 flex max-h-56 flex-col gap-2 overflow-auto">{suggestions.map(item => <Button key={item.code} type="button" variant="outline" className="h-auto justify-start whitespace-normal text-left" disabled={!canEdit || busy} onClick={() => { const update = (current: string) => [...new Set([...terms(current), item.code])].join('\n'); if (destination === 'target') setTargetCodes(update); else setBlockedCodes(update); }}>{item.code} — {item.description}</Button>)}</div>{query.length >= 2 && !suggestions.length && <p className="mt-2 text-sm text-muted-foreground">Sem descrição disponível. Você pode informar o código ou prefixo diretamente.</p>}</details>
            <FieldGroup className="grid gap-4 md:grid-cols-3"><Field><FieldLabel htmlFor={`${id}-main`}>Atividade principal</FieldLabel><select id={`${id}-main`} className={selectClass} value={mainRule} onChange={event => setMainRule(event.target.value as InputData['registry']['mainActivityRule'])}><option value="any">Aceitar alvo principal ou secundário</option><option value="target_secondary_needs_review">Investigar melhor quando o alvo for secundário</option><option value="target_main_required">Exigir um CNAE alvo como principal</option></select></Field><Field><FieldLabel htmlFor={`${id}-purpose`}>Contato que queremos encontrar</FieldLabel><select id={`${id}-purpose`} className={selectClass} value={purpose} onChange={event => setPurpose(event.target.value as InputData['contactPurpose'])}><option value="general">Contato geral</option><option value="suppliers">Fornecedores e compras</option><option value="sales">Comercial e vendas</option><option value="finance">Financeiro</option><option value="recruitment">Recrutamento</option></select></Field><Field><FieldLabel htmlFor={`${id}-ratio`}>Reposição mínima do lote (%)</FieldLabel><Input id={`${id}-ratio`} type="number" min={0} max={100} value={ratio} onChange={event => setRatio(event.target.value)} /><FieldDescription>Buscar reposição se a quantidade que passou na seleção ficar abaixo desta proporção.</FieldDescription></Field></FieldGroup>
            <Field orientation="horizontal"><input id={`${id}-close`} type="checkbox" checked={closePending} onChange={event => setClosePending(event.target.checked)} /><FieldLabel htmlFor={`${id}-close`}>Se houver acompanhamento pendente, autorizo encerrá-lo ao mudar os critérios, preservando os resultados</FieldLabel></Field>
        </fieldset>
        <Button type="button" disabled={!canEdit || busy||stale} onClick={save}>{busy ? 'Salvando critérios…' : 'Salvar público-alvo e filtros'}</Button>{stale&&<p role="alert" className="text-sm text-destructive">Os critérios mudaram em outra edição. Abra esta tela novamente antes de salvar.</p>}{!canEdit && <p className="text-sm text-muted-foreground">Acesso de consulta. A edição fica com a equipe responsável.</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </section>;
}
