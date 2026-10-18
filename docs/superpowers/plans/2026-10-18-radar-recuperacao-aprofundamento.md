# Radar: recuperação do aprofundamento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recuperar os aprofundamentos do lote existente sem repetir descoberta, ocultar falhas ou publicar fatos sem comprovação.

**Architecture:** Preservar o pipeline atual e os recibos. Separar classificação de qualidade de bloqueio operacional, mover a decisão de disponibilidade para as etapas que realmente precisam do recurso e produzir diagnósticos estruturados. Revalidar respostas salvas sem nova compra; mudanças de interface apenas nos controles/resultados do Radar.

**Tech Stack:** Fastify/TypeScript, PostgreSQL/RLS, BullMQ/outbox, runtime Python/FastAPI, React/Vite/Vitest, pytest e navegador conectado com fontes simuladas.

**Spec:** `docs/superpowers/specs/2026-10-18-radar-recuperacao-aprofundamento-design.md`

## Global Constraints

- Somente `yux_admin` recebe fontes, ferramentas, modelos, custos, limites e diagnósticos técnicos; manter allowlists HTTP aninhadas e testes de isolamento entre contas.
- Não executar provedores/LLMs pagos, alterar modelos/chaves/cotas/orçamento de produção nem fazer deploy sem autorização específica. O desenvolvimento usa provedores simulados.
- Não apagar resultados, auditoria, recibos, overflow, revisões ou contadores. Não reenviar chamadas com resultado incerto.
- Não relaxar DNS fixado, bloqueio de redes privadas, TLS, robots, tamanho de resposta, leases ou contratos de transporte. Autorizações de certificado continuam específicas e temporárias.
- Manter o visual aprovado da YUX e o roteamento LLM existente do Admin. Não criar preset setorial/geográfico nem modificar CRM, missões, WhatsApp ou outros módulos.

## Review Focus

1. Um dossiê sem identidade oficial ser chamado de completo apenas para reduzir os bloqueios: testar insuficiência comercial sem aprovação artificial.
2. Uma retomada com quota esgotada disparar nova descoberta/busca por ignorar disponibilidade: provar zero descoberta e reserva por efeito, além de recuperação de checkpoints.
3. Recuperação de perfil rejeitado repetir uma chamada paga ou publicar trecho inventado: conferir recibo/request/evidence identity e testes de fatos válidos/invalidáveis separados.
4. Referência externa com nome/CNPJ exatos ganhar contatos próprios: testar diretórios e notícia com telefone/e-mail do editor; manter domínio institucional legítimo elegível.
5. Nova mensagem detalhada vazar ferramentas/custos ao cliente ou ignorar revogação de acesso: HTTP direto com Admin, operador, admin de conta, membro e outra conta.

---

### Task 1: Classificação e motivo recuperável por etapa

**Files:** criar `backend/src/modules/radar/capture-research-state.ts`; modificar `capture-dispatch.ts`, `capture-operation.ts` e testes `radar-capture-dispatch.test.ts`, `radar-capture-operation.test.ts` e `radar-commercial-view.test.ts`.

**Interfaces:** Produz `assessRadarCaptureResearch(run)` retornando `{status:'researching'|'completed'|'insufficient'|'blocked',reason?:string,stage?:'discovery'|'reading'|'presence'|'qualification'|'profile'}`. A entrada mantém os campos atuais do trabalho: status, error_code, lease_until, output e calls. `classifyRadarCaptureResearch` delega para manter consumidores. O DTO técnico continua exclusivo do Admin; projeção cliente recebe somente estados/mensagens comerciais permitidos.

- [ ] **Step 1:** Escrever testes: `partial` em `review` com `radar_qualification_waiting_identity` e sem efeitos pendentes resulta `insufficient`, nunca `completed`; `source_limit_exceeded` que impede etapa necessária e chamadas incertas produzem bloqueio específico; aviso incidental de quota após todas as etapas obrigatórias não invalida o resultado; perfil rejeitado não vira aprovação. Acrescentar quatro papéis HTTP e isolamento de conta para qualquer campo novo.
- [ ] **Step 2:** Rodar `node node_modules/vitest/vitest.mjs run tests/radar-capture-dispatch.test.ts tests/radar-capture-operation.test.ts tests/radar-commercial-view.test.ts --reporter=dot`. Esperado: regressões novas falham pela classificação/motivo, não por infraestrutura.
- [ ] **Step 3:** Implementar a avaliação estruturada e persistência do motivo sem depender de um regex genérico que transforma toda pendência de evidência em falha operacional. Não reescrever histórico nem classificar como concluída empresa sem os critérios configurados.
- [ ] **Step 4:** Repetir testes e type-check backend; esperado: aprovados e nenhuma nova informação técnica a cliente. Commit do diagnóstico/classificação.

### Task 2: Recuperar o mesmo lote com disponibilidade por efeito

**Files:** modificar `capture-discovery.ts`, `capture-dispatch.ts`, `capture-preflight.ts`, `research-service.ts`, `research-availability.ts`; testes `radar-capture-preflight.test.ts`, `radar-capture-dispatch.test.ts`, `radar-research-persistence.test.ts` e `tests/integration/radar-capture-operation.test.ts`.

**Interfaces:** Consome a avaliação da Task 1. Disponibilidade de recuperação distingue etapas com checkpoint de etapas que precisam de busca nova, conservando o contrato de autorização comum. Fonte/orçamento continuam verificados dentro de cada reserva paga.

