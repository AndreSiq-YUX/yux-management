# Disponibilidade real da conta no Action Engine — Implementation Plan

> **For agentic workers:** Executar as tarefas nesta sessão com `superpowers:executing-plans`, testes por etapa e revisão final independente.

**Goal:** O agente consulta habilitação e acesso da conta, explica bloqueios conhecidos e não terceiriza essa verificação ao cliente.

**Architecture:** Reutilizar a resolução de workspace/contrato e permissões no backend em cada turno. Entregar ao Harness um snapshot autoritativo de disponibilidade separado do conhecimento comum. Filtrar capacidades e pacotes elegíveis; orientar e validar a resposta para impedir perguntas sobre fatos de configuração do sistema, preservando perguntas de negócio e consentimento.

**Tech Stack:** TypeScript/Fastify/Postgres, Python/Pydantic, Vitest/unittest; provedores simulados.

**Spec:** Pedido e imagem do usuário em 26/10/2026. Conhecimento estratégico comum; configuração e dados da empresa restritos à conta atual.

## Global Constraints

- Preservar o checkout primário e alterações simultâneas de Projetos.
- Não habilitar módulos, ampliar permissões, mudar allowlists, aprovar ações ou realizar chamadas pagas para validar.
- Snapshot representa elegibilidade e configuração, nunca consentimento ou aprovação de uma ação concreta.
- Falha de consulta não equivale a módulo desabilitado nem pode ser resolvida por um “sim” do cliente.
- Não expor infraestrutura, fornecedores, prompts ou dados de outra conta nas respostas.

## Review Focus

- Cliente afirma que uma ferramenta está habilitada: registros do sistema prevalecem.
- Conta sem contrato ativo, contrato antigo ou de outra conta: nenhuma disponibilidade padrão inventada.
- Admin YUX, operador, administrador da conta e membro recebem capacidades compatíveis com acesso real.
- Radar habilitado no módulo mas bloqueado na integração: informar bloqueio de integração sem negar o conhecimento comum.
- Pergunta legítima de estratégia, pesquisa autorizada ou consentimento não pode desaparecer na proteção de resposta.

### Task 1: Resolver disponibilidade e integrar ao turno

**Files:** `backend/src/modules/action-engine/mission-account-availability.ts`, `context-builder.ts`, `radar-pack-registration.ts`, `backend/src/jobs/handlers/action-engine.ts`; testes `mission-account-availability.test.ts`, `mission-conversation-handler.test.ts`.

**Interfaces:** `resolveMissionAccountAccess(pool, env, {organizationId, actorId, contractId?})` produz contexto do workspace, módulos normalizados e permissões verificadas; `buildMissionAccountAvailability(...)` produz snapshot comercial com autoridade do servidor e elegibilidade por ferramenta. `resolveRadarMissionAvailability(...)` produz motivos explícitos usando os mesmos gates de `radarMissionAvailable`.

- [x] Criar testes de módulos/permissões, gates do Radar, conta/contrato e atualização em turnos posteriores; observar falha antes de implementar.
- [x] Implementar resolução e usar módulos reais, não o brief do modelo, para montar o manifesto e os pacotes. Incluir snapshot no hash operacional.
- [x] Executar testes focados e build do backend.

### Task 2: Usar o estado autoritativo na resposta

**Files:** `workers/marketing-studio-agent-runtime/yux_agent_runtime/mission_account_availability.py`, `mission_conversation.py`, `workflow.py`; testes `tests/test_mission_account_availability.py` e conversacionais existentes.

**Interfaces:** proteção da resposta recebe o snapshot do request e o JSON normalizado, remove apenas dúvidas de estado que pertencem ao sistema e apresenta uma explicação comercial baseada no snapshot. A validação estrita de fontes, ações, pacotes e aprovações continua vigente.

- [x] Reproduzir a pergunta da imagem em teste, incluindo resposta livre que repete a dúvida; preservar objetivo, público e consentimento.
- [x] Acrescentar instruções explícitas e proteção de resposta baseada no snapshot; não transformar disponibilidade em autorização de pesquisa ou contato.
- [x] Executar suíte Python do fluxo e testes de contrato.

### Task 3: Comprovar, revisar e publicar

- [x] Testar handler com banco real e runtime simulado, incluindo isolamento e troca de conta/contrato; nenhuma chamada externa paga.
- [x] Executar regressões apropriadas, tipos, contrato e revisão independente; registrar evidências.
- [x] Integrar com main sem descartar Projetos, publicar e conferir os serviços e o contexto real da conta sem enviar mensagens pagas.

## Ledger

- Base: `b3efb5a`; origin/main conferido em 26/10/2026. Checkout primário permanece intocado.
- Ruling: executar a correção diretamente, conforme pedido do usuário e autorização persistente de integração/publicação; não solicitar novamente aprovação do plano técnico.
- Backend: 1.517 testes passaram, 126 ignorados; teste adicional de conexões/snapshot passou; build passou. Integração com PostgreSQL 17 isolado e papel yux_worker passou para quatro perfis, HTTP de contexto, mudança de módulos e isolamento de contrato/conta; zero chamadas ao provedor.
- Runtime: suíte pytest passou (inclui contrato, fluxo com provedor simulado e proteção de resposta). Revisão independente encontrou duas condições, reproduzidas RED→GREEN: horários/ofertas devem permanecer como decisões de negócio; conexão not_connected/unverified deve permanecer como bloqueio técnico, explicado pelo sistema. Revisor confirmou a correção. Proteção cobre também a pendência de configuração sem cartão de pergunta.
- Publicação `707d1db` concluída. Papel real `yux_worker` resolveu a conta da conversa `0b969532-7daa-4030-a332-cdcff5cc7228`: Radar habilitado, mas integração com Missões não liberada para essa conta. Interno YUX: Radar habilitado e elegível. Banco e API pública responderam; prontidão autenticada do Harness: 200. Módulo de validação de Projetos preservado. A proteção foi executada no runtime instalado e preservou a pergunta de oferta; SHA-256 do arquivo em produção igual ao blob Git: `0db2ab89115c28ca0a53bc2af864073714658a1a4b17dc39fdb67add19badba9`. Nenhuma chamada paga nessa validação.
- Ruling: reconhecer `whatsapp_ai` na apresentação comercial de WhatsApp/Atendimento, mantendo intocados os requisitos `omnichannel`, manifesto, permissões e elegibilidade de execução. A revisão identificou que confundir os dois nomes gerava uma descrição falsa de módulo desabilitado. Teste RED reproduziu; correção limitada à apresentação da disponibilidade.
