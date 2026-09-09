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
| T13–T21 | aceita | Identidade de efeitos, filas, saúde, conhecimento versionado, curadoria, publicação, retrieval e grounding aprovados com evidência persistente |
| T22 | implementada aguardando aceite | Falta execução paga autorizada no OpenRouter e avaliação por dois revisores cegos |
| T23–T29 | aceita | Contexto, fila humana, automações, Studio, onboarding, supply chain e desempenho aprovados |
| T30 | implementada aguardando aceite | Mecanismo e ensaio isolado aprovados; restauração recente e execução operacional continuam pendentes |
| T31 | implementada aguardando aceite | Gate técnico J1–J7 aprovado; sandbox oficial, ligação integral J1–J6 e três testes moderados continuam pendentes |
| T32 | implementada aguardando aceite | Manifesto, gate de CI, identificação da release e runbook preparados; implantação permanece bloqueada pelos gates externos |

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

## T14 — Isolamento de filas e liderança dos schedulers

- Estado: aceita.
- Commit inicial: `e1e0c9a`; ajuste exclusivo de expectativa do teste: `d0f056c`.
- Achado: YUX-15.
- Decisão: novos jobs são roteados pelo registro único para `yux-interactive`, `yux-ingestion`, `yux-external` ou `yux-maintenance`. A fila `yux-jobs` permanece somente como consumidor de dreno durante a transição; nenhum produtor escreve simultaneamente nos dois caminhos.
- Capacidade inicial: concorrências 2/1/2/1. Trabalhos externos e de ingestão da mesma organização/provedor são serializados dentro do processo; o runbook proíbe aumentar réplica/concorrência antes de um limitador distribuído e da medição de CPU/memória da VPS.
- Resiliência: leases BullMQ usam 120 segundos e verificação de stalled a cada 30 segundos; o registro impõe deadline total e Jina usa AbortSignal com 15 segundos por chamada. Um advisory lock PostgreSQL de sessão elege um único processo para timers comerciais.
- Rollout: o Compose cria workers separados por classe, mantém o dreno legado no interativo e habilita scheduler apenas no worker de manutenção. O roteiro de observação e retorno está em `docs/runbooks/yux-queue-rollout.md`.
- Verificação local: build, type-check e 154 arquivos/628 testes backend aprovados. Docker não está disponível neste computador.
- Aceite persistente: execução GitHub Actions `34005013449`, commit `d0f056c`, conclusão `success`. `queue-isolation.test.ts` comprovou atendimento interativo durante ingestão ocupada, uma única execução para identidade externa duplicada após reinício e eleição/transferência de um único scheduler. Os testes de integração anteriores e os gates de backend, frontend e Agent Runtime permaneceram aprovados.

## T15 — Saúde operacional, configuração efetiva e custos

- Estado: aceita.
- Commits: `6cff348`, `d6048c8`, `92ae882`, `b6341f5`, `1bd8b77` e correção de propagação do contexto `3af0f74`.
- Achados: YUX-17, YUX-25 e YUX-26.
- Decisão: liveness e readiness básica permanecem independentes do snapshot operacional autenticado. O snapshot mede heartbeat de processo, idade das quatro filas, leases abandonados, falhas históricas, Harness autenticado, origem efetiva de credenciais e a última medição de uso/custo.
- Configuração: a resolução compartilhada prioriza segredo ativo e decifrável do banco, depois variável de ambiente permitida e por fim indisponibilidade. `configured` nunca preenche `verifiedAt`; segredo e conteúdo de cliente não entram na resposta.
- Medição: heartbeat a cada 30 segundos e stale após 90; custo desconhecido persiste `NULL` com motivo. Leituras e embeddings Jina registram modelo, correlação e uso disponível; health do Harness exige token e não faz inferência paga.
- Verificação local: 154 arquivos/628 testes backend, type-check e 168 testes Python aprovados, com 1 teste live ignorado.
- Aceite persistente: execução GitHub Actions `34006289729`, commit `3af0f74`, conclusão `success`. O cenário persistente comprovou API pronta junto de worker atrasado, lease abandonado, falha terminal histórica separada, Harness indisponível, origem ambiente/banco, medição incompleta com custo nulo e ausência de segredos. Backend, frontend e Agent Runtime também permaneceram aprovados.

## T16 — Publicação versionada e proveniência

