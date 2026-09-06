# T32 — Rollout e retorno da correção integrada do YUX Hub

Versão do procedimento: `yux-remediation-rollout:v1`.

Estado inicial: preparação concluída; implantação bloqueada até os gates do manifesto passarem.

Manifesto: `docs/releases/yux-remediation-manifest.json`.

Registro de aceite: `docs/releases/yux-remediation-acceptance.md`

## Regra de liberação

O campo `releaseStatus` só pode sair de `blocked` quando todos os itens de
`requiredGates` estiverem em `passed`, o commit e os digests das três imagens
estiverem fixados, o escopo contiver apenas os UUIDs aprovados e uma restauração
recente estiver identificada. A CI executa `npm run verify:remediation-release`
e impede promover um manifesto incompleto.

Não coloque segredos, nomes de pessoas, conteúdo de clientes ou credenciais no
manifesto. A API e o Harness expõem somente o commit e o SHA-256 do manifesto
em seus endpoints de saúde. `unrecorded` é compatibilidade para instalações
anteriores, mas bloqueia o piloto.

## Lotes e responsáveis

| Ordem | Lote | Conteúdo | Condição para avançar |
| --- | --- | --- | --- |
| 1 | Acesso e SQL | backup/restauração, roles, RLS, migrations e reconciliação em leitura | checksums, logins e matriz A/B aprovados |
| 2 | Conhecimento | armazenamento, ingestão, curadoria, publicação, bindings e retrieval | persistência, evidência, isolamento e fallback demonstrados |
| 3 | UX e efeitos | frontend, filas, conversas, tarefas, Marketing Studio e providers | J1–J7, avaliação estratégica, usuários e sandbox aprovados |

Cada lote tem sua própria janela e pode ser interrompido sem habilitar o lote
seguinte. Uma migration aditiva aplicada não é desfeita para retornar imagens.

## 1. Preparar a versão imutável

1. Escolha o commit revisado e construa backend, frontend e Agent Runtime a
   partir desse mesmo commit. Publique as imagens sem reutilizar tag mutável.
2. Registre no manifesto o commit completo e o digest `sha256:` de cada imagem.
3. Atualize o inventário de migrations somente se o repositório realmente
   mudou. O agregador usa linhas ordenadas `arquivo.sql:checksum` e o mesmo
   algoritmo de normalização do migrador.
4. Registre os UUIDs do workspace interno e da única organização piloto. Não
   use allowlist vazia.
5. Execute no diretório `backend`:

   ```bash
   npm ci
   npm run verify:remediation-release
   npm test
   npm run type-check
   ```

   Os valores do manifesto são a configuração do lote, não defaults implícitos
   do Compose. Declare todas as seis flags em `false` no Dokploy antes do
   primeiro deploy; isso preserva os defaults de instalações anteriores sem
   permitir que o piloto dependa deles.

6. Calcule o SHA-256 do arquivo final sem modificá-lo e configure no Dokploy:

   ```bash
   sha256sum docs/releases/yux-remediation-manifest.json
   YUX_RELEASE_COMMIT=<commit-completo-de-40-caracteres>
   YUX_RELEASE_MANIFEST_SHA256=<sha256-do-manifesto>
   ```

7. Guarde o ID da execução de CI, os digests, o hash do manifesto, a janela, os
   operadores e o commit estável anterior no registro de aceite.

## 2. Backup restaurável e ensaio

Siga `docs/runbooks/yux-backup-restore.md`. O gate exige Postgres, Redis AOF,
materiais, anexos omnichannel e conhecimento da empresa. Restaure em ambiente
isolado, confirme contagens e hashes e execute a aplicação contra a cópia.

Registre no manifesto `backup.status=restored`, `backupId` e a referência da
evidência somente depois do ensaio. O backup existir sem restauração não passa
o gate. Antes de qualquer escrita em produção, execute T30 em `--dry-run` sobre
a restauração recente, conforme `docs/runbooks/yux-state-reconciliation.md`.

## 3. Acesso, SQL e migrations

1. Confirme que o lote contém apenas migrations aditivas revisadas.
2. Suba uma API compatível com os efeitos novos desligados. Use exclusivamente
   o runner `node dist/scripts/apply-migrations.js`; não cole SQL manual.
3. Execute o runner uma segunda vez. Ele deve terminar sem aplicar novamente e
   recusará histórico com checksum divergente.
