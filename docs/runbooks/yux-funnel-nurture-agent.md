# Runbook — Agente de Funil + Nutrição (Release 2)

**Classificação:** primeiro vertical operacional completo e limitado do Mission Supervisor. Cria e publica funil, três templates citados, sequência com versões imutáveis e automação de entrada. Não é ainda um agente geral para campanhas ou qualquer área do sistema.

## Autoridade e limites

- O Harness propõe artefatos sem tools; o Action Engine recompila o pack `funnel_nurture@1.0.0`, valida o catálogo pinado e executa somente capabilities registradas.
- Conteúdo recuperado é evidência não confiável: pode fundamentar copy, mas não altera tools, permissões, schema, tenant, orçamento ou aprovação.
- `shadow` não persiste efeitos. `prepare` cria rascunhos, porém não publica. `assisted` exige aprovação exata para cada publicação. A preparação não inscreve leads existentes.
- O Action Engine é dono da intenção. A automação publicada é um subprocesso da Mission e respeita consentimento, suppression, limites, pause/cancel e ownership.
- Funil, templates, sequência e fluxo são mission-linked. Hash divergente exige nova revisão; e-mail já enviado nunca é descrito como reversível.

## Pré-requisitos de rollout

1. Aplicar migrations até `0139_funnel_nurture_rollout.sql`.
2. Configurar backend, worker e Harness com `YUX_AGENT_RUNTIME_URL`, `YUX_AGENT_RUNTIME_TOKEN`, provider do Harness, `ACTION_ENGINE_MUTATION_LEASE_SECRET` e chave de redaction.
3. No contrato piloto, habilitar `action_engine`, `crm`, `automations` e `funnel_nurture_agent`. O último é o flag comercial de rollout e não é habilitado automaticamente pela migration.
4. Confirmar CRM ativo, conexão de e-mail ativa, Company Context com ICP/oferta, regras de marca publicadas e ao menos uma fonte publicada permitida ao tenant.
5. Manter inicialmente as policies de `crm.pipeline.publish`, `email.template.publish`, `crm.sequence.publish` e `automation.flow.publish` desabilitadas. Liberá-las individualmente pelo cockpit somente depois do ensaio em `prepare`; approval continua `always`.
6. Confirmar que `/api/action-engine/action-packs` apresenta `funnel_nurture@1.0.0` com hash `d2f3f6fcd4a1778c8196737659d550f4886103ba78b6fb3db33a45a41675c97a`.

## Aceitação autenticada em organização descartável

Registrar organization, contract, Mission, snapshot, plan, approval e action-run IDs, hashes de contexto/plano/catálogo/pack, operador, horários, custo e resultado.

1. Abrir Missões e escolher **Funil + nutrição**. Confirmar modo `prepare`, áreas CRM/Automações/Agente e limites explícitos.
2. Planejar. Se ICP ou oferta estiver ausente, responder uma ficha com no máximo três perguntas; nenhum efeito pode existir antes disso.
3. Revisar quatro classes de artefato no cockpit: estágios do funil; três e-mails; timeline da sequência; gatilho, condições e saídas da automação. Cliente vê fontes rotuladas, sem excerpt interno nem controles de mutação.
4. Aprovar o plano legível. Alterar um artefato e confirmar que o subject/hash anterior não aprova a nova revisão.
5. Iniciar em `prepare`. Confirmar rascunhos mission-linked, três `email_template_versions` imutáveis e simulações com zero inscrições existentes.
6. Habilitar uma publication capability por vez, mudar a Mission para o fluxo assistido aprovado e autorizar os hashes exatos. Confirmar funil, templates, sequência e fluxo publicados sem envio ou matrícula de lead real.
7. Remover temporariamente `funnel_nurture_agent` do contrato antes de uma publicação e confirmar bloqueio no preflight; restaurar somente após registrar a evidência.
8. Ativar kill switch de `automation.flow.publish@1` e confirmar que apenas esse efeito para. Pausar a Mission e confirmar que nenhum worker subsequente produz efeito.
9. Avaliar economia e atribuição. Sem identidade/evidência elegível, valor permanece `unknown`; não converter ausência de evidência em zero.

## Evidência automatizada local

- `backend/tests/funnel-nurture-e2e.test.ts`: pack protegido, 21 passos, bindings de versões, aprovação e kill switch.
- suites de CRM funnel/nurture: drafts, hashes stale, consentimento, suppression e zero enrollment.
- corpus Python adversarial: override de instruções, system falso, conteúdo codificado, escalada de tools e bait cross-tenant.
- suites de executor/safety: job duplicado, Mission pausada, claims, tenant boundary, catálogo pinado e efeitos unknown.

O ensaio autenticado na VPS e os IDs reais permanecem pendentes até deploy; não preencher esta seção com fixtures locais.

## Gatilhos objetivos de rollback

- imediato: exposição cross-tenant/segredo/PII, efeito sem autorização, mutação em `shadow`, publicação de hash diferente, efeito após kill switch ou retirada do entitlement;
- imediato na capability: publicação duplicada, automação matriculando população existente ou bypass de consentimento/suppression;
- rollout: efeito `unknown` além do SLO do provider, regressão das golden missions, falha de migration/integridade ou duas janelas consecutivas de 15 minutos fora do SLO;
- produto: taxa de opt-out/complaint acima do guardrail do pack ou custo acima do envelope.

## Contenção e rollback

1. Desabilitar primeiro a capability exata afetada; se a fronteira for incerta, retirar `funnel_nurture_agent` dos contratos piloto e definir `MISSION_SUPERVISOR_ENABLED=false`.
2. Pausar as Missions afetadas. Preservar drafts, versões, approvals, attempts, eventos, custos, manifests e snapshots.
3. Conter fluxos/sequências pausáveis. Não apagar templates nem prometer undo de efeito irreversível.
4. Reconciliar efeitos externos `unknown` por idempotency key/provider antes de qualquer retry.
5. Reverter imagens de backend, worker, frontend e Harness. Migrations aditivas permanecem; correções de banco são forward-only.
6. Liberar resource claims por último, depois de confirmar que nenhum worker antigo mantém lease/fencing token válido.
7. Reabilitar em ordem: leitura → shadow → prepare → uma publication capability → assisted. Reexecutar E2E, isolamento tenant, corpus adversarial e inspeção de custos em cada passagem.

### Ensaio obrigatório

- **Falha de redaction injetada:** desligar planejamento, pausar Missions, preservar trace protegido e confirmar ausência de conteúdo sensível no portal/log antes de restaurar.
- **Duas janelas de SLO:** simular duas janelas consecutivas de 15 minutos fora do alvo, retirar o entitlement do piloto, conter publications e confirmar que drafts/histórico continuam legíveis.

## Estado desta entrega

- Testes/builds locais: executados na implementação da Release 2.
- A Recipe versionada `Funil + nutrição para imobiliária` fica disponível no início do intake e continua sujeita aos mesmos gates do pack pinado.
- O módulo contratual opcional `mission_sandbox` habilita a criação explícita de dados demo. Cada seed é idempotente, tenant-scoped e marcado com `is_demo`; esses registros não entram nas métricas reais.
- A limpeza usa o manifesto gravado. Se qualquer registro demo tiver sido editado, nenhum registro do manifesto é apagado automaticamente e o manifesto fica em `review_required`.
- Migration aplicada na VPS: pendente.
- Aceitação autenticada e ensaio de rollback na VPS: pendentes.
- Leads reais inscritos ou e-mails enviados neste aceite: nenhum; proibido no cenário descartável.