- Estado: aceita.
- Commit inicial: `183a570`; correção de contexto transacional: `4baef3d`.
- Achados: YUX-01, YUX-02, YUX-04 e YUX-18.
- Decisão: packs publicam releases imutáveis com versão, SHA-256, política, snapshot e autor. O pack aponta apenas para a release corrente; cards projetados carregam identidade unívoca de release e item, mantendo as versões anteriores consultáveis.
- Escopo: packs e documentos privados possuem organização proprietária. Hash igual é permitido entre organizações sem revelar a existência do outro arquivo; material global mantém índice próprio. A unicidade legada de conceito/categoria vale apenas para cards sem release.
- Proveniência: itens distinguem `document_extracted`, `manual_authored` e `seed_example`. As cinco sementes históricas foram marcadas como exemplos sem evidência atribuída, sem associação fictícia ao Black Book.
- Compatibilidade: publicações de conhecimento existentes receberam versão, hash e snapshot; triggers completam a identidade de novos inserts legados. Fonte e documento podem apontar para a publicação corrente sem destruir histórico.
- Aceite persistente: execução GitHub Actions `34006447763`, commit `a74aaea`, conclusão `success`. O teste persistente publicou duas versões com o mesmo título, confirmou dois cards distintos, imutabilidade da release, remoção de binding/arquivamento sem perda do snapshot anterior e duas cópias privadas do mesmo hash em organizações diferentes. Todos os quatro jobs da CI passaram.

## T17 — Upload real e processamento recuperável

- Estado: aceita.
- Commit inicial: `3893054`; correção da detecção de PDF sem texto: `6168a6c`.
- Achados: YUX-01 e YUX-06.
- Decisão: o upload usa corpo binário em streaming, teto efetivo configurável de até 50 MiB, validação de tamanho, MIME, UTF-8 e SHA-256 no servidor. O nome definitivo contém IDs internos e hash; nome original fica apenas como metadado.
- Atomicidade: o arquivo passa por quarentena, é finalizado no volume compartilhado e tem integridade conferida antes da transação que cria documento, atualiza ingestão e grava `strategy.ingestion.queued`. Falha de commit devolve o arquivo à quarentena; documento sem arquivo íntegro nunca entra em `queued`.
- Recuperação: `strategy.indexKnowledge` está no registro único, roda na fila de ingestão com lease, heartbeat, fencing e tentativas. O outbox agenda o job com identidade estável; consulta de ingestão também reconcilia um estado `queued` após reinício. Hash repetido na mesma organização reutiliza o documento sem duplicar armazenamento.
- Interface: a tela envia o objeto `File` real, mantém o arquivo selecionado quando o envio falha, mostra tentativa/erro recuperável e aceita PDF, TXT, Markdown e DOCX. Arquivos sem MIME informado pelo navegador são classificados pela extensão permitida.
- OCR: marcadores técnicos do parser não contam como conteúdo. PDF sem texto útil termina em `extraction_requires_ocr` e não é apresentado como curado ou concluído.
- Verificação local: type-check/build de backend e frontend aprovados; 155 arquivos/630 testes backend e 125 arquivos/532 testes frontend aprovados; lint direcionado dos arquivos alterados sem achados. O lint global permanece bloqueado por 565 erros preexistentes fora desta tarefa.
- Aceite persistente: execução GitHub Actions `34033242938`, commit `6168a6c`, conclusão `success`. O cenário real comprovou autorização interna, TXT, upload interrompido e retomado, hash divergente, MIME inválido, deduplicação, reinício da API, processamento pelo outbox/worker e PDF vazio retido para OCR. Backend, frontend e Agent Runtime também permaneceram aprovados.

## T18 — Curadoria estratégica com evidência e revisão humana

- Estado: aceita.
- Commit inicial: `b9d29ca`; correções de diretório configurado e identidade canônica: `230bb55` e `9673d38`.
- Curadoria: o runtime usa prompt versionado, trata o documento como dado não confiável e exige princípio, problema, perguntas, aplicabilidade, contraindicações, regras, ações, critérios, confiança, conflitos e evidência literal localizável. Fatos específicos da empresa não são promovidos a princípio geral.
- Evidência: o runtime e o backend validam documento, SHA-256, página/seção, locator e trecho após normalizar somente Unicode e espaços. Páginas PDF são as páginas reais do parser; TXT/DOCX conservam seção. Item sem evidência verificável é rejeitado.
- Recuperação: extração, lotes de curadoria e embeddings possuem hash/checkpoint. Resultado concluído é reutilizado após reinício; custo/uso é persistido junto do checkpoint. A CI interrompeu curadoria e o processo logo após salvar embeddings, comprovando retomada sem segunda chamada de curadoria ou embedding para o mesmo resultado.
- Governança: hash canônico e similaridade evitam duplicidade e sinalizam possível merge/conflito somente dentro do pack. Conteúdo bruto nunca vira autorizado em modo degradado. Propostas permanecem `proposed` até operador aprovar, rejeitar ou editar com motivo; a fonte fica visível na tela.
- Verificação local: builds e type-checks aprovados; 631 testes backend antes do teste canônico adicional, 534 frontend e 171 Python aprovados; contratos e 15 cenários dourados aprovados; lint direcionado sem achados.
- Aceite persistente: execução GitHub Actions `34034664537`, commit `9673d38`, conclusão `success`. Os quatro jobs passaram; a integração persistente aprovou 24 cenários, incluindo interrupção/retomada, ausência de duplicata, evidência, contraindicação e revisão humana.

## T19 — Governança salva e publicação atômica

