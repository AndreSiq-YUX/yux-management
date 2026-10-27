# Rascunhos operacionais pela conversa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Native execution, one fresh-context final review.

**Goal:** Criar rascunhos reais de funil, três e-mails e uma sequência a partir de Missões, sem conexão de envio, publicação, importação de leads ou ativação automática.

**Architecture:** Introduzir o pacote publicado `crm_preparation`, restrito à preparação e com capabilities somente de leitura/rascunho. Reutilizar confirmação de briefing, revisão do plano, executor, assinaturas de mutação, idempotência e projeções de artefatos. CRM provisionado em `draft` aceita versões em rascunho e permanece inativo. A aprovação deste plano inicia somente a preparação e o resultado volta à conversa. O pacote completo `funnel_nurture` mantém suas exigências de ativação.

**Tech Stack:** Python/Harness/Pydantic, Fastify/TypeScript/Postgres, React, pytest/Vitest.

**Spec:** Pedido do usuário em 27/10/2026: “Pode corrigir esse fluxo completo para o agente criar os rascunhos de CRM, funis e e-mails pela conversa, sem exigir conexão de envio nessa etapa.” Diagnóstico confirmado: `ready_with_missing_context`, CRM provisionado em draft, zero artefatos/ações; CRM+Automações ativos, pacote completo sem habilitação e sem conexão própria de e-mail.

## Global Constraints

- Nenhuma chamada paga, alteração de modelo/limite/credencial ou reprocessamento real sem autorização específica. Desenvolvimento e integração usam provedores simulados.
- Preparação não exige conexão de envio nem habilitação de ativação de Funil+Nutrição. CRM/Automações, permissões do ator, organização/contrato e capacidade de criar rascunhos continuam obrigatórios.
- Não ativar CRM, publicar funil/template/sequência, ativar automação, inscrever/importar leads ou enviar mensagens. Não remover requisitos dos pacotes existentes.
- Manter todas as aprovações de publicação/contato, governança do conhecimento, prevenção de duplicatas, isolamento e confidencialidade do Radar do AGENTS.md.
- Preservar a frente de usuários/convites em main (`fb559b5`) e demais frentes. Reutilizar o worktree limpo e branch `codex/conversational-crm-drafts`.
- Pacote inicial prepara um funil com estágios configuráveis, três templates e uma sequência desativada; múltiplos caminhos comerciais são estágios/condições de saída, sem criar automações ativas nem ultrapassar limites da conta.

## Review Focus

- Briefing ou plano adulterado não pode misturar preparação com publicação/contato, trocar de conta ou ampliar capabilities.
- Uma pendência exclusiva de ativação não pode impedir o rascunho; uma pendência necessária ao próprio rascunho continua bloqueando confirmação.
- Repetir aprovação, job, início ou criação não duplica missão, artefatos nem mensagens de conclusão.
- Ausência de CRM provisionado, contrato/módulo revogado, estado suspenso e permissão insuficiente falham com indicação útil e sem novos direitos.
- Interface e HTTP distinguem proposto, criado e publicado; nenhuma proposta é anunciada como salva antes da persistência.

### Task 1: Contrato e prontidão da conversa

**Files:** `workers/marketing-studio-agent-runtime/yux_agent_runtime/mission_conversation.py`, `mission_conversation_prompt.py`, `workflow.py`; testes `test_mission_conversation.py` e novo `test_crm_preparation_conversation.py`.

**Interfaces:** `_normalize_readiness` corrige status pronto contraditório para `needs_information`/`needs_configuration`, preservando pendências; orientações do agente escolhem `crm_preparation` para rascunhos e separam requisitos futuros em constraints. Somente o catálogo autoriza o pacote. Nenhuma flexibilização de referências de fontes.

- [x] RED: reproduzir status pronto+missing que hoje gera 422; pendências necessárias continuam presentes e não há confirmação prematura.
- [x] GREEN: normalização conservadora; instruções de seleção, modo prepare, limites zero e fontes exatas; recuperação histórica não exige reenviar mensagem.
- [x] Verificar pytest focado e suíte; registrar resultado e commit. Runtime 459 passed, 7 skipped.

### Task 2: Pacote de preparação e persistência segura

**Files:** novo `backend/src/modules/action-engine/packs/crm-preparation-v1.ts`, registro interno de publicação; `readiness.ts`, `capabilities/system.ts`, `crm/mission-commands.ts`, testes de pacote/domínio/prontidão.

