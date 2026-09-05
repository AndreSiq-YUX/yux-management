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
| T05 | implementada aguardando aceite | Alias corrigido; integração PostgreSQL preparada |
| T06 | implementada aguardando aceite | Papéis, grants, RLS e contexto Node/Python implementados; troca de credenciais do piloto depende dos segredos operacionais |
| T07 | implementada aguardando aceite | Mutações governadas bloqueadas no endpoint genérico; revisões têm projeção segura e fallback isolado |
| T08 | implementada aguardando aceite | Schemas canônicos, tipos TS gerados, modelos Python e corpus comum adicionados |
| T09–T32 | não iniciada | Dependências preservadas conforme o plano |

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

## T05 — SQL de autonomia e checkpoint

- Estado: implementada aguardando aceite PostgreSQL.
- Commit inicial: `16654a3`.
- Achado: YUX-31.
- Reprodução: todas as consultas de leitura e o checkpoint usavam `grant` como alias sem aspas, palavra reservada no PostgreSQL.
- Decisão: substituir integralmente o alias por `autonomy_grant`, sem alterar assinaturas, estados ou regras de autorização.
- Verificação local: type-check passou; 18/18 testes de grants e preflight passaram.
- Verificação preparada: integração cria grants ativo, expirado e revogado, executa `getAutonomyGrant`, `getActiveAutonomyGrant`, `listAutonomyGrants` e chama o checkpoint no PostgreSQL real.
- Risco remanescente: o cenário com campanha elegível e métricas suficientes/insuficientes será confirmado no gate persistente; os 3.330 jobs históricos não foram reenviados.

## T06 — Papéis de serviço e contexto de tenant

- Estado: implementada aguardando aceite persistente e troca controlada no piloto.
- Commit: `ed5ff5b`.
- Entregas: logins sem privilégios elevados, grants mínimos do runtime, policies restritivas, credencial exclusiva por serviço no Compose, contexto por transação no Node e por `ContextVar`/conexão no Python, organização obrigatória nos jobs de tenant e teste A/B com os logins reais.
- Verificação local: type-check backend passou; 9/9 testes de contexto/migrador e 13/13 testes Python afetados passaram.
- Gate aberto: o runner Docker executará a matriz SQL real; a troca de segredos da VPS permanece dependente de T04 e não foi simulada.

## T07 — Política de operação e revisões do portal

- Estado: implementada aguardando integração persistente.
- Commit: `7e90303`.
- Entregas: política nominal por operação, bloqueio de mutações genéricas em conhecimento governado, proteção de campos de publicação, endpoint de revisão por contrato com projeção sem notas internas/payloads e isolamento de falhas opcionais no hook.
- Verificação local: type-check backend/frontend passou; teste frontend de degradação seletiva passou. Integração A/B e tentativa de publicação genérica estão no job persistente.

## T08 — Contratos compartilhados

- Estado: implementada aguardando execução completa de CI.
- Commit: `9b9ad82`.
- Entregas: schemas JSON v1 de conhecimento/workspace, corpus positivo/negativo, geração determinística TS para backend/frontend, modelos Pydantic e serialização canônica/hash no runtime.
- Verificação local: validação AJV, validação Pydantic, Unicode/ordem de chaves/arrays e type-checks passaram. A CI agora regenera e exige diff vazio.

## Regressão do lote T01–T08

- Backend unitário: 152 arquivos e 615 testes aprovados; os testes persistentes ficam exclusivamente na configuração de integração.
- Frontend: 124 arquivos e 529 testes aprovados; type-check aprovado.
- Runtime Python: 167 testes aprovados e 1 teste live explicitamente ignorado; os novos testes de escopo e contrato estão incluídos.
- Integração persistente: não executada localmente porque Docker não está instalado e não existe credencial para uma base PostgreSQL descartável. O job de CI está preparado para executar os cenários com PostgreSQL 17/Redis 7.
- Gate: T09 não deve começar sobre contratos/RLS ainda não exercitados no banco real; é necessário executar o job `Backend integration` ou disponibilizar o stack descartável equivalente.