- Estado: aceita.
- Commit inicial: `b313d4f`; correções dos dados isolados de teste e da política do outbox: `af5725a`, `247daeb` e `50f0b85`.
- Atomicidade: estratégia e conhecimento empresarial recebem versão esperada, público, perfis permitidos/bloqueados e IDs aprovados. Uma única transação valida papel, versão, itens e evidências, grava snapshot/hash imutável, materializa a projeção, atualiza o ponteiro corrente e emite o evento de domínio.
- Segurança: conflito de versão retorna 409; item rejeitado, evidência inválida, conteúdo bruto e publicação sem seleção aprovada são recusados. O outbox aceita `client_admin` somente em contexto de API e somente para a organização da requisição; membros, worker e runtime não ganharam permissão de escrita.
- Projeção: cards e embeddings são materializados com identidade da release. Falha de projeção desfaz release e ponteiro; enquanto T20 não validar fallback lexical, embedding pronto continua obrigatório. Edição posterior não altera o snapshot publicado.
- Interface: os diálogos exibem público e perfis efetivos, permitem confirmar exatamente os itens aprovados e mostram versão e hash salvos. O atalho de publicação raw degradada foi removido.
- Verificação local: type-checks, builds, 632 testes backend e 536 testes frontend aprovados; contratos regenerados sem diferença e lint direcionado sem achados.
- Aceite persistente: execução GitHub Actions `34036365107`, commit `50f0b85`, conclusão `success`. Backend, frontend, Agent Runtime e 25 testes de integração passaram, incluindo concorrência, permissão negada, item rejeitado, rollback da projeção, publicação empresarial e histórico imutável.

## T20 — Elegibilidade, busca e ranking unificados

- Estado: aceita.
- Commits de implementação e estabilização: `66d0ebe`, `dbfd3cf`, `27ecefc`, `a46fcc1` e `fcc0800`.
- Política autoritativa: uma função PostgreSQL filtra organização/contrato, ponteiros de publicação, conjunto aprovado, perfil, audiência, release corrente e binding ativo antes do ranking. Relações normalizadas imutáveis substituem varreduras de arrays; limite é aplicado somente ao resultado final e o desempate usa ID estável.
- Busca: índices GIN parciais atendem o caminho lexical. Embeddings JSONB são comparados somente após autorização; indisponibilidade produz `degraded`, modo `lexical` e motivo explícito. Como o alvo foi atingido sem índice vetorial, pgvector não foi introduzido.
- Segurança e compatibilidade: rascunho, rejeitado, arquivado, raw, perfil bloqueado, outra organização e conteúdo interno para contato externo ficam fora do resultado. Auditoria de rascunho é separada, exclusiva de curadores e incompatível com o contrato de contexto. A RPC antiga aceita apenas nomes conhecidos; o portal passou a enviar os nomes canônicos.
- Runtime: estratégia e contexto empresarial do Harness chamam a mesma política de banco com organização, contrato, perfil, audiência, módulo, workflow e canal. Os limites legados de 200/500 candidatos anteriores à elegibilidade foram removidos, inclusive o caso de 500 raw antes do trecho relevante.
- Cache: chave unificada inclui todos os escopos, política, publicação, binding, modelo e consulta. Publicação ou revogação altera a identidade; nenhuma resposta antiga é reutilizada no caminho autoritativo.
- Verificação local: 636 testes backend, 536 frontend e 175 Python aprovados; type-checks, builds, contratos e 15 cenários dourados também aprovados.
- Aceite persistente: execução GitHub Actions `34038497416`, commit `fcc0800`. A integração persistente aprovou 26 cenários; o corpus embaralhado de 10 mil trechos alcançou Recall@5 ≥ 0,90, zero violação de escopo e p95 ≤ 1 segundo, mantendo o limite de aceite original.

## T21 — Grounding comum em todos os agentes

