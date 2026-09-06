# Decisões de execução — correções integradas YUX Hub

## D-001 — Base e isolamento do trabalho

- Status: decidida.
- Decisão: usar `000f8bce9c923c2c4f78c307efe58479eb7deb4a` como base reconciliada e a branch `codex/yux-remediation-integrated` para as correções.
- Motivo: o HEAD é exatamente o commit auditado e não há alterações versionadas locais; os arquivos não versionados pertencem ao usuário e permanecem fora do escopo.

## D-002 — Numeração de migrations

- Status: decidida.
- Decisão: preservar `0001`–`0152` sem alteração. A integridade do migrador não exigiu migration própria; `0153_service_roles_and_tenant_scope.sql` foi usada para papéis/RLS. As próximas reservas são `0154` para leases/tentativas, `0155` para publicações e `0156` para política de retrieval.
- Motivo: o repositório contém 55 arquivos de migration e `0152` é o maior número presente no início da execução. O nome final será ajustado à implementação real; número reservado não obriga criar migration vazia.

## D-003 — Ambiente de integração

- Status: decidida.
- Decisão: o ambiente descartável usará PostgreSQL 17 e Redis 7 reais, nomes/volumes exclusivos de teste e bloqueio explícito de hosts/bancos que não atendam ao prefixo `yux_test_`. Provedores externos serão substituídos somente na borda por servidor HTTP determinístico.
- Motivo: cumprir o contrato de T02 sem apresentar mocks de persistência ou fila como prova de integração.

## D-004 — Dados operacionais não disponíveis localmente

- Status: pendente de ambiente, sem bloquear tarefas locais.
- Itens pendentes: domínio administrativo seguro definitivo; destino e custódia de backup; CPU/memória/armazenamento da VPS; inventário de backups externos; digests efetivamente implantados; contas de teste/live dos provedores.
- Tratamento: T04 não será declarada aceita sem ensaio real de restauração e acesso; T11/T13/T22/T31 usarão provedores controlados localmente e manterão separado qualquer aceite live.

## D-005 — Metas operacionais iniciais

- Status: decidida para ensaio.
- Decisão: RPO alvo de até 1 hora e RTO alvo de até 4 horas, como definido no plano. Qualquer ajuste exige medição e justificativa registradas antes do piloto.

## D-006 — Flags e configuração observadas

- Status: registrada.
- Compose atual: criação conversacional desativada por padrão no backend, formulário de compatibilidade ativado por padrão no frontend, curadoria de conhecimento ativada e limite de site configurado em 30 páginas.
- Regra: presença/configuração não será apresentada como validação operacional; nenhum segredo será copiado para manifestos ou logs.

## D-007 — Fronteira durável dos webhooks omnichannel

- Status: decidida.
- Decisão: o reconhecimento de webhook Meta depende do commit conjunto de `channel_webhook_events` e do evento de domínio, nunca do enqueue no Redis. A delivery referencia o UUID persistido e resolve organização/conexão novamente no servidor.
- Motivo: eliminar perda entre banco e fila, preservar deduplicação por evento externo e impedir que dados de tenant fornecidos pelo job substituam a autoridade da conexão persistida.

## D-008 — Identidade e fronteira do despacho de sequências CRM

- Status: decidida.
- Decisão: cada passo usa `sequence:<enrollmentId>:step:<stepId>` como identidade imutável de execução; email e WhatsApp são materializados como intenções locais na mesma transação do evento de domínio. Somente os handlers nativos fazem a chamada externa, depois de revalidar consentimento, conexão e restrições do canal.
- Motivo: concorrência e indisponibilidade do Redis não podem duplicar nem perder o efeito, e um aceite do provedor não deve ser confundido com entrega final sem o recibo correspondente.

## D-009 — Registro executável e indisponibilidade honesta de jobs

- Status: decidida.
- Decisão: um job só pode ser produzido se existir no registro único com schema e handler. Capacidades ainda sem integração automática não usam um job que falhará depois: agendamento vira tarefa humana identificada e simulação fica restrita a um ledger de sandbox sem conexão com conversas reais.
- Motivo: eliminar sucesso aparente seguido de falha inevitável no worker e impedir que dados sintéticos sejam apresentados como interação de cliente.

## D-010 — Identidade de intenção para efeitos de provedores

- Status: decidida.
- Decisão: usar o UUID do run do Action Engine como `intentId` quando a origem for uma ação e exigir UUID explícito nas operações administrativas. Hash do payload, aprovação e hash do objeto aprovado ficam congelados com a intenção; alteração legítima posterior cria nova intenção.
- Ambiguidade: depois que a chamada externa começou, erro de rede compatível com resposta perdida não autoriza repetição. O estado permanece `unknown` e segue para reconciliação ou revisão manual; exatamente uma chamada não é alegada quando o provedor não oferece deduplicação/reconciliação suficiente.
- Motivo: distinguir retry da mesma decisão de uma nova decisão comercial, sem ocultar efeitos possivelmente aceitos pelo provedor.

## D-011 — Topologia e transição das filas

- Status: decidida.
- Decisão: separar cargas em quatro filas por classe, conservando nome e identidade do job. `yux-jobs` é somente compatibilidade de drenagem; a API nova não publica em dois destinos. A liderança dos schedulers depende de advisory lock PostgreSQL, não da quantidade de containers.
- Limite inicial: 2 workers lógicos interativos, 1 de ingestão, 2 externos e 1 de manutenção por processo. A serialização local por organização/provedor é suficiente apenas para a topologia inicial de uma réplica por classe; escala horizontal exige limitador distribuído e nova evidência.
- Motivo: evitar que curadoria longa bloqueie atendimento e impedir que escala operacional multiplique timers ou efeitos externos.

## D-012 — Saúde não é presença de configuração

- Status: decidida.
- Decisão: liveness responde apenas pelo processo; readiness básica cobre banco e Redis; saúde operacional autenticada cobre workers, filas, outbox, Harness e provedores. Falha terminal histórica continua visível como contagem, mas não mantém incidente atual aberto sozinha.
- Credenciais: banco ativo com segredo decifrável prevalece sobre ambiente permitido. Ausência ou segredo inválido cai para ambiente sem expor valor. `verifiedAt` só será preenchido por teste operacional explícito do provedor.
- Custos: ausência de preço ou usage é `NULL` e `unavailable` com motivo; zero fica reservado a medição verdadeira de custo zero.
