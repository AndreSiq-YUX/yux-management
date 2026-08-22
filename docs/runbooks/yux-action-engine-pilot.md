# Runbook — Revenue Recovery Pack v0

**Escopo:** rollout e primeiro canary no workspace Crescimento YUX  
**Regra de segurança:** nenhum efeito externo antes de readiness verde, aprovação do plano e aprovação do lote canário.

## 1. Pré-deploy

- Fazer backup e validar restauração do banco alvo.
- Aplicar a migration `0128_action_engine_foundation.sql` primeiro em Postgres descartável.
- Confirmar que `action_engine` aparece em `platform_modules` com `/missions` e `/portal/missoes`.
- Habilitar o módulo somente no contrato/workspace piloto.
- Configurar backend, worker e Agent Harness; validar Redis e Postgres.
- Confirmar que o hash publicado de `revenue_recovery@0.1.0` coincide com o hash compilado.
- Manter envio direto por e-mail, WhatsApp e Automation desabilitado durante todo o piloto `0.1.0`; eles não fazem parte do catálogo executável desta versão.

## 2. Smoke técnico

1. Consultar `/api/health/ready`.
2. Consultar `/api/action-engine/operations/health?organizationId=<org>` com sessão interna.
3. Abrir `/missions` e o client workspace em `/client-workspaces/<org>/missoes`.
4. Criar uma Mission em `shadow` ou `prepare` com target e budgets pequenos.
5. Executar readiness; qualquer check `block` interrompe o rollout.
6. Qualificar e solicitar plano.
7. Confirmar que a revisão contém todos os protected step keys, pack hash correto e lote canário `<= 20`.
8. Aprovar o plano por hash e iniciar.
9. Confirmar criação de action runs, attempts, approvals, events e cost entries.
10. Pausar e retomar antes do primeiro efeito externo; confirmar que nenhum job ignora o estado.

## 3. Critérios para autorizar o canary

- CRM e owner disponíveis;
- população elegível revisada e exclusões aplicadas;
- base legal/consentimento e suppression verificáveis;
- abordagem e canal humano revisados;
- pack/hash e plan/hash conferidos;
- budget total, horas humanas e taxa horária congelados;
- aprovações de population, canary e efeito externo presentes;
- ownership exclusivo sem conflito não resolvido;
- dashboard de métricas/economia acessível;
- responsável operacional e janela de acompanhamento definidos.

## 4. Canary

- Usar no máximo 20 contatos.
- Executar pelo caminho humano. Não ativar envio direto por e-mail/WhatsApp nesta versão do pack.
- Acompanhar entrega, resposta, opt-out, reclamação, ownership conflict, custo e horas humanas.
- Pausar imediatamente em reclamação relevante, violação de consentimento, duplicidade, custo fora do envelope ou divergência de ownership.
- Não ampliar população, canal ou budget sem nova aprovação versionada.

## 5. Indicadores operacionais

No health operacional observar:

- Missions por estado;
- actions `failed/blocked`;
- waits duráveis vencidos ou acumulados;
- aprovações pendentes;
- Agent Harness configurado;
- hash do pack publicado.

Na Mission observar valor produzido, custo total, valor/custo, horas humanas, execução sem humano, guardrails e decisão do último checkpoint.

## 6. Pausa e rollback

Para contenção, pausar ou cancelar a Mission pela API/UI. Isso impede novos claims e efeitos no preflight. Em seguida:

1. desabilitar/kill-switch das capabilities externas da organização;
2. pausar flows mission-bound ainda em execução;
3. reconciliar provider requests já aceitos;
4. registrar reversal para custos reservados indevidos — nunca editar o ledger;
5. liberar ownership somente após reconciliar subprocessos;
6. preservar plano, attempts, approvals, events e evidence para análise.

Rollback de aplicação usa a versão anterior dos serviços. A migration é aditiva; não apagar tabelas durante incidente. Se necessário, desabilitar o módulo no contrato para remover acesso sem destruir histórico.

## 7. Encerramento do piloto

Registrar outcome confirmado, custo total, horas humanas, incidentes, intervenções, razões de bloqueio e alterações propostas. Melhorias viram candidatas a uma nova versão do pack; `0.1.0` e planos aprovados permanecem imutáveis.