- Estado: aceita.
- Commits de implementação e estabilização: `68afdc8`, `5cc214b`, `c316d29` e `0235dd8`.
- Contrato: `MissionSourceRefWire` recebeu identidade opcional e indivisível de publicação, item, política, modo de uso e binding. A versão é o UUID da publicação e o hash usa a mesma fórmula canônica de T20. Referências de memória permanecem próprias; referências antigas continuam verificadas pelas tabelas e versões históricas.
- Ponte e verificação: estratégia publicada vira `strategy_card`/`yux:<id>`; conhecimento empresarial vira `knowledge_chunk`/`customer:<id>`. O verificador não procura uma fonte governada nas tabelas legadas: ele exige release/publicação corrente, item aprovado, perfil, organização, contrato, audiência e binding efetivo, além de comparar versão, item, fingerprint e conteúdo.
- Inventário de consumidores: Marketing (`marketing_studio`, cliente), Radar (`radar`, cliente), automação IA (`automation`, cliente), atendimento (`whatsapp`/`webchat`/`instagram`/`messenger`, contato externo), chat estratégico (`strategy_admin`, operador interno) e supervisor (`mission_intake`, audiência validada) passam pelo mesmo resolvedor e pelo repository autoritativo. Os snapshots de execução conservam o contexto completo e a rastreabilidade local.
- Segurança: payload de automação não pode se declarar contato externo, canal de atendimento nunca herda acesso interno e fonte interna não chega ao contato externo. Perfil bloqueado não recebe a regra. O modelo somente seleciona referências do catálogo recuperado; referência inventada e hash divergente são recusados de forma estruturada, sem reparação em loop.
- Efeito externo: o plano persiste o ID do snapshot e os parâmetros de grounding. O executor revalida a projeção imediatamente antes de reservar efeitos externos/destrutivos; binding revogado bloqueia a execução nova, mas o snapshot anteriormente verificado continua auditável.
- Verificação local: type-check aprovado; 640 testes backend e 179 testes Python aprovados, com 1 live ignorado. O ambiente local não possui Docker, portanto a prova PostgreSQL/Redis foi executada no runner isolado.
- Aceite persistente: execução GitHub Actions `34040403105`, commit `0235dd8`, conclusão `success` para Backend, Frontend, Agent Runtime e Backend integration. O novo cenário comprovou a mesma regra aprovada nos seis consumidores, bloqueio por perfil, ausência da fonte interna no contato externo, identidade/hashes da publicação, snapshot JSON íntegro e eliminação de novas consultas/verificações após revogar o binding.

## T22 — Medição de ganho estratégico com o Harness real

- Estado: implementada aguardando execução autorizada e avaliação cega.
- Commit da infraestrutura: `a7d4545`.
- Corpus: 24 casos novos, seis em cada categoria do plano e seis holdouts não expostos ao prompt. Estão presentes documento contraditório, pergunta sem base, prompt injection, fonte revogada, mudança de marca, orçamento insuficiente, isolamento entre organizações e capability ausente.
- Execução: o runner percorre `MissionConversationWorkflow` e o Harness configurado, não chama o provedor por atalho. As três condições usam o mesmo modelo e temperatura; request sanitizado, resposta, fontes, publicação, modelo, prompt hash, uso/custo, latência, seed e configuração são persistidos. Um checkpoint e o pacote cego são regravados depois de cada resposta concluída.
- Custo: a amostra completa reserva R$ 86,40 sob as estimativas declaradas. O ensaio com teto de R$ 80 foi bloqueado antes de qualquer chamada e o ensaio com teto de R$ 100 foi bloqueado pela ausência de `OPENROUTER_API_KEY`, também antes de gasto. Uso desconhecido conserva estimativa positiva; medição em USD só vira BRL com cotação explícita.
- Avaliação: a rubrica 0–4 cobre diagnóstico, contexto, condições, ação e evidência. Dois avaliadores com identidades distintas são obrigatórios; desacordo maior que um ponto exige desempate. Gates binários e referências estruturalmente inválidas não podem ser compensados por média.
- Golden: os manifestos e runners anteriores agora recusam corpus sem `artifactKind=contract_fixture`, impedindo que métricas declaradas na fixture sejam apresentadas como medição real.
- Verificação local: 189 testes Python aprovados, com 1 teste live opt-in ignorado; uma simulação determinística percorreu as 144 chamadas pelo Harness e confirmou checkpoints, custo não nulo e identidade governada das fontes.
- Verificação remota: execução GitHub Actions `34041257460`, commit `a7d4545`, conclusão `success` nos jobs Backend, Backend integration, Frontend e Agent Runtime.
- Bloqueio remanescente: falta disponibilizar a credencial OpenRouter no ambiente e autorizar explicitamente o teto da execução paga; depois disso ainda são necessários dois avaliadores cegos. Até lá, `acceptance.status` permanece `not_evaluated` e nenhum ganho é alegado.

## T23 — Contexto único do workspace e correção em contexto

