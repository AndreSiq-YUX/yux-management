# Diário de execução — correções integradas YUX Hub

Plano de origem: `docs/superpowers/plans/2026-09-05-yux-hub-correcao-melhorias-integradas.md`  
Início: 2026-09-05  
Branch de execução: `codex/yux-remediation-integrated`  
Commit-base: `000f8bce9c923c2c4f78c307efe58479eb7deb4a`

## Regras do diário

Cada tarefa registra o commit inicial, achados cobertos, reprodução anterior, decisão, arquivos alterados, verificações posteriores, riscos e estado. Os estados válidos são: `não iniciada`, `em execução`, `bloqueada por dependência`, `implementada aguardando aceite`, `aceita` e `dispensada com evidência`.

Os arquivos não versionados que já existiam no checkout antes da execução foram preservados. Em particular: `.codegraph/`, `.superpowers/`, documentos da auditoria e do plano, PDFs, imagens, textos locais e o estado pré-existente do submódulo `.impeccable`.

## T01 — Reconciliar a base e preparar o registro de execução

- Estado: aceita.
- Commit inicial: `000f8bce9c923c2c4f78c307efe58479eb7deb4a`.
- Achados: todos, com ênfase em YUX-20 e YUX-21.
- Reprodução anterior: o código versionado não diverge do commit usado pela auditoria; `git diff --stat 000f8bce...` ficou vazio.
- Decisão: executar em branch dedicada no checkout atual, sem mover, apagar, sobrescrever ou incorporar os arquivos locais preexistentes.
- Migrações reservadas: `0153` a `0157`, sujeitas a ampliação somente por tarefa e sem editar as 55 migrations existentes.
- Baseline backend: type-check passou; suíte executou 610 testes, com 609 aprovados e um timeout preexistente em `tests/auth.test.ts > auth helpers > hashes and verifies passwords` após 5 s.
- Baseline frontend: type-check passou; 123 arquivos/528 testes passaram. Houve avisos preexistentes de configuração Vite/esbuild e base Browserslist desatualizada.
- Ambiente operacional: a inspeção local confirma Compose com PostgreSQL 17, Redis 7 e cinco volumes nomeados. Estado aplicado da VPS, digests de imagens, backups externos, recursos disponíveis e contas reais de provedores não foram inferidos.
- Arquivos criados: `baseline.json`, `decisions.md` e este diário.
- Risco remanescente: T04 e os aceites live dependem de informação/infraestrutura externa; isso não bloqueia as correções locais nem a composição de integração.

## Estado das tarefas

| Tarefa | Estado | Observação |
| --- | --- | --- |
| T01 | aceita | Baseline reconciliado e registrado |
| T02 | implementada aguardando aceite | Stack/CI criados; execução local real bloqueada por ausência de Docker e credencial descartável do PostgreSQL local |
| T03 | implementada aguardando aceite | Unidade transacional/checksum validados em testes unitários; cenários PostgreSQL aguardam stack descartável |
| T04 | bloqueada por dependência | Contrato/runbooks implementados; faltam destino de backup, domínio e ensaio autorizado na infraestrutura |
| T05 | em execução | Independente do bloqueio operacional de T04 |
| T06–T32 | não iniciada | Dependências preservadas conforme o plano |

## Evidência de comandos T01

```text
backend type-check: PASS
backend tests: FAIL preexistente (1 timeout), 609 PASS
frontend type-check: PASS
frontend tests: PASS, 528 PASS
```

## T02 — Prova de integração persistente

- Estado: implementada aguardando aceite no job com serviços descartáveis.
- Commit inicial: `df6d335`.
- Achado: YUX-20.
- Reprodução anterior: `buildServer` selecionava fila sem efeitos em `NODE_ENV=test`; o dispatcher do worker era uma função privada acoplada às dependências globais do processo; a CI não iniciava PostgreSQL/Redis.
- Decisão: extrair um único dispatcher injetável e usá-lo no worker produtivo e no rig; manter banco, autenticação, handlers e BullMQ reais; substituir somente o limite HTTP externo.
- Entregas: Compose efêmero PostgreSQL 17/Redis 7, rig autenticado, fixture A/B, servidor de provedor determinístico, teste de persistência/reinício, configuração Vitest separada e job de CI com captura de logs.
- Verificação local: type-check backend passou; testes afetados de CRM e Company Intelligence passaram (8/8).
- Limitação de aceite local: Docker não está instalado. PostgreSQL 17 e Redis existem localmente, mas o PostgreSQL exige senha e não há credencial de teste disponível no ambiente. Nenhuma base existente foi sondada além de uma tentativa sem senha contra `postgres`, e nenhuma foi alterada.
- Próxima prova automática: `npm --prefix backend run test:integration -- tests/integration/stack.test.ts` no job `Backend integration`.
- Risco remanescente: o teste persistente precisa executar no runner Linux/Docker antes de T02 mudar para `aceita`; as tarefas seguintes podem usar suas interfaces e manter esse gate aberto.

## T03 — Executor de migrations atômico e verificável

- Estado: implementada aguardando aceite PostgreSQL.
- Commit inicial: `2efeb96`.
- Achados: YUX-14, YUX-20 e YUX-21.
- Reprodução anterior: `BEGIN`, SQL, registro e `COMMIT` eram enviados por `Pool.query`, sem garantia de usar a mesma conexão; não havia lock nem identidade do artefato.
- Decisão: reservar um `PoolClient`, adquirir lock consultivo de sessão, verificar/aplicar todo o lote no mesmo client e liberar em `finally`. Cada arquivo continua com transação própria dentro do lock.
- Integridade: algoritmo registrado como `sha256:utf8:lf:bom-and-nul-removed:trim-start:v1`; histórico antigo sem hash permanece `legacy_unverified`; divergência de hash/algoritmo bloqueia o deploy.
- Verificação local: type-check passou; 6/6 testes unitários do migrador passaram, incluindo rollback, liberação de lock/client e checksum divergente.
- Verificação preparada: teste PostgreSQL para rollback físico, dois migradores concorrentes, checksum e legado não atestado.
- Documentação: `docs/runbooks/yux-migrations.md` explicita operações incompatíveis com transação e proíbe exceção silenciosa para `CREATE INDEX CONCURRENTLY`.
- Risco remanescente: instalação limpa/upgrade em cópia sanitizada continuam no gate de integração e de rollout; nenhuma migration já existente foi alterada.

## T04 — Recuperação e acesso administrativo

- Estado: bloqueada por dependência operacional, com artefatos de implementação prontos.
- Commit inicial: `f80f74a`.
- Achados: YUX-25 e YUX-32.
- Decisão: formalizar RPO ≤ 1 hora e RTO ≤ 4 horas; backup reúne PostgreSQL, materiais, originais de conhecimento, anexos omnichannel, Redis/AOF auxiliar, versões/digests e referência de custódia. Restore inicia sem worker, schedulers ou efeitos externos.
- Entregas: schema estrito do manifesto, runbook de backup/restore, runbook de acesso administrativo HTTPS, inventário dos volumes marcado no Compose e vínculo no runbook da VPS.
- Verificação local: type-check passou; 2/2 testes do schema passaram, incluindo rejeição de ativos ausentes, efeitos habilitados e valor semelhante a segredo.
- Dependências externas ausentes: destino/retensão de backup, inventário de backups externos, domínio administrativo definitivo, acesso à VPS/Dokploy, digests implantados e responsável/revisor do ensaio.
- Critério para desbloqueio: fornecer/confirmar esses dados e executar restore isolado e mudança de acesso com caminho de manutenção já validado. Nenhuma alegação de restauração ou TLS produtivo foi feita.
