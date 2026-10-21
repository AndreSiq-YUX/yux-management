import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Field, FieldLabel, FieldDescription, FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { radarService } from '@/services/radarService';
import type { RadarEmailPolicy, RadarFunnelFloorPolicy } from '@/types/radarFunnel';

const floorLabels: Record<keyof RadarFunnelFloorPolicy['configuration'], string> = {
    minPositiveSamples: 'Mínimo de empresas aderentes rotuladas', minNegativeSamples: 'Mínimo de empresas fora do perfil rotuladas',
    minHoldoutPositives: 'Mínimo de aderentes no teste independente', minHoldoutNegatives: 'Mínimo de não aderentes no teste independente',
    minThreshold: 'Limiar mínimo permitido', minBlockPrecision: 'Precisão mínima dos bloqueios', maxFalseBlocksOnPositives: 'Falsos bloqueios permitidos (sempre zero)',
};
const lines = (value: string) => [...new Set(value.split(/[\n,;]/).map(item => item.trim().toLowerCase()).filter(Boolean))];
export function RadarFunnelGlobalPolicyPanel({ isSystemAdmin }: { isSystemAdmin: boolean }) {
    const id = useId();
    const [email, setEmail] = useState<RadarEmailPolicy | null>(null), [floors, setFloors] = useState<RadarFunnelFloorPolicy | null>(null);
    const [generic, setGeneric] = useState(''), [accountants, setAccountants] = useState('');
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
    useEffect(() => {
        let active = true;
        if (!isSystemAdmin) return;
        Promise.all([radarService.getEmailDomainPolicy(), radarService.getFunnelFloors()]).then(([emailValue, floorValue]) => {
            if (!active) return;
            setEmail(emailValue); setFloors(floorValue); setGeneric(emailValue.configuration.genericProviders.join('\n')); setAccountants(emailValue.configuration.accountantTokens.join('\n'));
        }).catch(() => { if (active) setError('Não foi possível carregar as políticas globais.'); });
        return () => { active = false; };
    }, [isSystemAdmin]);
    async function save(kind: 'email' | 'floors') {
        if (!isSystemAdmin || busy) return;
        setBusy(true); setError(''); setMessage('');
        try {
            if (kind === 'email' && email) setEmail(await radarService.saveEmailDomainPolicy({ expectedVersion: email.version, configuration: { genericProviders: lines(generic), accountantTokens: lines(accountants) } }));
            if (kind === 'floors' && floors) setFloors(await radarService.saveFunnelFloors({ expectedVersion: floors.version, configuration: floors.configuration }));
            setMessage('Política salva. Nenhum modelo foi ativado e nenhuma pesquisa foi executada.');
        } catch { setError('Não foi possível salvar. Confira os valores e recarregue se outra pessoa editou a política.'); }
        finally { setBusy(false); }
    }
    if (!isSystemAdmin) return null;
    return <section aria-label="Políticas globais do funil" className="space-y-4">
        <Card><CardHeader><CardTitle>Sinais de domínio de e-mail</CardTitle><CardDescription>Admin YUX. Estas listas apenas classificam pistas; não confirmam o site nem a identidade de uma empresa.</CardDescription></CardHeader>
            <CardContent className="space-y-4"><FieldGroup className="grid gap-4 md:grid-cols-2">
                <Field><FieldLabel htmlFor={`${id}-generic`}>Provedores genéricos</FieldLabel><Textarea id={`${id}-generic`} rows={7} disabled={!email || busy} value={generic} onChange={event => setGeneric(event.target.value)} /><FieldDescription>Um domínio por linha, sem @. Exemplo: gmail.com.</FieldDescription></Field>
                <Field><FieldLabel htmlFor={`${id}-accountants`}>Indícios de contabilidade ou assessoria</FieldLabel><Textarea id={`${id}-accountants`} rows={7} disabled={!email || busy} value={accountants} onChange={event => setAccountants(event.target.value)} /><FieldDescription>Um termo por linha. Correspondências continuam sendo hipóteses, nunca bloqueios.</FieldDescription></Field>
            </FieldGroup><Button type="button" variant="outline" disabled={!email || busy} onClick={() => save('email')}>Salvar classificação de domínios</Button></CardContent>
        </Card>
        <Card><CardHeader><CardTitle>Proteções mínimas da calibração</CardTitle><CardDescription>Nenhuma campanha pode afrouxar estes mínimos. Alterações mais restritivas devolvem aplicações incompatíveis à observação.</CardDescription></CardHeader>
            <CardContent className="space-y-4">{floors && <FieldGroup className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{(Object.keys(floorLabels) as Array<keyof typeof floorLabels>).map(key => <Field key={key}>
                <FieldLabel htmlFor={`${id}-${key}`}>{floorLabels[key]}</FieldLabel><Input id={`${id}-${key}`} type="number" step={key === 'minThreshold' || key === 'minBlockPrecision' ? '.01' : '1'} disabled={busy || key === 'maxFalseBlocksOnPositives'} value={floors.configuration[key]} onChange={event => setFloors(current => current ? { ...current, configuration: { ...current.configuration, [key]: Number(event.target.value) } } : current)} />
            </Field>)}</FieldGroup>}<Button type="button" variant="outline" disabled={!floors || busy} onClick={() => save('floors')}>Salvar proteções mínimas</Button></CardContent>
        </Card>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </section>;
}