- Estado: aceita.
- Commit: `8835a01`.
- Achados: YUX-08, YUX-26 e YUX-30.
- Reprodução: o frontend inferia módulos e papel do workspace, a organização interna dependia de contrato para abrir canais, a oferta de conversa dependia de flag local e links livres de correção podiam apontar para páginas sem os campos solicitados. Falha de criação também substituía a leitura da carteira por um erro, e o contraste da mensagem do usuário ficou ilegível quando verificado no navegador.
- Decisão: `GET /api/workspace/organizations/:organizationId/context` é a autoridade para organização, contrato, papel, módulos, configuração e modo de criação. O contrato técnico interno ativo é apenas reutilizado quando existe; nenhum contrato comercial é criado. A fronteira traduz `yux_operator` para o papel legado `yux_manager` somente ao consultar catálogo de permissões, preservando `yux_operator` no contrato público.
- Correções: `CorrectionTargetV1` substitui `fixHref` nas respostas operacionais e é resolvido por mapa fechado. `targetAudience`, `desiredChannels` e `automationGoal` recebem rótulos humanos; respostas de briefing permanecem na missão. O painel salva pela própria conversa, o Harness revalida, retry conserva texto/identidade e indisponibilidade mantém a carteira com alternativa permitida.
- Canais e pertença: workspace interno opera canais sem contrato comercial; leitura continua disponível ao papel habilitado, mas alteração fica desativada quando `canConfigure=false`. A API deriva a organização da conexão antes da autorização. Criação de conversa rejeita contrato ativo pertencente a outra organização.
- Verificação local: backend com 158 arquivos/649 testes aprovados; frontend com 128 arquivos/546 testes aprovados; type-checks e builds aprovados. O browser percorreu criação conversacional, correção inline de “Público-alvo”, retorno à mesma conversa e refresh, em 1440×1000 e 390×844, sem erro relevante de console ou overlay. A revisão visual encontrou e corrigiu o contraste das mensagens; as capturas ficaram temporárias fora do repositório.
- Aceite persistente: execução GitHub Actions `34043197976`, commit `8835a01`, conclusão `success` em Backend, Frontend, Agent Runtime e Backend integration. O teste PostgreSQL real comprovou workspace interno, cliente A, membro somente leitura, operador e negação ao cliente B.
- Risco remanescente: OAuth Meta e provedores externos não fizeram parte desta tarefa; seus testes permanecem nos fluxos próprios. Destinos antigos sem equivalente seguro em `CorrectionTargetV1` ficam sem link acionável, em vez de transportar URL arbitrária.

## T24 — Fila diária unificada de trabalho humano

- Estado: aceita.
- Commit principal: `fea35f7`; correções persistentes concluídas em `ede5f51`.
- Achado: YUX-19.
- Projeção: `GET /api/workspace/work-items` reúne tarefas CRM, tarefas de projeto e execuções de intervenção humana por organização, responsável e prazo. A resposta conserva a identidade e versão da origem; não há cópia de tarefa nem estado paralelo.
- Conclusão: `POST /api/workspace/work-items/:sourceType/:sourceId/complete` exige versão, evidência não vazia e minutos positivos. CRM e projetos atualizam suas próprias tarefas e registram evento/auditoria; missões usam o resolvedor transacional do Action Engine, persistem evidência na observação, custo humano real e uma única transição `action.succeeded`.
- Segurança e concorrência: o escopo organizacional é fixado explicitamente no contexto do banco. Cliente de outra organização é negado, operador não conclui tarefa atribuída a outra pessoa e duas conclusões simultâneas produzem exatamente um sucesso e um conflito. O bloqueio CRM foi limitado à linha canônica da tarefa para preservar os relacionamentos opcionais da leitura.
- Interface: a fila aparece na área de tarefas com grupos Hoje, Atrasadas, Bloqueadas, Aguardando aprovação e Próximas; cada item abre a missão ou o registro de origem. O formulário de conclusão coleta evidência e minutos, e a timeline da missão oferece retorno à fila diária.
- Verificação local: backend com 159 arquivos/651 testes aprovados; frontend com 129 arquivos/547 testes aprovados; type-checks e builds aprovados. A revisão no navegador percorreu a fila e o formulário em desktop e mobile sem erro de console; as capturas permaneceram temporárias fora do repositório.
- Aceite persistente: execução GitHub Actions `34046216968`, commit `ede5f51`, conclusão `success` em Backend, Frontend, Agent Runtime e Backend integration. O PostgreSQL real comprovou as três origens, isolamento entre organizações, responsável incorreto, evidência obrigatória, conclusão concorrente, persistência de 17 minutos e uma única transição da ação.
- Retorno seguro: a projeção e sua rota visual podem ser retiradas sem apagar ou migrar as tarefas canônicas dos três domínios.

## T25 — Automações conectadas ao editor e executor reais

- Estado: aceita.
- Commit principal: `e721398`; estabilizações persistentes: `30b5305`, `40dd595` e `55cd982`.
- Achados: YUX-29, YUX-11 e YUX-15.
- Jornada: a rota oferecida no portal abre o workspace real de automações e conserva organização, contrato, papel e módulos do `WorkspaceContextV1`. Criar, editar, validar, salvar versão, ativar, pausar, duplicar, simular e consultar execuções usam as entidades canônicas existentes; não há estado paralelo no navegador.
- Segurança: validação do grafo ocorre no backend e cobre tipos registrados, entradas obrigatórias, arestas, ciclos, limites e ações externas. Simulação persiste resultado seguro sem criar execução ou consumir limite. Ativação cria snapshot imutável; o executor usa essa versão aprovada e não interpreta o desenho visual como autorização.
- Operação: rascunho, simulação e ativação são comandos separados. Duplicação é atômica e nasce desativada; pausa bloqueia novos efeitos sem apagar histórico. Eventos manuais recebem identidade persistida antes do despacho, e reprocessamento usa os índices idempotentes existentes.
- Verificação local: 654 testes backend e 549 frontend aprovados; type-checks e builds também aprovados. O ambiente local não possui Docker, por isso a jornada PostgreSQL/Redis foi fechada no runner isolado.
- Aceite persistente: execução GitHub Actions `34048715613`, commit `55cd982`, conclusão `success` em Backend, Frontend, Agent Runtime e Backend integration. O cenário comprovou refresh, simulação sem efeito, versão imutável, execução, pausa, duplicação, grafo inválido recuperável e isolamento entre duas organizações.
- Retorno seguro: desativar os comandos de criação/ativação mantém consulta, versões e execuções históricas intactas; nenhuma reversão exige reativar um fluxo anterior.