4. Consulte `schema_migrations` e compare quantidade, primeira, última e
   checksums com o manifesto. Registros `legacy_unverified` exigem a validação
   documentada em `docs/runbooks/yux-migrations.md`; não os aprove por ausência
   de erro.
5. Valide separadamente os logins de migrador, API, worker e Harness. API e
   worker devem manter seus papéis mínimos; nenhum serviço usa a credencial do
   migrador durante operação normal.
6. Repita a matriz tenant A/B com administrador, membro de leitura e operador.
   Qualquer leitura ou escrita cruzada interrompe o rollout imediatamente.

## 4. Serviços compatíveis antes dos escritores

Implante nesta ordem, sempre pelo digest registrado:

1. Agent Runtime e backend API com todas as flags de novos efeitos em `false`.
2. Workers `interactive`, `ingestion`, `external` e `maintenance`. Somente o
   worker `interactive` mantém `YUX_DRAIN_LEGACY_QUEUE=true` até comprovar que a
   fila antiga está vazia; os demais permanecem em `false`.
3. Smoke de contratos API ↔ Harness ↔ worker, saúde Postgres/Redis e jobs sem
   efeito comercial.
4. Frontend ainda com `VITE_MISSION_FORM_COMPATIBILITY=true`.

Confirme que `/api/health` e o `/health` autenticado do Harness mostram o mesmo
commit e hash do manifesto. Divergência de versão bloqueia a ativação.

## 5. Habilitar o piloto em escopo fechado

1. Ative primeiro somente o workspace interno YUX. Ligue uma capacidade por
   vez: supervisor, decisões, relatórios/feedback e, por último, conversas.
2. Para conversas, use `MISSION_CONVERSATIONS_ENABLED=true` junto de
   `MISSION_CONVERSATIONS_TENANT_ALLOWLIST=<uuid-interno>`. Nunca use a flag
   ligada com allowlist vazia.
3. Execute J1–J7 no ambiente e associe IDs persistidos no registro de aceite.
4. Repita as integrações escolhidas em sandbox oficial com limites financeiros,
   contatos e aprovadores registrados. Efeito real não faz parte do smoke.
5. Conclua T22 com teto previamente autorizado e dois avaliadores cegos; depois
   realize três sessões moderadas com usuários representativos.
6. Somente então acrescente uma organização piloto à allowlist. Confirme módulos,
   contrato, contatos e limites antes de reimplantar a configuração.

## 6. Observação mínima

Observe pelo menos 24 horas e uma ocorrência real de cada rotina essencial:
scheduler de sequências, manutenção, learning/checkpoint, outbox, filas por
classe e reconciliação de efeitos desconhecidos. Passagem de tempo sem amostra
não conta.

Em cada janela registre disponibilidade, latência, fila/leases, duplicidades,
efeitos `unknown`, falhas por provider, custo, isolamento, handoffs e tarefas
humanas. Dois intervalos consecutivos de 15 minutos fora do SLO interrompem a
expansão. Expanda uma organização por vez, nunca por allowlist vazia.

## 7. Gatilhos e sequência de retorno

Retorno imediato: vazamento entre tenants ou segredo; efeito externo duplicado
ou sem autorização; divergência de commit/digest/manifesto; corrupção ou
checksum de migration; perda de ledger; regressão dos contratos/golden gates.

1. Desligue primeiro as flags que criam novos trabalhos e efeitos. Preserve as
   leituras e o frontend compatível.
2. Pause a capability exata e as Missions afetadas; em fronteira incerta,
   desligue o supervisor e as conversas globalmente.
3. Preserve banco, arquivos, traces, custos, aprovações e ledgers. Não apague
   jobs nem execute downgrade destrutivo de banco.
4. Reconcilie intenções `unknown` e trabalhos em andamento antes de liberar
   claims. Não repita um efeito incerto.
5. Reimplante API, runtime, workers e frontend pelos digests compatíveis
   anteriores, mantendo leitores capazes de entender o esquema aditivo.
6. Confirme saúde, leitura histórica e ausência de novos efeitos. Registre o
   incidente e o resultado no aceite antes de qualquer nova tentativa.

Runbooks específicos continuam normativos para backup, migrations, filas,
estado histórico, conversas e efeitos de cada Mission. Este documento define a
ordem entre eles; não substitui seus limites mais restritivos.