- [ ] **Step 1:** Reproduzir em PostgreSQL vinte itens admitidos e descoberta `target_reached`; quota de busca esgotada, parte com evidências salvas e parte sem páginas. Retomar permite somente o trabalho disponível, conserva todos os IDs/recibos e produz zero chamadas de descoberta. Casos negativos: revogação de papel/contratação, nova revisão, campanha pausada, efeito incerto e carteira necessária ausente.
- [ ] **Step 2:** Rodar as suítes de captação/persistência com `YUX_RADAR_TEST_DATABASE_URL` isolado; worker com `--config vitest.integration.config.ts`. Esperado: recuperação por checkpoint falha antes da correção; testes não acessam serviços externos.
- [ ] **Step 3:** Remover o bloqueio indiscriminado de buscas apenas da recuperação comprovada; delegar a autorização do efeito ao serviço que já controla recibo, quota e licença. Pausar o que depende de novas consultas sem consumi-las; informar capacidade/limitação de aprofundamento no preflight sem aumentar limites.
- [ ] **Step 4:** Repetir PostgreSQL e integração real do worker; esperado: cada item termina ou informa impedimento real, dados e consumo preservados. Commit da recuperação.

### Task 3: Evidências institucionais e resposta de IA verificável sem perda desnecessária

**Files:** modificar `source-identity.ts`, `research-service.ts`, `company-profile.ts`; runtime `workers/marketing-studio-agent-runtime/yux_agent_runtime/radar_qualification.py`, `radar_presence.py`, `api.py` somente no contrato Radar. Testes `radar-source-identity.test.ts`, `radar-company-profile.test.ts`, `radar-research-service.test.ts`, `radar-research-persistence.test.ts` e `workers/marketing-studio-agent-runtime/tests/test_radar_qualification.py`, `test_radar_presence.py` e testes de API correspondentes.

**Interfaces:** Classificador de fonte mantém referências separadas de titularidade/contatos. Adicionar `validateRadarCompanyProfileClaims(raw,evidence):{profile:RadarCompanyProfile,rejections:Array<{field:string,code:string}>}` para a recuperação parcial, mantendo a validação estrita existente para consumidores que a exigem. A qualificação independente não é apagada por uma afirmação inválida do perfil. Erro 422 do Radar possui causa tipada segura quando identificável, sem corpo externo ou dados de entrada em erros HTTP.

- [ ] **Step 1:** Testar notícia e diretório com nome/CNPJ reais e contatos do publicador: não são site oficial nem contatos da empresa. Testar resumo/serviços válidos junto de métrica/trecho inválido: preservar apenas fatos verificáveis, registrar rejeição e não promover fit/identidade sem prova.
- [ ] **Step 2:** Caracterizar o caminho 422 com respostas e contratos simulados: JSON truncado/inválido, pedido inválido antes de provedor e afirmação rejeitada depois de provedor. Demonstrar em testes a distinção entre repetição segura e recibo que exige nova autorização. Não afirmar que o 422 observado veio de um caso ainda não comprovado.
- [ ] **Step 3:** Rodar os testes backend/runtime e observar as falhas novas. Corrigir o contrato somente após a reprodução correspondente; manter IDs de evidência e validação de números, datas, escopo e trechos. Reaproveitar respostas/recibos já salvos; não introduzir retry pago automático.
- [ ] **Step 4:** Rodar novamente backend/runtime e a persistência PostgreSQL; esperado: fatos inválidos nunca publicados, fatos válidos conservados, nenhuma compra duplicada. Commit do contrato/evidências.

### Task 4: Apresentação, regressão completa e publicação

**Files:** modificar `frontend/src/components/radar/RadarCaptureProgress.tsx`, `RadarCaptureControls.tsx`, `RadarCandidateResearchPanel.tsx`, `RadarWorkspace.tsx`, `frontend/src/lib/radar/radarResearchMessages.ts` e tipos/testes relacionados; atualizar `docs/runbooks/radar-pesquisa-configuravel.md`. Não reorganizar visualmente o restante do portal.

**Interfaces:** Consome motivos/recuperação das Tasks 1–3. Uma ação contextual recupera etapas pendentes do mesmo lote; nova pesquisa completa/IA permanece confirmação distinta quando necessária. Barra não conta bloqueados como encerrados. Cliente não recebe nomes técnicos nem custos.

- [ ] **Step 1:** Testes: dezenove impedidos e um insuficiente não resultam barra de 100%; motivo da etapa é visível ao Admin e comercial ao cliente; abrir dossiê em carregamento não informa prematuramente ausência de pesquisa; recuperar etapas salvas não cria novo lote. Cancelar confirmação não altera pedido.
- [ ] **Step 2:** Rodar testes de componentes antes da implementação e confirmar falha dos cenários novos. Implementar com componentes/visual atuais; repetir testes, type-check, build, orçamento de bundle e lint comparativo.
- [ ] **Step 3:** Verificar no navegador local Admin → lote parcial → detalhes/motivos → recuperação → recarga, desktop/mobile, com fontes/IA simuladas e banco real isolado. Rodar suítes completas backend/frontend/runtime, PostgreSQL e worker; revisão final independente da branch conforme execução nativa.
- [ ] **Step 4:** Publicar correção testada em main conforme autorização de publicação existente, preservando o portal. Informar explicitamente o que foi corrigido, validado e o que depende de deploy/piloto. Antes de deploy ou de novas buscas/análises pagas do lote real, obter autorização específica sem reutilizar aumentos temporários anteriores.