## T26 — Marketing Studio operacional de ponta a ponta

- Estado: aceita.
- Commit principal: `6bdf3d2`; isolamento e estabilização dos testes persistentes: `c766c02` e `c9b277c`.
- Jornada: resumo, campanhas, conteúdos, aprovações, calendário, conexões e execuções exibem registros reais. Planejamento usa entradas persistidas; conteúdo conserva versões e revisão; publicação usa exatamente a versão imutável aprovada.
- Efeito externo: a intenção idempotente é registrada antes do provedor. Sucesso conserva URL e identidade remotas; falha fica em estado seguro e auditável, sem declarar publicação. Organização, contrato, papel e conexão ativa são validados pelo backend.
- Interface: foram removidos números e estados fictícios. O portal apresenta progresso real, próxima ação, falhas recuperáveis e seleção da conexão efetivamente disponível.
- Verificação local: 654 testes backend e 553 frontend aprovados, além de type-checks, builds e lint direcionado. Datas de concessão do teste de autonomia passaram a ser relativas ao relógio da execução e a limpeza do cenário respeita a imutabilidade das versões aprovadas.
- Aceite persistente: execução GitHub Actions `34050855278`, commit `c9b277c`, conclusão `success` em Backend, Frontend, Agent Runtime e Backend integration.

## T27 — Biblioteca e onboarding orientados ao próximo passo

- Estado: aceita.
- Commit: `c7b9a04`.
- Jornada: acervo empresarial e metodologia estratégica aparecem como áreas distintas e conectadas. O percurso Enviar → Processar → Revisar → Publicar → Ver uso diferencia processamento, revisão, publicação, elegibilidade e uso confirmado, com uma ação primária no próximo passo.
- Rastreabilidade: cada consulta autorizada recebe registro persistente. A fonte só mostra “Usado por agente” quando existe `queryId` acessível ao papel atual; o diálogo apresenta consulta, perfil, módulo, quantidade de fontes e identidade do rastreio.
- Governança: publicação continua exigindo curadoria com evidência. Duplicados e conflitos podem ser filtrados, o público é resumido antes da publicação e o progresso pode ser salvo sem preencher título vazio. Sugestões do site nunca sobrescrevem automaticamente valor já confirmado e a aplicação recusa alteração concorrente.
- Acessibilidade e continuidade: erros relevantes usam anúncio semântico, o painel de contexto recebe foco, fecha por Escape e devolve o foco. O layout foi testado em 390 px e o destino fechado de `CorrectionTargetV1` conserva o retorno à missão ou conversa.
- Verificação local: 655 testes backend e 559 frontend aprovados, além de type-checks, builds, lint direcionado e checagem de patch.
- Aceite persistente: execução GitHub Actions `34051548840`, commit `c7b9a04`, conclusão `success` nos quatro jobs, incluindo a prova PostgreSQL/Redis de rastreio e escopo.

## T28 — Dependências, imagens e lint reproduzíveis

- Estado: aceita.
- Commits de implementação e estabilização: `2c7aa85`, `7ef13da`, `6fa10a6`, `094742d` e `9c73afe`.
- Dependências: locks Node foram renovados sem `--force`; produção do backend ficou sem advisories conhecidos e o frontend sem high/critical. O runtime Python possui locks separados de produção, teste e tooling, todos com hashes e validados em Python 3.13.
- Imagens: versões e digests estão fixados. Os runtimes usam Nginx slim, Python Alpine sem root e Node sem npm/npx. Revisões corrigidas de OpenSSL e `libuuid` são explícitas; cada imagem final é analisada e recebe SBOM CycloneDX.
- Lint: a dívida histórica virou baseline por assinatura e contagem. O gate rejeita nova ocorrência ou aumento, sem suppressions genéricas; os achados introduzidos pela atualização do analisador foram corrigidos.
- Reprodutibilidade: duas instalações e duas compilações Node produziram árvores e hashes idênticos. A instalação Python limpa com hashes passou em `pip check`, 189 testes e 15 cenários dourados.
- Riscos residuais: React Router 6 e Vite 5 conservam advisories documentados e delimitados no relatório de T28, com migração incompatível prevista até 2026-09-30. Nenhum high/critical alcança as dependências ou imagens de produção.
- Aceite persistente: execução GitHub Actions `34054082691`, commit `9c73afe`, conclusão `success` nos sete jobs, incluindo três builds de imagem, três scans sem high/critical e três SBOMs.