**Interfaces:** `CRM_PREPARATION_PACK_V1` possui hash/topologia imutáveis, nenhuma conexão e capabilities de leitura/rascunho; parâmetros reutilizam ICP/oferta. `ensureCrmPreparationPackVersion(pool, actorId)` publica somente a definição. Criação de versão do funil aceita CRM draft/active pertencente à mesma conta; não ativa a instância. Preflight distingue preparar de ativar.

- [x] RED: CRM draft sem e-mail permite rascunho; pacote não contém publish/send/enroll/wait. Estados ausentes/suspensos e isolamento também cobertos no gate integrado da Task 5.
- [x] GREEN: pacote restrito, publicação idempotente, leitura e escrita transacionais com organização explícita. Preservar prontidão dos pacotes anteriores.
- [x] Verificar Vitest focado e build; registrar resultado e commit. Backend 1.625 passed/126 skipped; focados finais 11 passed; build aprovado.

### Task 3: Do briefing ao plano e aos artefatos

**Files:** `mission-conversations.ts`, `mission-account-availability.ts`, `context-builder.ts`, `routes.ts`, `jobs/handlers/action-engine.ts`; `mission_router.py`, `mission_supervisor.py`, testes de planejamento/conversão.

**Interfaces:** catálogo inclui apenas preparação autorizada; briefing confirmado vira missão `prepare`, com capacidades restritas, contatos zero e prazo técnico de preparação quando ausente. Planner/specialists reutilizam artefatos de funil/e-mail/sequência e retiram automação não solicitada. Estado operacional inclui prontidão do CRM/pacote sem fornecedores. Pacotes de ativação mantêm checks atuais.

- [x] RED: pedido de rascunhos não escolhe pacote de ativação; confirmação cria missão exata/idempotente sem conexão; ICP/oferta ausentes pedem esclarecimento; modo/capabilities/tenant adulterados recusam.
- [x] GREEN: integrar pacote em catálogo, confirmação, roteamento, validação do plano, preflight e fontes. Não criar qualquer artefato só porque foi citado no texto.
- [x] Verificar testes Python/TypeScript focados, builds e registrar commit. Backend 1.627 passed/126 skipped; runtime 461 passed/7 skipped; build aprovado.

### Task 4: Aprovação, execução e retorno à conversa

**Files:** `routes.ts`, `executor.ts`, `jobs/handlers/action-engine.ts`, novo `metrics/crm-preparation.ts`, `evaluator.ts`, `mission-artifacts.ts`, `MissionConversationThread.tsx` e testes.

**Interfaces:** aprovação do plano `crm_preparation` inicia apenas suas ações draft; executor mantém manifesto/leases/idempotência. Métrica determinística comprova rascunhos persistidos, conclui sem observação de 30 dias e projeta resultado/IDs seguros na conversa. O usuário revisa artefatos pelo detalhe da missão. Não inventar status salvo nem deixar polling eterno.

- [x] RED: aprovação inicia somente preparação; retries não duplicam; resultado só aparece após criação comprovada; artefatos não incluem automação fantasma nem status publicado.
- [x] GREEN: execução restrita, conclusão idempotente e mensagem legível com acesso aos rascunhos; aprovação de publicação permanece separada.
- [x] Verificar suites focadas, interface e registrar commit. Banco local: oito ações e cinco rascunhos; frontend 1.283 passed; runtime 461 passed/7 skipped.

### Task 5: Fluxo integrado, regressões e entrega

**Files:** novo `backend/tests/integration/mission-crm-preparation.test.ts`, fixtures/testes existentes e `docs/runbooks/mission-conversation-rollout.md`.

**Interfaces:** HTTP real + banco local + geração simulada: criar conversa → briefing → plano → aprovação → worker → rascunhos → refresh, com e-mail desconectado e CRM draft; provar nenhuma publicação, contato ou inscrição. Quatro perfis, isolamento e revogação durante a execução.

- [x] RED/GREEN de integração completa, HTTP direto, retorno ao chat, duplicatas e gates de publicação intactos.
- [x] Suítes adequadas, builds, lint dos arquivos alterados e conferência no navegador sem provedor pago. Chromium desktop/mobile, fluxo real com banco descartável.
- [x] Revisão independente única de todo o diff; quatro achados corrigidos em uma passagem RED/GREEN. Backend 1.635 passed/126 skipped, runtime 461 passed/7 skipped; integração com bloqueio/retomada e prontidão v1 preservada.
- [x] Integrar main preservando concorrência e preparar a implantação sob a autorização existente. Verificação final de código/serviços registrada na evidência da entrega, sem criações reais nem inferência paga.
