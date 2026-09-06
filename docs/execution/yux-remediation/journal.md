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
| T02 | aceita | Stack persistente executada no GitHub Actions com PostgreSQL 17, Redis 7, autenticação, fila, dispatcher e reinício reais |
| T03 | aceita | Rollback físico, migradores concorrentes, checksum e legado foram aprovados no PostgreSQL 17 |
| T04 | bloqueada por dependência | Contrato/runbooks implementados; faltam destino de backup, domínio e ensaio autorizado na infraestrutura |
| T05 | aceita | Alias e consultas reais aprovados no PostgreSQL 17 |
| T06 | aceita | Papéis, grants, RLS e contexto Node/Python aprovados; troca de credenciais do piloto depende dos segredos operacionais |
| T07 | aceita | Política nominal, isolamento A/B e leitura segura aprovados na integração persistente |
| T08 | aceita | Schemas, geradores, TS/Python e corpus aprovados na CI |
| T09 | aceita | Leases de outbox/consumidores, fencing por owner/attempt e retomada persistente aprovados na CI |
| T10 | aceita | Webhook e outbox atômicos, Redis indisponível e replay pós-timeout aprovados na CI |
| T11 | aceita | Scheduler persiste intenção, adaptadores nativos revalidam consentimento/conexão e recibos atualizam a execução |
| T12 | aceita | Registro único cobre todos os JobNames; métricas, agendamento humano e simulação sandbox têm resultados honestos |
| T13–T32 | não iniciada | Dependências preservadas conforme o plano |

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
- Gate registrado à época: foi cumprido pela execução persistente `34000257555` descrita abaixo.

## Aceite persistente do lote T01–T08

- Branch publicada: `codex/yux-remediation-integrated`.
- GitHub Actions: execução `34000257555`, commit `2135cb2`, conclusão `success` em 2026-09-05.
- Backend, frontend, Agent Runtime e Backend integration: todos aprovados.
- A instalação limpa revelou e corrigiu, antes do aceite, a restrição já presente no baseline consolidado, os papéis de compatibilidade do PostgreSQL isolado, a composição permissiva/restritiva das policies RLS e o contrato incompleto do estado de processamento.
- O SQL histórico `0106_email_template_management.sql` foi restaurado ao conteúdo original. A reprodução limpa é preparada dentro da própria transação pelo migrador somente quando a versão ainda não foi registrada e a restrição preexistente corresponde estruturalmente ao mesmo relacionamento.

## T09 — Outbox, leases e retomada

- Estado: aceita.
- Commit inicial: `2135cb2`.
- Achados: YUX-06, YUX-10 e YUX-15.
- Reprodução: `dispatching` e `processing` não possuíam proprietário nem expiração; conclusão aceitava qualquer worker; a criação de deliveries e o enqueue ocorriam na mesma transação, permitindo job órfão se o Redis aceitasse antes de rollback do banco.
- Decisão: leases de 120 segundos, heartbeat de 30 segundos, fencing por `owner + attempt`, reclaims somente após expiração e classes distintas de falha. Deliveries são confirmadas no banco antes do enqueue; repetição usa a mesma identidade BullMQ.
- Entregas: migration `0154_outbox_processing_leases.sql`, utilitário `jobs/leases.ts`, recuperação de outbox abandonado, heartbeat de consumidores e snapshot operacional por classe/idade.
- Verificação local: type-check aprovado; 18/18 testes de migrador, outbox e leases aprovados.
- Aceite persistente: execução GitHub Actions `34000850669`, commit `756ce8a`, conclusão `success`; `outbox-recovery.test.ts` comprovou no PostgreSQL 17 que o proprietário antigo não finaliza após reclaim. Backend, frontend e Agent Runtime também permaneceram aprovados.

## T10 — Webhooks persistidos e entrega recuperável

- Estado: aceita.
- Commit inicial: `7b475f6`; correções exclusivas das fixtures: `f003c02` e `8245f31`.
- Achado: YUX-10.
- Reprodução: o endpoint gravava `channel_webhook_events` e tentava publicar diretamente no Redis; uma indisponibilidade da fila podia ocorrer entre os dois passos, enquanto o `catch` amplo devolvia 200 como se fosse payload não suportado. Duplicatas retornavam sem assegurar uma intenção pendente.
- Decisão: depois de validar o HMAC do corpo bruto e resolver a conexão ativa no servidor, gravar o evento do canal e `omnichannel.inbound.received` na mesma transação. O webhook não depende do Redis para responder; o outbox cria uma delivery `omnichannel` e o consumidor reidrata o payload sanitizado persistido.
- Compatibilidade: o job legado `omnichannel.processMessage` continua aceito para drenar trabalhos existentes; novos webhooks não transportam organização nem conteúdo como autoridade no payload da fila.
- Recuperação: a mensagem externa conserva a restrição única por conexão; replay recupera mensagem existente, não duplica conversa e retoma evento `processing` somente após uma nova tentativa cercada pelo lease da delivery.
- Verificação local: type-check aprovado; 153 arquivos e 623 testes unitários aprovados. Docker não está instalado neste computador, portanto o teste persistente foi executado no runner isolado.
- Aceite persistente: execução GitHub Actions `34001822740`, commit `8245f31`, conclusão `success`. O teste `whatsapp-webhook-recovery.test.ts` comprovou assinatura inválida sem insert, duas entregas idênticas com Redis parado, um único evento, retomada após o Redis voltar, uma única conversa/mensagem e replay pós-timeout com `attempt_count = 2`. Backend, frontend e Agent Runtime também permaneceram aprovados.