## T29 — Carregamento inicial e jornada medida

- Estado: aceita.
- Commit: `c7fa8ce`.
- Divisão: páginas são entradas tardias por rota; autenticação, papel, contexto e shell continuam carregados antes delas. Gráficos, canvas e editores pesados de automações e Marketing Studio só são importados quando a seção correspondente é usada.
- Dados: o hook compartilhado de Marketing recebe uma lista explícita de recursos por tela, evitando a cascata anterior de consultas não consumidas sem remover compatibilidade dos chamadores antigos.
- Orçamento: o JavaScript inicial caiu de 808.036 para 127.579 bytes gzip, redução de 84,21%. O build calcula a clausura estática real no manifest, grava relatório por jornada e falha acima de 404.018 bytes gzip ou abaixo de 50% de redução.
- Continuidade: falha de chunk apresenta recuperação dentro do shell e não tela branca. Rascunhos do planejamento de marketing e do grafo de automação permanecem na aba durante refresh e são removidos depois de salvar; a identidade do workspace/fluxo impede vazamento entre contextos.
- Piloto sintético: em Chromium 390×844 e preview de produção local, LCP da visão geral foi 80 ms, CLS 0,03 e a primeira ação da missão levou 24 ms. Uma missão abriu com comandos utilizáveis e o planejamento parcialmente preenchido sobreviveu ao refresh.
- Verificação local: 137 arquivos/562 testes frontend, type-check, build e orçamento aprovados. O lint permaneceu em 560 erros históricos e reduziu de 27 para 26 avisos sem nova assinatura.
- Aceite persistente: execução GitHub Actions `34056093562`, commit `c7fa8ce`, conclusão `success` nos sete jobs.

## T30 — Reconciliação do estado histórico por classe

- Estado: mecanismo e ensaio isolado aceitos; execução em produção deliberadamente não realizada.
- Commits: `b3be958` e `bf87441`.
- Manifesto: leitura por padrão, no máximo 20 itens, identidade do banco, versão esperada, hash por item e hash global. Aplicação exige arquivo intacto, hash aprovado e limite explícito; uma versão concorrente é ignorada, nunca forçada.
- Destinos: upload sem bytes retorna ao fluxo de envio conservando o registro como origem; curadoria órfã só retoma após conferir a fonte e usa job estável. Falha degradada, agente falho, conversa aguardando usuário, missão cancelada, mensagem antiga e efeito externo desconhecido preservam o estado e exigem a decisão apropriada.
- Auditoria: manifesto, itens, motivos e resultados são persistentes. Identidades e resultados concluídos não podem ser reescritos; exclusão é bloqueada. Queda entre o cancelamento seguro da execução órfã e a fila pode ser retomada pelo marcador do mesmo manifesto.
- Ensaio: um lote de cinco ficou parcial e a continuação concluiu os dois itens restantes. Uma mudança concorrente terminou `skipped`; conhecimento e learning receberam um job cada; nova aplicação retornou zero itens tratados e zero jobs adicionais.
- Verificação local: type-check, build e 655 testes backend aprovados. A integração local não iniciou por ausência dos serviços isolados.
- Aceite persistente: execução GitHub Actions `34057271273`, conclusão `success` nos sete jobs; o cenário PostgreSQL/Redis novo passou em Backend integration.
- Próximo passo operacional: recoletar produção em `--dry-run` somente na janela aprovada, após repetir o ensaio em uma restauração recente. Nenhum `--apply` de produção foi feito nesta tarefa.

## T31 — Jornadas técnicas integradas e experiência de uso

- Estado: gate técnico automatizado aprovado; aceite integral permanece aberto pelos gates externos e humanos.
- Commits da suíte e estabilizações: `a030a20`, `5a968e6`, `dcbce9`, `b0c8336`, `4cd8b57`, `22c3bc8`, `226aa11`, `9bf74db`, `ab35bf1`, `8d759a2`, `8c0dda8` e `50004cb`.
- Prova: a suíte Playwright executa J1–J7 serialmente sobre PostgreSQL, Redis, API, worker e runtime Python reais, com provedor controlado. Cada jornada produz evidência JSON sanitizada; falhas conservam relatório, trace, screenshot, vídeo e logs.
- Correções descobertas pela jornada: CORS passou a autorizar todos os métodos de mutação já usados pelo frontend; o contexto de tenant agora atravessa corretamente o hook assíncrono até consultas e transações RLS; a conclusão CRM compara a versão na precisão em milissegundos exposta pela API; a publicação estratégica atualiza dados sem desmontar o diálogo e perder a confirmação; o provedor controlado correlaciona a intenção; o webhook de atendimento é provado em modo manual sem contabilizar uma resposta autônoma ainda não validada.
- Verificação local: 160 arquivos/657 testes backend, 137 arquivos/562 testes frontend, type-checks e build/orçamento aprovados. O host local não possui os serviços Docker isolados.
- Estabilização posterior: uma execução de confirmação revelou que uma atualização equivalente do perfil podia repor o rascunho e que a timeline omnichannel repetia a consulta de mensagens a cada render. O formulário agora distingue mudança persistida real de nova referência equivalente; os dois workspaces usam defaults estáveis, resultado já carregado e guarda de requisição em andamento. Testes unitários provam preservação da edição e exatamente uma carga por conversa. O observador Playwright também espera a carga inicial e confirma as respostas HTTP de handoff/resolução; a URL esperada foi alinhada ao endpoint `/resolve` sem habilitar retry automático.
- Aceite persistente atual: execução GitHub Actions `34068006799`, commit `50004cb`, conclusão `success` em todos os oito jobs. `Acceptance journeys` passou J1–J7 e `Backend integration` passou 23 arquivos/33 testes com PostgreSQL e Redis reais.
- Limites preservados: J7 está completa no escopo automatizado. J1–J6 continuam com gates explícitos de ligação integral de IDs/efeitos. Sandbox oficial dos provedores, T22/OpenRouter com teto autorizado e avaliação cega, três testes moderados e execução operacional de T30 em restauração/produção não foram simulados nem marcados como aceitos.

## T32 — Manifesto, rollout compatível e fechamento por evidência

- Estado: implementada aguardando aceite; implantação não executada.
- Commits: preparação e gate `6e8191b`; repetição controlada do instalador de SBOM `d066704`; estabilização das jornadas `8c0dda8` e `50004cb`.
- Interface: `docs/releases/yux-remediation-manifest.json` registra commit/evidência técnica, digests pendentes, inventário agregado das 70 migrations, contratos/políticas, flags seguras, consumidores da fila antiga, suítes, backup e gates. O validador de CI recusa drift de migration, material com aparência de segredo, defaults de efeito habilitados ou promoção sem todas as provas.
- Compatibilidade: o Compose agora encaminha identidade de commit/manifesto e todas as flags de Mission/efeitos. Os defaults legados foram preservados para não desligar uma instalação existente durante simples atualização; o lote T32 registra e configura explicitamente as seis flags em `false` antes da implantação compatível. API e Harness expõem somente commit e hash do manifesto nos health checks; `unrecorded` mantém instalação antiga funcional, mas não permite considerar o piloto pronto.
- Rollout: o runbook central separa acesso/SQL, conhecimento e UX/efeitos; exige backup restaurado, readers antes de writers, workspace interno antes de uma organização piloto, 24 horas com amostras das rotinas e retorno sem downgrade destrutivo.
- Aceite persistente atual: execução GitHub Actions `34068006799`, commit `50004cb`, conclusão `success` nos oito jobs. Backend, integração persistente, frontend, Agent Runtime, J1–J7 e as três imagens/SBOMs passaram. A execução anterior da preparação revelou uma falha transitória no instalador Syft somente na matriz frontend; build e scan haviam passado. A CI tenta esse instalador uma única vez adicional e continua falhando se a repetição não concluir. As jornadas continuam seriais e sem retry automático.
- Bloqueios preservados: release commit/digests, restauração recente, alvo/matriz de tenants, imagens implantadas, sandbox oficial, T22 e três testes moderados continuam ausentes. O manifesto permanece `blocked`, com allowlist vazia e sem autoridade para produção, gasto ou contato externo.

## T33 — Correções da verificação pós-implantação

- Estado: implementação local concluída; implantação e evidência de produção pendentes.
- Escopo: achados V01, V02, V03, V04, V06 e V07 do relatório de 2026-09-07. Backup/restauração (V05) foi explicitamente adiado pelo proprietário e continua bloqueando o aceite final.
- Deploy: migrations saíram do processo da API para um serviço one-shot; API, workers e Harness exigem URLs próprias sem fallback privilegiado. Um segundo one-shot prepara os três volumes de aplicação para UID/GID `1000:1000`, e os processos normais só iniciam após os dois concluírem com sucesso.
- Recuperação: falha ao criar a quarentena de ingestão agora percorre o tratamento protegido, persiste `status=failed` e `failure_class=recoverable`, evitando upload preso.
- Produto: criação de missão respeita `MISSION_SUPERVISOR_ENABLED`; os cinco indicadores do Marketing Studio apontam para `/portal/marketing/studio`; e a interface diferencia item aprovado de pack efetivamente publicado pelo `current_release_id`.
- Observabilidade: somente o heartbeat mais recente por classe de fila compõe o estado atual, classes ausentes são degradadas e registros substituídos ficam contabilizados como histórico. A página administrativa passou a exibir workers, filas, outbox e Harness com estado indisponível explícito.
- Verificação local: testes focados, type-checks e builds de backend/frontend aprovados; Compose validado por parser YAML porque Docker não está instalado neste host. Integrações PostgreSQL/Redis ficam para a CI e a validação pós-deploy.