## T11 — Despacho CRM pelos adaptadores nativos

- Estado: aceita.
- Commit inicial: `b0e2684`; correções descobertas pela instalação limpa: `f8e7120`, `b9e0112` e `802cc8b`.
- Achados: YUX-09 e a lacuna de entrega/recibo do scheduler CRM.
- Reprodução: o scheduler concluía a execução e chamava transporte diretamente, sem uma intenção durável comum aos canais; concorrência, Redis indisponível e resposta perdida não tinham uma identidade de despacho estável.
- Decisão: `sequence:<enrollment>:step:<step>` identifica a execução; a mesma transação conclui a execução, cria o pedido/mensagem e grava `crm.sequence.delivery_requested`. O consumidor revalida supressão, opt-in/opt-out, conexão, token e janela/template antes de publicar um job nativo com ID estável.
- Segurança: o job nunca contém token. O login `yux_worker` ganhou somente `SELECT` nos segredos criptografados, condicionado ao papel de serviço worker e ao escopo da organização; mutação continua administrativa.
- Recuperação: provider acceptance, falha e recibos `sent/delivered/read/failed` atualizam a mensagem e o payload da execução. O handler de recibo não cria conversa de entrada fictícia.
- Verificação local: type-check aprovado; 154 arquivos e 626 testes unitários aprovados.
- Aceite persistente: execução GitHub Actions `34002909940`, commit `802cc8b`, conclusão `success`. `crm-dispatch.test.ts` comprovou dois schedulers concorrentes com Redis interrompido, uma única intenção/evento, retomada com uma chamada ao provedor, ausência de duplicata no segundo tick, recibo Meta assinado e bloqueios sem chamada externa para canal desconectado e opt-out posterior ao agendamento. Backend, frontend e Agent Runtime também permaneceram aprovados.

## T12 — Registro único e lacunas de jobs

- Estado: aceita.
- Commit: `e75cd5c`.
- Achado: YUX-11.
- Reprodução: `provider.syncMetrics`, `omnichannel.requestScheduling` e `omnichannel.simulateChannelEvent` eram aceitos por produtores, mas não tinham handler no worker; o dispatcher era uma cadeia paralela à lista de nomes.
- Decisão: `jobs/registry.ts` é a fonte executável de schema, handler, classe de fila, timeout e `sandboxOnly` para cada `JobName`. API, worker e rig validam no mesmo registro antes do enqueue; o processor resolve o handler diretamente pelo registro.
- Métricas: o handler reutiliza o adaptador de anúncios, exige campanha/conexão/referência reais, mantém identidade por coleta, grava run, snapshot, métricas correntes e timestamp de origem. Ausência de configuração retorna `capability_unavailable` antes da fila.
- Agendamento: sem adaptador de calendário configurado, a solicitação persiste como trabalho humano pendente, com `automaticConfirmation=false`; nenhum job inevitavelmente órfão é aceito e nenhuma reunião é prometida.
- Simulação: requer papel interno e organização YUX ou contrato com `mission_sandbox`; o resultado vai para `omnichannel_simulation_events` marcado como simulação e não percorre o pipeline de conversas reais. O simulador incompatível foi removido do portal cliente.
- Verificação local: type-checks backend/frontend aprovados; 154 arquivos e 628 testes backend aprovados; 13 testes frontend afetados aprovados.
- Aceite persistente: execução GitHub Actions `34003524798`, commit `e75cd5c`, conclusão `success`. `job-registry.test.ts` verificou cobertura integral do registro, coleta pelo servidor de provedor controlado e isolamento da simulação sem alteração nas contagens de conversas/mensagens. Backend, frontend e Agent Runtime também permaneceram aprovados.

## T13 — Identidade imutável e reconciliação de efeitos externos

- Estado: aceita.
- Commits: `e49deb8` e correção do validador de alvos `e689287`.
- Achado: YUX-13 e recuperação do Action Engine.
- Reprodução: a chave histórica `provider:action:campaign` suprimia uma segunda mudança legítima de orçamento; chamadas diretas não congelavam intenção, payload e aprovação em uma mesma identidade.
- Decisão: `intentId` representa a intenção aprovada e é conservado em retries; cada novo orçamento aprovado recebe outro UUID. O ledger `action_external_effects` é a autoridade para efeitos do Action Engine, ligado ao run do provedor sem criar uma segunda intenção concorrente.
- Segurança: organização, campanha, conexão conectada, token referenciado, status da aprovação, hash do payload e hash do objeto aprovado são revalidados antes da chamada externa. O cabeçalho `X-YUX-Intent-ID` acompanha Meta e Google; jobs nunca carregam o segredo.
- Recuperação: resposta perdida grava `unknown`; repetição muda para `manual_review` e não chama o provedor novamente sem reconciliação. A missão expõe status, prazo e referência de reconciliação sem material sensível.
- Verificação local: type-checks backend/frontend aprovados; 154 arquivos e 628 testes backend aprovados; teste frontend do serviço de campanha aprovado. Docker não está disponível neste computador.
- Aceite persistente: execução GitHub Actions `34004433067`, commit `e689287`, conclusão `success`. `provider-intents.test.ts` comprovou duas intenções legítimas com retries e somente duas chamadas, bloqueio de payload alterado e aprovação revogada, e resposta perdida mantida em revisão manual sem sucesso fictício. Backend, frontend e Agent Runtime também permaneceram aprovados.
